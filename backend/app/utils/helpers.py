"""Shared helper functions for routers"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Application, ApplicationRevision, ApplicationStatus


# Statuses where operators can edit/upload/delete
OPERATOR_EDITABLE_STATUSES = [
    ApplicationStatus.APPLICATION_RECEIVED,
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
    ApplicationStatus.PENDING_POST_SITE_RESUBMISSION,
]


def require_application(
    application_id: int,
    db: Session,
    current_user: dict,
    require_owner: bool = False,
) -> Application:
    """
    Fetch application by ID with access control.

    Args:
        application_id: The application ID to fetch
        db: Database session
        current_user: Current user dict with user_id and role
        require_owner: If True, only the owner (operator) can access

    Returns:
        Application instance

    Raises:
        HTTPException 404: If application not found
        HTTPException 403: If access denied
    """
    application = db.query(Application).filter(
        Application.id == application_id,
        Application.is_deleted == False,
    ).first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    if require_owner and application.operator_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user["role"] == "operator" and application.operator_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Officers cannot see unsubmitted applications (operators can see their own drafts)
    if current_user["role"] == "officer" and not application.submitted_at:
        raise HTTPException(status_code=404, detail="Application not found")

    return application


def check_editable_status(application: Application) -> None:
    """
    Check if application is in an editable status for operators.

    Raises:
        HTTPException 400: If status doesn't allow editing
    """
    if application.status not in OPERATOR_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot modify application in status: {application.status.value}"
        )


def create_revision_snapshot(
    db: Session,
    application: Application,
    submitted_by: str,
) -> ApplicationRevision:
    """
    Create a revision snapshot of the current application state.

    Args:
        db: Database session
        application: The application to snapshot
        submitted_by: User ID who submitted this revision

    Returns:
        The created ApplicationRevision (not yet committed)
    """
    revision = ApplicationRevision(
        application_id=application.id,
        revision_number=application.revision_number,
        business_name=application.business_name,
        business_type=application.business_type,
        contact_name=application.contact_name,
        contact_email=application.contact_email,
        contact_phone=application.contact_phone,
        address=application.address,
        submitted_by=submitted_by,
    )
    db.add(revision)
    return revision
