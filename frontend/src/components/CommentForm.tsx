import { useState } from "react";
import type { Comment, CommentCreate, FormSection } from "../types";
import { FormSection as FormSectionEnum, SECTION_LABELS } from "../types";
import { createComment } from "../api/client";

interface CommentFormProps {
  applicationId: number;
  onCommentAdded: (comment: Comment) => void;
  defaultSection?: FormSection;
}

// Predefined comment templates for common issues
const COMMENT_TEMPLATES = [
  { label: "Document expired", content: "The uploaded document has expired. Please provide a current version." },
  { label: "Image unclear", content: "The uploaded image is unclear or blurry. Please upload a clearer copy." },
  { label: "Information mismatch", content: "The information in this document does not match the application details. Please verify and resubmit." },
  { label: "Missing pages", content: "The document appears to be incomplete or missing pages. Please upload the full document." },
  { label: "Wrong document type", content: "The uploaded document is not the correct type for this section. Please upload the correct document." },
];

export function CommentForm({
  applicationId,
  onCommentAdded,
  defaultSection,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [section, setSection] = useState<FormSection | "">(defaultSection || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data: CommentCreate = {
        content: content.trim(),
        section: section || undefined,
      };
      const comment = await createComment(applicationId, data);
      onCommentAdded(comment);
      setContent("");
      setSection(defaultSection || "");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyTemplate = (template: string) => {
    setContent(template);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Template buttons */}
      <div className="flex flex-wrap gap-2">
        {COMMENT_TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => applyTemplate(template.content)}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            {template.label}
          </button>
        ))}
      </div>

      {/* Section selector */}
      <select
        value={section}
        onChange={(e) => setSection(e.target.value as FormSection | "")}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">General comment (no section)</option>
        {Object.values(FormSectionEnum).map((sec) => (
          <option key={sec} value={sec}>
            {SECTION_LABELS[sec]}
          </option>
        ))}
      </select>

      {/* Comment textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter your feedback..."
        rows={3}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        disabled={isSubmitting}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting || !content.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Adding..." : "Add Comment"}
      </button>
    </form>
  );
}
