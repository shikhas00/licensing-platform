// Status constants matching backend (using const objects for TypeScript erasableSyntaxOnly)

export const ApplicationStatus = {
  APPLICATION_RECEIVED: "Application Received",
  UNDER_REVIEW: "Under Review",
  PENDING_PRE_SITE_RESUBMISSION: "Pending Pre-Site Resubmission",
  PRE_SITE_RESUBMITTED: "Pre-Site Resubmitted",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_DONE: "Site Visit Done",
  AWAITING_POST_SITE_CLARIFICATION: "Awaiting Post-Site Clarification",
  PENDING_POST_SITE_RESUBMISSION: "Pending Post-Site Resubmission",
  POST_SITE_CLARIFICATION_RESUBMITTED: "Post-Site Clarification Resubmitted",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const AIVerificationStatus = {
  PENDING: "pending",
  VERIFIED: "verified",
  FLAGGED: "flagged",
  FAILED: "failed",
} as const;

export type AIVerificationStatus = (typeof AIVerificationStatus)[keyof typeof AIVerificationStatus];

export const FormSection = {
  BUSINESS_INFO: "business_info",
  CONTACT_INFO: "contact_info",
  ADDRESS: "address",
  BUSINESS_LICENSE: "business_license",
  FLOOR_PLAN: "floor_plan",
  ID_PROOF: "id_proof",
  INSURANCE: "insurance",
  OTHER: "other",
} as const;

export type FormSection = (typeof FormSection)[keyof typeof FormSection];

// Status display labels for different roles
export const OPERATOR_STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.APPLICATION_RECEIVED]: "Submitted",
  [ApplicationStatus.UNDER_REVIEW]: "Under Review",
  [ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION]: "Pending Pre-Site Resubmission",
  [ApplicationStatus.PRE_SITE_RESUBMITTED]: "Pre-Site Resubmitted",
  [ApplicationStatus.SITE_VISIT_SCHEDULED]: "Pending Site Visit",
  [ApplicationStatus.SITE_VISIT_DONE]: "Pending Post-Site Clarification",
  [ApplicationStatus.AWAITING_POST_SITE_CLARIFICATION]: "Pending Post-Site Clarification",
  [ApplicationStatus.PENDING_POST_SITE_RESUBMISSION]: "Pending Post-Site Resubmission",
  [ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED]: "Post-Site Resubmitted",
  [ApplicationStatus.PENDING_APPROVAL]: "Pending Approval",
  [ApplicationStatus.APPROVED]: "Approved",
  [ApplicationStatus.REJECTED]: "Rejected",
};

export const OFFICER_STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.APPLICATION_RECEIVED]: "Application Received",
  [ApplicationStatus.UNDER_REVIEW]: "Under Review",
  [ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION]: "Pending Pre-Site Resubmission",
  [ApplicationStatus.PRE_SITE_RESUBMITTED]: "Pre-Site Resubmitted",
  [ApplicationStatus.SITE_VISIT_SCHEDULED]: "Site Visit Scheduled",
  [ApplicationStatus.SITE_VISIT_DONE]: "Site Visit Done",
  [ApplicationStatus.AWAITING_POST_SITE_CLARIFICATION]: "Awaiting Post-Site Clarification",
  [ApplicationStatus.PENDING_POST_SITE_RESUBMISSION]: "Awaiting Post-Site Resubmission",
  [ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED]: "Post-Site Clarification Resubmitted",
  [ApplicationStatus.PENDING_APPROVAL]: "Route to Approval",
  [ApplicationStatus.APPROVED]: "Approved",
  [ApplicationStatus.REJECTED]: "Rejected",
};

// Section labels for display
export const SECTION_LABELS: Record<FormSection, string> = {
  [FormSection.BUSINESS_INFO]: "Business Information",
  [FormSection.CONTACT_INFO]: "Contact Information",
  [FormSection.ADDRESS]: "Address",
  [FormSection.BUSINESS_LICENSE]: "Business License",
  [FormSection.FLOOR_PLAN]: "Floor Plan",
  [FormSection.ID_PROOF]: "ID Proof",
  [FormSection.INSURANCE]: "Insurance",
  [FormSection.OTHER]: "Other",
};

// API response types

export interface Document {
  id: number;
  application_id: number;
  filename: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  section: FormSection;
  ai_verification_status: AIVerificationStatus;
  ai_verification_message: string | null;
  revision_number: number;
  is_current: boolean;
  is_draft: boolean;
  is_pending_deletion: boolean;
  supersedes_id: number | null;
  uploaded_at: string;
}

export interface Comment {
  id: number;
  application_id: number;
  officer_id: string;
  content: string;
  section: FormSection | null;
  document_id: number | null;
  revision_number: number;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolved_in_revision: number | null;
  created_at: string;
}

export interface ApplicationRevision {
  id: number;
  application_id: number;
  revision_number: number;
  business_name: string;
  business_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  submitted_by: string | null;
  submitted_at: string;
}

export interface StatusHistory {
  id: number;
  application_id: number;
  old_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_by: string;
  changed_by_role: string;
  reason: string | null;
  created_at: string;
}

export interface Application {
  id: number;
  operator_id: string;
  assigned_officer_id: string | null;
  business_name: string;
  business_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  status: ApplicationStatus;
  revision_number: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  documents: Document[];
  comments: Comment[];
}

export interface ApplicationListItem {
  id: number;
  operator_id: string;
  assigned_officer_id: string | null;
  business_name: string;
  status: ApplicationStatus;
  revision_number: number;
  created_at: string;
  updated_at: string;
  document_count: number;
  unresolved_comment_count: number;
}

export interface ApplicationDetail extends Application {
  revisions: ApplicationRevision[];
  status_history: StatusHistory[];
}

// Request types

export interface ApplicationCreate {
  business_name: string;
  business_type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
}

export interface ApplicationUpdate {
  business_name?: string;
  business_type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
}

export interface CommentCreate {
  content: string;
  section?: FormSection;
  document_id?: number;
}

export interface StatusUpdate {
  status: ApplicationStatus;
  reason?: string;
}

// User context (mocked auth)
export interface User {
  userId: string;
  role: "operator" | "officer";
}
