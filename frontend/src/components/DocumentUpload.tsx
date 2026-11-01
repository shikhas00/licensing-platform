import { useState, useCallback } from "react";
import type { Document, FormSection } from "../types";
import { SECTION_LABELS } from "../types";
import { uploadDocument, downloadDocument } from "../api/client";
import { VerificationBadge } from "./VerificationBadge";

// Must match backend SECTION_ALLOWED_TYPES in services/document_service.py
const SECTION_ALLOWED_TYPES: Record<FormSection, string[]> = {
  business_license: ["pdf"],
  floor_plan: ["pdf", "jpg", "jpeg", "png"],
  id_proof: ["pdf", "jpg", "jpeg", "png"],
  insurance: ["pdf"],
  business_info: ["pdf"],
  contact_info: ["pdf"],
  address: ["pdf"],
  other: ["pdf", "jpg", "jpeg", "png"],
};

function getAllowedTypesDisplay(section: FormSection): string {
  const types = SECTION_ALLOWED_TYPES[section];
  const unique = [...new Set(types.map((t) => t.toUpperCase().replace("JPEG", "JPG")))];
  return unique.join(", ");
}

function getAcceptString(section: FormSection): string {
  return SECTION_ALLOWED_TYPES[section].map((t) => `.${t}`).join(",");
}

interface DocumentUploadProps {
  applicationId: number;
  section: FormSection;
  existingDocuments: Document[];
  onUploadComplete: (doc: Document) => void;
  disabled?: boolean;
}

export function DocumentUpload({
  applicationId,
  section,
  existingDocuments,
  onUploadComplete,
  disabled = false,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDocs = existingDocuments.filter(
    (d) => d.section === section && d.is_current
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        await handleUpload(files[0]);
      }
    },
    [disabled]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleUpload(files[0]);
    }
    // Reset input
    e.target.value = "";
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setIsUploading(true);

    try {
      // Find if replacing an existing document
      const existingDoc = currentDocs[0];
      const doc = await uploadDocument(
        applicationId,
        file,
        section,
        existingDoc?.id
      );
      onUploadComplete(doc);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h4 className="font-medium text-gray-900 mb-2">
        {SECTION_LABELS[section]}
      </h4>

      {/* Existing documents */}
      {currentDocs.length > 0 && (
        <div className="mb-3 space-y-2">
          {currentDocs.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center justify-between p-2 rounded ${
                doc.is_pending_deletion
                  ? "bg-red-50 border border-red-200"
                  : "bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadDocument(applicationId, doc.id, doc.filename)}
                  className={`hover:underline text-left ${
                    doc.is_pending_deletion
                      ? "text-red-600 hover:text-red-800 line-through"
                      : "text-blue-600 hover:text-blue-800"
                  }`}
                >
                  {doc.filename}
                </button>
                <span className="text-xs text-gray-400">
                  ({((doc.file_size || 0) / 1024).toFixed(1)} KB)
                </span>
                {doc.is_pending_deletion && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                    Pending deletion
                  </span>
                )}
              </div>
              <VerificationBadge
                status={doc.ai_verification_status}
                message={doc.ai_verification_message}
              />
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {!disabled && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging ? "border-blue-400 bg-blue-50" : "border-gray-300"}
            ${isUploading ? "opacity-50 cursor-wait" : "cursor-pointer hover:border-gray-400"}
          `}
        >
          <input
            type="file"
            id={`file-${section}`}
            className="hidden"
            onChange={handleFileSelect}
            accept={getAcceptString(section)}
            disabled={isUploading}
          />
          <label
            htmlFor={`file-${section}`}
            className="cursor-pointer"
          >
            {isUploading ? (
              <span className="text-gray-500">Uploading...</span>
            ) : (
              <>
                <span className="text-gray-500">
                  Drag & drop or{" "}
                  <span className="text-blue-600 hover:text-blue-700">
                    browse
                  </span>
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {getAllowedTypesDisplay(section)} (max 10MB)
                </p>
              </>
            )}
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
