"""Applications router - CRUD operations for license applications"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Application, ApplicationRevision, StatusHistory,
    ApplicationStatus, Document,
)
from ..schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse,
    ApplicationListResponse, ApplicationDetailResponse, StatusUpdate,
    DocumentResponse,
)
from ..services import get_valid_status_transitions, get_resubmission_status, notify_status_change
from ..utils import (
    get_current_user,
    require_application,
    check_editable_status,
    create_revision_snapshot,
    OPERATOR_EDITABLE_STATUSES,
)

router = APIRouter(prefix="/applications", tags=["applications"])


def build_application_response(application, current_user: dict) -> ApplicationResponse:
    """Build ApplicationResponse with properly filtered documents based on role."""
    # Filter documents: exclude deleted, and for officers exclude drafts
    if current_user["role"] == "officer":
        # Officers see pending deletions until operator resubmits (when deletion is committed)
        filtered_docs = [
            d for d in application.documents
            if d.is_current and not d.is_deleted and not d.is_draft
        ]
    else:
        filtered_docs = [
            d for d in application.documents
            if d.is_current and not d.is_deleted
        ]

    return ApplicationResponse(
        id=application.id,
        operator_id=application.operator_id,
        assigned_officer_id=application.assigned_officer_id,
        business_name=application.business_name,
        business_type=application.business_type,
        contact_name=application.contact_name,
        contact_email=application.contact_email,
        contact_phone=application.contact_phone,
        address=application.address,
        status=application.status,
        revision_number=application.revision_number,
        created_at=application.created_at,
        updated_at=application.updated_at,
        submitted_at=application.submitted_at,
        documents=filtered_docs,
        comments=application.comments,
    )


@router.post("/", response_model=ApplicationResponse, status_code=201)
def create_application(
    application: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new application (operator only)"""
    if current_user["role"] != "operator":
        raise HTTPException(status_code=403, detail="Only operators can create applications")

    # Create application (revision snapshot created on first submit, not here)
    db_application = Application(
        operator_id=current_user["user_id"],
        **application.model_dump(),
    )
    db.add(db_application)
    db.commit()
    db.refresh(db_application)

    # Create initial status history (but NOT revision snapshot - that's on submit)
    status_entry = StatusHistory(
        application_id=db_application.id,
        old_status=None,
        new_status=ApplicationStatus.APPLICATION_RECEIVED,
        changed_by=current_user["user_id"],
        changed_by_role="operator",
        reason="Application created",
    )
    db.add(status_entry)

    db.commit()
    db.refresh(db_application)

    return build_application_response(db_application, current_user)


