import { useState } from "react";
import type { Comment, FormSection } from "../types";
import { SECTION_LABELS } from "../types";
import { resolveComment } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface CommentListProps {
  applicationId: number;
  comments: Comment[];
  onCommentResolved?: (comment: Comment) => void;
  filterSection?: FormSection;
  showResolved?: boolean;
}

export function CommentList({
  applicationId,
  comments,
  onCommentResolved,
  filterSection,
  showResolved = true,
}: CommentListProps) {
  const { user } = useAuth();
  const [resolving, setResolving] = useState<number | null>(null);

  // Filter comments
  let filtered = comments;
  if (filterSection) {
    filtered = filtered.filter((c) => c.section === filterSection);
  }
  if (!showResolved) {
    filtered = filtered.filter((c) => !c.is_resolved);
  }

  // Sort by creation date (newest first)
  filtered = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleResolve = async (commentId: number) => {
    setResolving(commentId);
    try {
      const updated = await resolveComment(applicationId, commentId, true);
      onCommentResolved?.(updated);
    } catch (err) {
      console.error("Failed to resolve comment:", err);
    } finally {
      setResolving(null);
    }
  };

  if (filtered.length === 0) {
    return (
      <p className="text-gray-500 text-sm italic">No comments</p>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((comment) => (
        <div
          key={comment.id}
          className={`p-3 rounded-lg border ${
            comment.is_resolved
              ? "bg-gray-50 border-gray-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {comment.section && (
                <span className="text-xs font-medium text-gray-500 block mb-1">
                  {SECTION_LABELS[comment.section]}
                </span>
              )}
              <p className={`text-sm ${comment.is_resolved ? "text-gray-600" : "text-gray-900"}`}>
                {comment.content}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <span>Officer {comment.officer_id}</span>
                <span>-</span>
                <span>Rev. {comment.revision_number}</span>
                <span>-</span>
                <span>{new Date(comment.created_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {comment.is_resolved ? (
                <span className="text-xs text-green-600 font-medium">
                  Resolved
                </span>
              ) : (
                user?.role === "officer" && (
                  <button
                    onClick={() => handleResolve(comment.id)}
                    disabled={resolving === comment.id}
                    className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                  >
                    {resolving === comment.id ? "..." : "Mark Resolved"}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
