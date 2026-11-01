from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator

from .models import ApplicationStatus, AIVerificationStatus, FormSection


# --- Base schemas (shared fields) ---

class ApplicationBase(BaseModel):
    business_name: str
    business_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None


class DocumentBase(BaseModel):
    section: FormSection
    filename: str


class CommentBase(BaseModel):
    content: str
    section: Optional[FormSection] = None
    document_id: Optional[int] = None


# --- Create schemas (for POST requests) ---

class ApplicationCreate(ApplicationBase):
    """Used when operator submits a new application"""

    @field_validator("business_name")
    @classmethod
    def business_name_not_empty(cls, v):
        """business_name is required and cannot be empty"""
        if not v or not v.strip():
            raise ValueError("business_name cannot be empty")
        return v


class ApplicationUpdate(BaseModel):
    """Used when operator resubmits - all fields optional except business_name cannot be empty"""
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None

    @field_validator("business_name")
    @classmethod
    def business_name_not_empty(cls, v):
        """business_name can be omitted (None) but not set to empty string"""
        if v is not None and v.strip() == "":
            raise ValueError("business_name cannot be empty")
        return v


class CommentCreate(CommentBase):
    """Used when officer adds a comment"""

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v):
        """comment content is required and cannot be empty"""
        if not v or not v.strip():
            raise ValueError("comment content cannot be empty")
        return v


class StatusUpdate(BaseModel):
    """Used when officer changes application status"""
    status: ApplicationStatus
    reason: Optional[str] = None


class CommentResolve(BaseModel):
    """Used when officer marks a comment as resolved"""
    is_resolved: bool = True


# --- Response schemas (for GET responses) ---

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    filename: str
    file_path: str
    file_type: Optional[str]
    file_size: Optional[int]
    section: FormSection
    ai_verification_status: AIVerificationStatus
    ai_verification_message: Optional[str]
    revision_number: int
    is_current: bool
    is_draft: bool = False
    is_pending_deletion: bool = False
    supersedes_id: Optional[int]
    uploaded_at: datetime


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    officer_id: str
    content: str
    section: Optional[FormSection]
    document_id: Optional[int]
    revision_number: int
    is_resolved: bool
    resolved_by: Optional[str]
    resolved_at: Optional[datetime]
    resolved_in_revision: Optional[int]
    created_at: datetime


class ApplicationRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    revision_number: int
    business_name: str
    business_type: Optional[str]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    submitted_by: Optional[str]
    submitted_at: datetime


class StatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    old_status: Optional[ApplicationStatus]
    new_status: ApplicationStatus
    changed_by: str
    changed_by_role: str
    reason: Optional[str]
    created_at: datetime


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    recipient_id: str
    recipient_role: str
    message: str
    notification_type: Optional[str]
    read_at: Optional[datetime]
    created_at: datetime


class ApplicationResponse(BaseModel):
    """Full application response with related data"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    operator_id: str
    assigned_officer_id: Optional[str]
    business_name: str
    business_type: Optional[str]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    status: ApplicationStatus
    revision_number: int
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]

    # Related data
    documents: list[DocumentResponse] = []
    comments: list[CommentResponse] = []


class ApplicationListResponse(BaseModel):
    """Simplified application for list views"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    operator_id: str
    assigned_officer_id: Optional[str]
    business_name: str
    status: ApplicationStatus
    revision_number: int
    created_at: datetime
    updated_at: datetime

    # Counts for quick overview
    document_count: int = 0
    unresolved_comment_count: int = 0


class ApplicationDetailResponse(ApplicationResponse):
    """Full application with revision history"""
    revisions: list[ApplicationRevisionResponse] = []
    status_history: list[StatusHistoryResponse] = []


# --- Status mapping for different views ---

class StatusDisplayResponse(BaseModel):
    """Shows status with role-appropriate label"""
    internal_status: ApplicationStatus
    display_label: str
