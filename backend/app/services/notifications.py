"""Notification service - creates notifications and mocks email sending"""

import logging

from sqlalchemy.orm import Session

from ..models import Notification, Application, ApplicationStatus

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    application_id: int,
    recipient_id: str,
    recipient_role: str,
    message: str,
    notification_type: str,
) -> Notification:
    """Create a notification record and mock-send email"""
    notification = Notification(
        application_id=application_id,
        recipient_id=recipient_id,
        recipient_role=recipient_role,
        message=message,
        notification_type=notification_type,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    # Mock email sending - just log it
    logger.info(
        f"[MOCK EMAIL] To: {recipient_id} ({recipient_role}) | "
        f"Type: {notification_type} | Message: {message}"
    )

    return notification


def notify_status_change(
    db: Session,
    application: Application,
    new_status: ApplicationStatus,
    changed_by_role: str,
) -> list[Notification]:
    """Send notifications when status changes"""
    notifications = []

    # Notify operator when officer changes status
    if changed_by_role == "officer":
        notif = create_notification(
            db=db,
            application_id=application.id,
            recipient_id=application.operator_id,
            recipient_role="operator",
            message=f"Your application status has been updated to: {new_status.value}",
            notification_type="status_change",
        )
        notifications.append(notif)

    # Notify assigned officer when operator resubmits
    if changed_by_role == "operator" and application.assigned_officer_id:
        if new_status in [
            ApplicationStatus.PRE_SITE_RESUBMITTED,
            ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED,
        ]:
            notif = create_notification(
                db=db,
                application_id=application.id,
                recipient_id=application.assigned_officer_id,
                recipient_role="officer",
                message=f"Application #{application.id} has been resubmitted and is ready for review",
                notification_type="resubmission",
            )
            notifications.append(notif)

    return notifications


def notify_comment_added(
    db: Session,
    application: Application,
    officer_id: str,
) -> Notification:
    """Notify operator when officer adds a comment"""
    return create_notification(
        db=db,
        application_id=application.id,
        recipient_id=application.operator_id,
        recipient_role="operator",
        message=f"An officer has added feedback to your application. Please review and address the comments.",
        notification_type="comment_added",
    )
