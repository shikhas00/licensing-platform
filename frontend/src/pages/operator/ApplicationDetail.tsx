import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { getApplication, submitApplication, updateApplication, getDocument } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { DocumentUpload } from "../../components/DocumentUpload";
import { CommentList } from "../../components/CommentList";
import type { ApplicationDetail, Document, ApplicationUpdate } from "../../types";
import { ApplicationStatus, FormSection, AIVerificationStatus } from "../../types";

// Helper to parse API error details (handles Pydantic v2 format)
function parseErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((e) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object" && "msg" in e) return String(e.msg);
      return "Validation error";
    }).join(", ");
  }
  return fallback;
}

export function OperatorApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editData, setEditData] = useState<ApplicationUpdate>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadApplication = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getApplication(parseInt(id));
      setApplication(data);
      setEditData({
        business_name: data.business_name,
        business_type: data.business_type || "",
        contact_name: data.contact_name || "",
        contact_email: data.contact_email || "",
        contact_phone: data.contact_phone || "",
        address: data.address || "",
      });
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

  // Poll for pending document verification status updates
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!application || !id) return;

    const pendingDocs = application.documents.filter(
      (d) => d.is_current && d.ai_verification_status === AIVerificationStatus.PENDING
    );

    if (pendingDocs.length === 0) {
      // No pending docs, clear any existing polling
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Poll for updates every 2 seconds
    const pollVerificationStatus = async () => {
      try {
        const updates = await Promise.all(
          pendingDocs.map((doc) => getDocument(parseInt(id), doc.id))
        );

        // Check if any document status changed
        const hasChanges = updates.some(
          (updated, i) =>
            updated.ai_verification_status !== pendingDocs[i].ai_verification_status
        );

        if (hasChanges) {
          // Update application state with new document statuses
          setApplication((prev) => {
            if (!prev) return prev;
            const updatedDocs = prev.documents.map((doc) => {
              const updated = updates.find((u) => u.id === doc.id);
              return updated || doc;
            });
            return { ...prev, documents: updatedDocs };
          });
        }
      } catch {
        // Silently ignore polling errors
      }

      // Continue polling if still mounted
      pollingRef.current = setTimeout(pollVerificationStatus, 2000);
    };

    pollingRef.current = setTimeout(pollVerificationStatus, 2000);

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [application, id]);

  const handleDocumentUploaded = (doc: Document) => {
    if (!application) return;
    // Update documents list
    const updatedDocs = application.documents.map((d) =>
      d.section === doc.section && d.is_current ? { ...d, is_current: false } : d
    );
    setApplication({
      ...application,
      documents: [...updatedDocs, doc],
    });
  };

  const handleSaveChanges = async () => {
    if (!application || !id) return;
    setIsSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      // Clean form data - remove empty strings for optional fields
      const cleanedData = Object.fromEntries(
        Object.entries(editData).filter(([_, v]) => v !== "")
      ) as ApplicationUpdate;
      await updateApplication(parseInt(id), cleanedData);
      // Reload full application to get updated revisions
      await loadApplication();
      setIsEditing(false);
      setSuccessMessage("Changes saved successfully");
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: unknown } } };
      setActionError(parseErrorDetail(error.response?.data?.detail, "Failed to save changes"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!application || !id) return;
    setIsSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await submitApplication(parseInt(id));
      // Reload full application to get updated revisions and status
      await loadApplication();
      setSuccessMessage("Application submitted successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: unknown } } };
      setActionError(parseErrorDetail(error.response?.data?.detail, "Failed to submit application"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if uploads are allowed
  const canUpload =
    application &&
    (application.status === ApplicationStatus.APPLICATION_RECEIVED ||
      application.status === ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION ||
      application.status === ApplicationStatus.PENDING_POST_SITE_RESUBMISSION);

  // Check if resubmission is needed
  const needsResubmission =
    application &&
    (application.status === ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION ||
      application.status === ApplicationStatus.PENDING_POST_SITE_RESUBMISSION);

  // Get unresolved comments
  const unresolvedComments =
    application?.comments.filter((c) => !c.is_resolved) || [];

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
          <h1 className="text-2xl font-bold text-gray-900">
            {application.business_name}
          </h1>
          <p className="text-gray-500 mt-1">
            Application #{application.id} - Revision {application.revision_number}
          </p>
        </div>
        <StatusBadge status={application.status} size="lg" />
      </div>

      {/* Action feedback messages */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{actionError}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Officer feedback alert */}
      {needsResubmission && unresolvedComments.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-medium text-amber-800 mb-2">
            Officer Feedback - Action Required
          </h3>
          <p className="text-sm text-amber-700 mb-3">
            Please review the comments below and update the flagged sections before resubmitting.
          </p>
          <CommentList
            applicationId={application.id}
            comments={unresolvedComments}
            showResolved={false}
          />
        </div>
      )}

      {/* Business Information */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Business Information
          </h2>
          {canUpload && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name
              </label>
              <input
                type="text"
                value={editData.business_name || ""}
                onChange={(e) =>
                  setEditData({ ...editData, business_name: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Type
              </label>
              <input
                type="text"
                value={editData.business_type || ""}
                onChange={(e) =>
                  setEditData({ ...editData, business_type: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={editData.contact_name || ""}
                  onChange={(e) =>
                    setEditData({ ...editData, contact_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editData.contact_email || ""}
                  onChange={(e) =>
                    setEditData({ ...editData, contact_email: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                value={editData.address || ""}
                onChange={(e) =>
                  setEditData({ ...editData, address: e.target.value })
                }
                rows={2}
                className="w-full px-3 py-2 border rounded-lg resize-none"
              />
            </div>
            <button
              onClick={handleSaveChanges}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : (
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
        )}
      </section>

      {/* Documents */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Documents</h2>

        <div className="grid grid-cols-2 gap-4">
          {Object.values(FormSection)
            .filter((s) => s !== FormSection.OTHER)
            .map((section) => (
              <DocumentUpload
                key={section}
                applicationId={application.id}
                section={section}
                existingDocuments={application.documents}
                onUploadComplete={handleDocumentUploaded}
                disabled={!canUpload}
              />
            ))}
        </div>
      </section>

      {/* All Comments */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Officer Comments
        </h2>
        <CommentList
          applicationId={application.id}
          comments={application.comments}
          showResolved={true}
        />
      </section>

      {/* Submit / Resubmit button */}
      {canUpload && (
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting
              ? "Submitting..."
              : needsResubmission
              ? "Resubmit Application"
              : "Submit Application"}
          </button>
        </div>
      )}

      {/* Status History */}
      {application.status_history.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Status History
          </h2>
          <div className="space-y-2">
            {application.status_history.map((history) => (
              <div
                key={history.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-2">
                  {history.old_status && (
                    <>
                      <span className="text-sm text-gray-500">
                        {history.old_status}
                      </span>
                      <span className="text-gray-400">\u2192</span>
                    </>
                  )}
                  <span className="text-sm font-medium">
                    {history.new_status}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(history.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
