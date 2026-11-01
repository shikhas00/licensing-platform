import type { ApplicationRevision, Document } from "../types";
import { SECTION_LABELS } from "../types";

interface RevisionComparisonProps {
  currentRevision: ApplicationRevision;
  previousRevision: ApplicationRevision | null;
  documents?: Document[];
  currentRevisionNumber: number;
}

interface FieldDiff {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  changed: boolean;
}

interface DocumentChange {
  section: string;
  sectionLabel: string;
  type: "added" | "replaced" | "unchanged";
  oldFilename?: string;
  newFilename?: string;
}

const FIELD_LABELS: Record<string, string> = {
  business_name: "Business Name",
  business_type: "Business Type",
  contact_name: "Contact Name",
  contact_email: "Email",
  contact_phone: "Phone",
  address: "Address",
};

export function RevisionComparison({
  currentRevision,
  previousRevision,
  documents = [],
  currentRevisionNumber,
}: RevisionComparisonProps) {
  const fields: (keyof ApplicationRevision)[] = [
    "business_name",
    "business_type",
    "contact_name",
    "contact_email",
    "contact_phone",
    "address",
  ];

  // Form field diffs
  const diffs: FieldDiff[] = fields.map((field) => {
    const oldValue = previousRevision ? String(previousRevision[field] ?? "") : null;
    const newValue = String(currentRevision[field] ?? "");
    return {
      field,
      label: FIELD_LABELS[field] || field,
      oldValue,
      newValue,
      changed: previousRevision ? oldValue !== newValue : false,
    };
  });

  // Document changes - find docs uploaded after the previous revision
  const documentChanges: DocumentChange[] = [];
  const currentDocs = documents.filter((d) => d.is_current);

  // Get the previous revision's submission time as cutoff
  const previousSubmittedAt = previousRevision?.submitted_at
    ? new Date(previousRevision.submitted_at).getTime()
    : 0;

  for (const doc of currentDocs) {
    const docUploadedAt = new Date(doc.uploaded_at).getTime();

    // Document was changed in this revision if uploaded after previous revision
    if (docUploadedAt > previousSubmittedAt) {
      if (doc.supersedes_id) {
        // Find the old document it replaced
        const oldDoc = documents.find((d) => d.id === doc.supersedes_id);
        documentChanges.push({
          section: doc.section,
          sectionLabel: SECTION_LABELS[doc.section] || doc.section,
          type: "replaced",
          oldFilename: oldDoc?.filename,
          newFilename: doc.filename,
        });
      } else if (currentRevisionNumber > 1) {
        // New document added in this revision (not initial upload)
        documentChanges.push({
          section: doc.section,
          sectionLabel: SECTION_LABELS[doc.section] || doc.section,
          type: "added",
          newFilename: doc.filename,
        });
      }
    }
  }

  const hasFieldChanges = diffs.some((d) => d.changed);
  const hasDocChanges = documentChanges.length > 0;
  const hasAnyChanges = hasFieldChanges || hasDocChanges;

  if (!previousRevision) {
    return (
      <div className="text-sm text-gray-500 italic">
        This is the initial submission (revision 1).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          Comparing revision {previousRevision.revision_number} → {currentRevision.revision_number}
        </span>
        {hasAnyChanges ? (
          <span className="text-amber-600 font-medium">
            {diffs.filter((d) => d.changed).length} field(s), {documentChanges.length} document(s) changed
          </span>
        ) : (
          <span className="text-gray-500">No changes</span>
        )}
      </div>

      {/* Form field changes */}
      {hasFieldChanges && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Form Changes</h4>
          <div className="border rounded-lg divide-y">
            {diffs.filter((d) => d.changed).map((diff) => (
              <div key={diff.field} className="p-3 bg-amber-50">
                <div className="text-sm font-medium text-gray-700 mb-1">
                  {diff.label}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 block">Previous</span>
                    <span className="text-red-600 line-through">
                      {diff.oldValue || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Current</span>
                    <span className="text-green-600">{diff.newValue || "-"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document changes */}
      {hasDocChanges && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Document Changes</h4>
          <div className="border rounded-lg divide-y">
            {documentChanges.map((change, idx) => (
              <div key={idx} className="p-3 bg-blue-50">
                <div className="text-sm font-medium text-gray-700 mb-1">
                  {change.sectionLabel}
                  <span className="ml-2 text-xs text-blue-600 font-normal">
                    ({change.type})
                  </span>
                </div>
                {change.type === "replaced" ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-gray-400 block">Previous</span>
                      <span className="text-red-600 line-through">
                        {change.oldFilename}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Current</span>
                      <span className="text-green-600">{change.newFilename}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-green-600">
                    + {change.newFilename}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasAnyChanges && (
        <div className="text-sm text-gray-500 italic">
          No changes to form data or documents in this revision.
        </div>
      )}
    </div>
  );
}
