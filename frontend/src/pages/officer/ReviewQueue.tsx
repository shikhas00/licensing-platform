import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApplications } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import type { ApplicationListItem, ApplicationStatus } from "../../types";
import { ApplicationStatus as Status } from "../../types";

// Helper functions for status grouping
function isNeedsReview(status: ApplicationStatus): boolean {
  return (
    status === Status.APPLICATION_RECEIVED ||
    status === Status.PRE_SITE_RESUBMITTED ||
    status === Status.POST_SITE_CLARIFICATION_RESUBMITTED
  );
}

function isInProgress(status: ApplicationStatus): boolean {
  return (
    status === Status.UNDER_REVIEW ||
    status === Status.PENDING_PRE_SITE_RESUBMISSION ||
    status === Status.PENDING_POST_SITE_RESUBMISSION ||
    status === Status.PENDING_APPROVAL
  );
}

function isCompleted(status: ApplicationStatus): boolean {
  return status === Status.APPROVED || status === Status.REJECTED;
}

export function OfficerReviewQueue() {
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs_review" | "in_progress" | "completed">("all");

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const data = await getApplications();
      setApplications(data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  // Filter applications
  const filteredApps = applications.filter((app) => {
    if (filter === "all") return true;
    if (filter === "needs_review") return isNeedsReview(app.status);
    if (filter === "in_progress") return isInProgress(app.status);
    if (filter === "completed") return isCompleted(app.status);
    return true;
  });

  // Sort: needs review first, then by update date
  const sortedApps = [...filteredApps].sort((a, b) => {
    const aNeeds = isNeedsReview(a.status);
    const bNeeds = isNeedsReview(b.status);
    if (aNeeds && !bNeeds) return -1;
    if (!aNeeds && bNeeds) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Count by status group
  const counts = {
    needs_review: applications.filter((a) => isNeedsReview(a.status)).length,
    in_progress: applications.filter((a) => isInProgress(a.status)).length,
    completed: applications.filter((a) => isCompleted(a.status)).length,
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading applications...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadApplications}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Queue</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All ({applications.length})
        </button>
        <button
          onClick={() => setFilter("needs_review")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "needs_review"
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          Needs Review ({counts.needs_review})
        </button>
        <button
          onClick={() => setFilter("in_progress")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "in_progress"
              ? "bg-amber-600 text-white"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}
        >
          In Progress ({counts.in_progress})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "completed"
              ? "bg-green-600 text-white"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          }`}
        >
          Completed ({counts.completed})
        </button>
      </div>

      {sortedApps.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No applications match this filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Operator
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revision
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedApps.map((app) => (
                <tr
                  key={app.id}
                  className={`hover:bg-gray-50 ${
                    isNeedsReview(app.status) ? "bg-blue-50/30" : ""
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    #{app.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {app.business_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {app.operator_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={app.status} size="sm" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    v{app.revision_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {app.document_count} files
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(app.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link
                      to={`/officer/applications/${app.id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
