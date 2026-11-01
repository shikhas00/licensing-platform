import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Enum
)
from sqlalchemy.orm import relationship

from .database import Base


def utc_now():
    return datetime.now(timezone.utc)


class ApplicationStatus(str, enum.Enum):
    """Internal application statuses"""
    APPLICATION_RECEIVED = "Application Received"
    UNDER_REVIEW = "Under Review"
    PENDING_PRE_SITE_RESUBMISSION = "Pending Pre-Site Resubmission"
    PRE_SITE_RESUBMITTED = "Pre-Site Resubmitted"
    SITE_VISIT_SCHEDULED = "Site Visit Scheduled"
    SITE_VISIT_DONE = "Site Visit Done"
    AWAITING_POST_SITE_CLARIFICATION = "Awaiting Post-Site Clarification"
    PENDING_POST_SITE_RESUBMISSION = "Pending Post-Site Resubmission"
    POST_SITE_CLARIFICATION_RESUBMITTED = "Post-Site Clarification Resubmitted"
    PENDING_APPROVAL = "Pending Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class AIVerificationStatus(str, enum.Enum):
    """AI verification status for documents"""
    PENDING = "pending"
    VERIFIED = "verified"
    FLAGGED = "flagged"
    FAILED = "failed"


class FormSection(str, enum.Enum):
    """Valid form sections for comments and documents"""
    BUSINESS_INFO = "business_info"
    CONTACT_INFO = "contact_info"
    ADDRESS = "address"
    BUSINESS_LICENSE = "business_license"
    FLOOR_PLAN = "floor_plan"
    ID_PROOF = "id_proof"
    INSURANCE = "insurance"
    OTHER = "other"


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)

    # Operator info (mocked auth - just store IDs)
    operator_id = Column(String, index=True, nullable=False)

    # Officer assignment
    assigned_officer_id = Column(String, index=True, nullable=True)

    # Business info (current values)
    business_name = Column(String, nullable=False)
    business_type = Column(String)
    contact_name = Column(String)
    contact_email = Column(String)
    contact_phone = Column(String)
    address = Column(Text)

    # Application state - use Enum for type safety
    status = Column(
        Enum(ApplicationStatus),
        default=ApplicationStatus.APPLICATION_RECEIVED,
        index=True,
        nullable=False
    )
    revision_number = Column(Integer, default=1)

    # Soft delete
    is_deleted = Column(Boolean, default=False)

    # Timestamps (timezone-aware)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    submitted_at = Column(DateTime(timezone=True))

    # Relationships (no cascade delete - we never lose data)
    documents = relationship("Document", back_populates="application")
    comments = relationship("Comment", back_populates="application")
    revisions = relationship("ApplicationRevision", back_populates="application")
    status_history = relationship("StatusHistory", back_populates="application")
    notifications = relationship("Notification", back_populates="application")


class ApplicationRevision(Base):
    """Snapshot of form data at each revision - data is never lost"""
    __tablename__ = "application_revisions"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)

    # Snapshot of form data at this revision
    business_name = Column(String, nullable=False)
    business_type = Column(String)
    contact_name = Column(String)
    contact_email = Column(String)
    contact_phone = Column(String)
    address = Column(Text)

    # Who submitted this revision
    submitted_by = Column(String)  # operator_id
    submitted_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    application = relationship("Application", back_populates="revisions")


class StatusHistory(Base):
    """Audit trail for status changes"""
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)

    # Status change details
    old_status = Column(Enum(ApplicationStatus), nullable=True)  # null for initial
    new_status = Column(Enum(ApplicationStatus), nullable=False)
    changed_by = Column(String, nullable=False)  # officer_id or operator_id
    changed_by_role = Column(String, nullable=False)  # "officer" or "operator"
    reason = Column(Text)  # Optional reason for the change

    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    application = relationship("Application", back_populates="status_history")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)

    # File info
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String)  # e.g., "pdf", "jpg"
    file_size = Column(Integer)  # bytes

    # Which section this document belongs to - use Enum
    section = Column(Enum(FormSection), nullable=False)

    # AI verification (mocked)
    ai_verification_status = Column(
        Enum(AIVerificationStatus),
        default=AIVerificationStatus.PENDING
    )
    ai_verification_message = Column(Text)

    # Version tracking for resubmissions
    revision_number = Column(Integer, default=1)
    is_current = Column(Boolean, default=True)

    # Draft flag - documents are drafts until operator submits/resubmits
    is_draft = Column(Boolean, default=False)

    # Link to document this replaces (for clear replacement chain)
    supersedes_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    # Soft delete
    is_deleted = Column(Boolean, default=False)

    # Pending deletion - marked for deletion on next resubmit (so officers still see until then)
    is_pending_deletion = Column(Boolean, default=False)

    # Timestamps
    uploaded_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    application = relationship("Application", back_populates="documents")
    supersedes = relationship("Document", remote_side=[id])


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)

    # Officer info (mocked auth)
    officer_id = Column(String, nullable=False)

    # Comment content
    content = Column(Text, nullable=False)

    # Link to specific section or document - use Enum for section
    section = Column(Enum(FormSection), nullable=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    # Tracking - which revision this comment was made on
    revision_number = Column(Integer, nullable=False)

    # Resolution tracking - officer marks resolved after reviewing operator's response
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(String, nullable=True)  # officer_id who marked resolved
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_in_revision = Column(Integer, nullable=True)  # which round addressed it

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    application = relationship("Application", back_populates="comments")
    document = relationship("Document")


class Notification(Base):
    """Notifications for operators and officers"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)

    # Recipient info
    recipient_id = Column(String, nullable=False, index=True)  # user ID
    recipient_role = Column(String, nullable=False)  # "officer" or "operator"

    # Notification content
    message = Column(Text, nullable=False)
    notification_type = Column(String)  # e.g., "status_change", "comment_added"

    # Read status
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    application = relationship("Application", back_populates="notifications")
