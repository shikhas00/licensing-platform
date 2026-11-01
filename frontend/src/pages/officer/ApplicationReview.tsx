import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getApplication, updateApplicationStatus, downloadDocument } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { VerificationBadge } from "../../components/VerificationBadge";
import { CommentList } from "../../components/CommentList";
import { CommentForm } from "../../components/CommentForm";
import { RevisionComparison } from "../../components/RevisionComparison";
import type { ApplicationDetail, Comment, StatusUpdate, Document, FormSection } from "../../types";
import {
  ApplicationStatus,
  FormSection as FormSectionObj,
  SECTION_LABELS,
  AIVerificationStatus,
  OFFICER_STATUS_LABELS,
} from "../../types";

// Valid status transitions for officers
const OFFICER_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  [ApplicationStatus.APPLICATION_RECEIVED]: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.UNDER_REVIEW]: [
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
    ApplicationStatus.PENDING_APPROVAL,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.PRE_SITE_RESUBMITTED]: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
    ApplicationStatus.PENDING_APPROVAL,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED]: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.PENDING_POST_SITE_RESUBMISSION,
    ApplicationStatus.PENDING_APPROVAL,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.PENDING_APPROVAL]: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
  ],
};

export function OfficerApplicationReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const loadApplication = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getApplication(parseInt(id));
      setApplication(data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to load application");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  const handleStatusChange = async () => {
    if (!application || !id || !selectedStatus) return;
    setStatusChanging(true);
    try {
      const data: StatusUpdate = {
        status: selectedStatus,
        reason: statusReason || undefined,
      };
      await updateApplicationStatus(parseInt(id), data);
      // Reload full application to get updated status_history
      await loadApplication();
      setShowStatusModal(false);
      setSelectedStatus(null);
      setStatusReason("");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to update status");
    } finally {
      setStatusChanging(false);
    }
  };

  const handleCommentAdded = (comment: Comment) => {
    if (!application) return;
    setApplication({
      ...application,
      comments: [...application.comments, comment],
    });
  };

  const handleCommentResolved = (updated: Comment) => {
    if (!application) return;
    setApplication({
      ...application,
      comments: application.comments.map((c) =>
        c.id === updated.id ? updated : c
      ),
    });
  };

  // Get available transitions
  const availableTransitions = application
    ? OFFICER_TRANSITIONS[application.status] || []
    : [];

  // Group documents by section
  const documentsBySection: Partial<Record<FormSection, Document[]>> = application
    ? application.documents
        .filter((d) => d.is_current)
        .reduce((acc, doc) => {
          if (!acc[doc.section]) acc[doc.section] = [];
          acc[doc.section]!.push(doc);
          return acc;
        }, {} as Partial<Record<FormSection, Document[]>>)
    : {};

  // Check for AI verification issues
  const flaggedDocs = application?.documents.filter(
    (d) =>
      d.is_current &&
      (d.ai_verification_status === AIVerificationStatus.FLAGGED ||
        d.ai_verification_status === AIVerificationStatus.FAILED)
  ) || [];

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading application...</p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || "Application not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/officer/queue")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            \u2190 Back to Queue
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {application.business_name}
          </h1>
          <p className="text-gray-500 mt-1">
            Application #{application.id} - Revision {application.revision_number}
            {" - "}Operator: {application.operator_id}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge status={application.status} size="lg" />
          {availableTransitions.length > 0 && (
            <button
              onClick={() => setShowStatusModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Change Status
            </button>
          )}
        </div>
      </div>

      {/* AI Verification Alerts */}
      {flaggedDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-medium text-amber-800 mb-2">
            AI Verification Issues
          </h3>
          <ul className="space-y-1">
            {flaggedDocs.map((doc) => (
              <li key={doc.id} className="text-sm text-amber-700">
                <span className="font-medium">{SECTION_LABELS[doc.section]}:</span>{" "}
                {doc.ai_verification_message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Revision Comparison - show when this is a resubmission */}
      {application.revision_number > 1 && application.revisions.length > 1 && (() => {
        // Sort revisions by revision_number to ensure correct comparison
        const sortedRevisions = [...application.revisions].sort(
          (a, b) => a.revision_number - b.revision_number
        );
        const currentRev = sortedRevisions[sortedRevisions.length - 1];
        const previousRev = sortedRevisions[sortedRevisions.length - 2];
        return (
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              What Changed (Revision {currentRev.revision_number})
            </h2>
            <RevisionComparison
              currentRevision={currentRev}
              previousRevision={previousRev}
              documents={application.documents}
              currentRevisionNumber={application.revision_number}
            />
          </section>
        );
      })()}

      <div className="grid grid-cols-3 gap-6">
        {/* Main content - 2 cols */}
        <div className="col-span-2 space-y-6">
          {/* Business Information */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Business Information
            </h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Business Name</dt>
                <dd className="font-medium">{application.business_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Business Type</dt>
                <dd className="font-medium">{application.business_type || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Contact Name</dt>
                <dd className="font-medium">{application.contact_name || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-medium">{application.contact_email || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd className="font-medium">{application.contact_phone || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd className="font-medium">{application.address || "-"}</dd>
              </div>
            </dl>
          </section>

          {/* Documents by Section */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Documents</h2>

            <div className="space-y-4">
              {Object.values(FormSectionObj).map((section) => {
                const docs = documentsBySection[section] || [];
                return (
                  <div
                    key={section}
                    className="border rounded-lg p-4"
                  >
                    <h4 className="font-medium text-gray-900 mb-2">
                      {SECTION_LABELS[section]}
                    </h4>
                    {docs.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No document uploaded</p>
                    ) : (
                      <div className="space-y-2">
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => downloadDocument(application.id, doc.id, doc.filename)}
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left"
                              >
                                {doc.filename}
                              </button>
                              <span className="text-xs text-gray-400">
                                v{doc.revision_number}
                              </span>
                            </div>
                            <VerificationBadge
                              status={doc.ai_verification_status}
                              message={doc.ai_verification_message}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar - 1 col */}
        <div className="space-y-6">
          {/* Add Comment */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add Feedback</h3>
            <CommentForm
              applicationId={application.id}
              onCommentAdded={handleCommentAdded}
            />
          </section>

          {/* Comments */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">
              Comments ({application.comments.length})
            </h3>
            <CommentList
              applicationId={application.id}
              comments={application.comments}
              onCommentResolved={handleCommentResolved}
              showResolved={true}
            />
          </section>

          {/* Status History */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Status History</h3>
            <div className="space-y-2 text-sm">
              {application.status_history.map((history) => (
                <div
                  key={history.id}
                  className="py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {history.old_status && (
                      <>
                        <span className="text-gray-500">{history.old_status}</span>
                        <span className="text-gray-400">\u2192</span>
                      </>
                    )}
                    <span className="font-medium">{history.new_status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {history.changed_by} ({history.changed_by_role}) -{" "}
                    {new Date(history.created_at).toLocaleString()}
                  </div>
                  {history.reason && (
                    <p className="text-xs text-gray-600 mt-1 italic">
                      "{history.reason}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Change Application Status
            </h2>

            <div className="space-y-3 mb-4">
              {availableTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedStatus === status
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="font-medium">{OFFICER_STATUS_LABELS[status]}</span>
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                placeholder="Add a reason for this status change..."
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedStatus(null);
                  setStatusReason("");
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                disabled={!selectedStatus || statusChanging}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {statusChanging ? "Updating..." : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