@router.get("/", response_model=list[ApplicationListResponse])
def list_applications(
    status: Optional[ApplicationStatus] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List applications - operators see their own, officers see submitted only"""
    query = db.query(Application).filter(Application.is_deleted == False)

    # Operators only see their own applications (including drafts)
    if current_user["role"] == "operator":
        query = query.filter(Application.operator_id == current_user["user_id"])
    else:
        # Officers only see submitted applications
        query = query.filter(Application.submitted_at != None)

    # Filter by status if provided
    if status:
        query = query.filter(Application.status == status)

    applications = query.order_by(Application.updated_at.desc()).all()

    # Build response with counts
    result = []
    for app in applications:
        current_docs = [d for d in app.documents if d.is_current and not d.is_deleted]
        unresolved_comments = [c for c in app.comments if not c.is_resolved]

        result.append(ApplicationListResponse(
            id=app.id,
            operator_id=app.operator_id,
            assigned_officer_id=app.assigned_officer_id,
            business_name=app.business_name,
            status=app.status,
            revision_number=app.revision_number,
            created_at=app.created_at,
            updated_at=app.updated_at,
            document_count=len(current_docs),
            unresolved_comment_count=len(unresolved_comments),
        ))

    return result


@router.get("/{application_id}", response_model=ApplicationDetailResponse)
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get application details with full history"""
    application = require_application(application_id, db, current_user)

    # Filter to current documents only for response
    # Officers don't see draft documents (uncommitted changes from operator)
    if current_user["role"] == "officer":
        # Officers see pending deletions until operator resubmits (when deletion is committed)
        current_documents = [
            d for d in application.documents
            if d.is_current and not d.is_deleted and not d.is_draft
        ]
    else:
        current_documents = [d for d in application.documents if d.is_current and not d.is_deleted]

    # Officers see the last committed revision's form data, not draft edits
    # This ensures they only see changes after operator resubmits
    if current_user["role"] == "officer" and application.revisions:
        # Get the latest revision (highest revision_number)
        latest_revision = max(application.revisions, key=lambda r: r.revision_number)
        return ApplicationDetailResponse(
            id=application.id,
            operator_id=application.operator_id,
            assigned_officer_id=application.assigned_officer_id,
            business_name=latest_revision.business_name,
            business_type=latest_revision.business_type,
            contact_name=latest_revision.contact_name,
            contact_email=latest_revision.contact_email,
            contact_phone=latest_revision.contact_phone,
            address=latest_revision.address,
            status=application.status,
            revision_number=application.revision_number,
            created_at=application.created_at,
            updated_at=application.updated_at,
            submitted_at=application.submitted_at,
            documents=current_documents,
            comments=application.comments,
            revisions=application.revisions,
            status_history=application.status_history,
        )

    return ApplicationDetailResponse(
        id=application.id,
        operator_id=application.operator_id,
        assigned_officer_id=application.assigned_officer_id,
        business_name=application.business_name,
        business_type=application.business_type,
        contact_name=application.contact_name,
        contact_email=application.contact_email,
        contact_phone=application.contact_phone,
        address=application.address,
        status=application.status,
        revision_number=application.revision_number,
        created_at=application.created_at,
        updated_at=application.updated_at,
        submitted_at=application.submitted_at,
        documents=current_documents,
        comments=application.comments,
        revisions=application.revisions,
        status_history=application.status_history,
    )


@router.put("/{application_id}", response_model=ApplicationResponse)
def update_application(
    application_id: int,
    update: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update application (save changes) - operator only when status allows"""
    if current_user["role"] != "operator":
        raise HTTPException(status_code=403, detail="Only operators can update applications")

    application = require_application(application_id, db, current_user, require_owner=True)
    check_editable_status(application)

    # Update application fields (but don't change status or create revision - that's on submit)
    # exclude_none prevents explicit null from overwriting non-nullable DB columns
    update_data = update.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in update_data.items():
        setattr(application, field, value)

    db.commit()
    db.refresh(application)

    return build_application_response(application, current_user)


@router.patch("/{application_id}/status", response_model=ApplicationResponse)
def update_status(
    application_id: int,
    status_update: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update application status (officer only)"""
    if current_user["role"] != "officer":
        raise HTTPException(status_code=403, detail="Only officers can change status")

    application = require_application(application_id, db, current_user)

    # Block status changes before initial submission
    if not application.submitted_at:
        raise HTTPException(
            status_code=400,
            detail="Cannot change status before operator submits the application"
        )

    # Validate status transition
    valid_transitions = get_valid_status_transitions(application.status, "officer")
    if status_update.status not in valid_transitions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition from {application.status.value} to {status_update.status.value}"
        )

    old_status = application.status
    application.status = status_update.status

    # Assign officer if not already assigned
    if not application.assigned_officer_id:
        application.assigned_officer_id = current_user["user_id"]

    # Record status change
    status_entry = StatusHistory(
        application_id=application.id,
        old_status=old_status,
        new_status=status_update.status,
        changed_by=current_user["user_id"],
        changed_by_role="officer",
        reason=status_update.reason,
    )
    db.add(status_entry)

    # Notify operator
    notify_status_change(db, application, status_update.status, "officer")

    db.commit()
    db.refresh(application)

    return build_application_response(application, current_user)


@router.post("/{application_id}/submit", response_model=ApplicationResponse)
def submit_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Submit or resubmit an application.

    For initial submission: sets submitted_at timestamp
    For resubmission: creates new revision, commits draft documents, updates status, notifies officer
    """
    if current_user["role"] != "operator":
        raise HTTPException(status_code=403, detail="Only operators can submit applications")

    application = require_application(application_id, db, current_user, require_owner=True)

    from datetime import datetime, timezone

    # Check if this is a resubmission (status is pending resubmission)
    is_resubmission = application.status in [
        ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
        ApplicationStatus.PENDING_POST_SITE_RESUBMISSION,
    ]

    if is_resubmission:
        # Increment revision number
        application.revision_number += 1

        # Create revision snapshot with current form data
        create_revision_snapshot(db, application, current_user["user_id"])

        # Get draft documents that are being committed (exclude deleted drafts)
        draft_docs = db.query(Document).filter(
            Document.application_id == application_id,
            Document.is_draft == True,
            Document.is_deleted == False,
        ).all()

        # Mark superseded documents as non-current (deferred from upload to preserve officer view)
        # Also update document revision numbers to match the new application revision
        for doc in draft_docs:
            doc.revision_number = application.revision_number  # Fix: update doc revision
            if doc.supersedes_id:
                old_doc = db.query(Document).filter(
                    Document.id == doc.supersedes_id,
                    Document.application_id == application_id,
                ).first()
                if old_doc:
                    old_doc.is_current = False

        # Clear draft flag on non-deleted documents - they are now committed
        db.query(Document).filter(
            Document.application_id == application_id,
            Document.is_draft == True,
            Document.is_deleted == False,
        ).update({"is_draft": False})

        # Commit pending deletions - these documents are now fully deleted
        db.query(Document).filter(
            Document.application_id == application_id,
            Document.is_pending_deletion == True,
        ).update({
            "is_deleted": True,
            "is_current": False,
            "is_pending_deletion": False,
        })

        # Determine new status
        old_status = application.status
        new_status = get_resubmission_status(old_status)
        application.status = new_status

        # Record status change
        status_entry = StatusHistory(
            application_id=application.id,
            old_status=old_status,
            new_status=new_status,
            changed_by=current_user["user_id"],
            changed_by_role="operator",
            reason="Resubmission",
        )
        db.add(status_entry)

        # Notify officer
        notify_status_change(db, application, new_status, "operator")

    else:
        # Initial submission or re-submit in APPLICATION_RECEIVED (before officer reviews)
        if not application.submitted_at:
            application.submitted_at = datetime.now(timezone.utc)
            # Create initial revision snapshot at first submission (not at creation)
            create_revision_snapshot(db, application, current_user["user_id"])
        elif application.status == ApplicationStatus.APPLICATION_RECEIVED:
            # Only allow updating revision 1 if still in APPLICATION_RECEIVED
            # Once officer starts review or approves, revision history is immutable
            existing_revision = db.query(ApplicationRevision).filter(
                ApplicationRevision.application_id == application.id,
                ApplicationRevision.revision_number == 1,
            ).first()

            if existing_revision:
                existing_revision.business_name = application.business_name
                existing_revision.business_type = application.business_type
                existing_revision.contact_name = application.contact_name
                existing_revision.contact_email = application.contact_email
                existing_revision.contact_phone = application.contact_phone
                existing_revision.address = application.address
                existing_revision.submitted_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(application)

    return build_application_response(application, current_user)


@router.get("/{application_id}/revisions/{revision_number}")
def get_revision(
    application_id: int,
    revision_number: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific revision of an application for comparison"""
    require_application(application_id, db, current_user)  # Validates access

    revision = db.query(ApplicationRevision).filter(
        ApplicationRevision.application_id == application_id,
        ApplicationRevision.revision_number == revision_number,
    ).first()

    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")

    return revision
