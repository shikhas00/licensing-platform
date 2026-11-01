"""Status mapping service - maps internal status to officer/operator display labels"""

from ..models import ApplicationStatus

# Officer sees internal status labels (same as internal)
OFFICER_STATUS_LABELS: dict[ApplicationStatus, str] = {
    ApplicationStatus.APPLICATION_RECEIVED: "Application Received",
    ApplicationStatus.UNDER_REVIEW: "Under Review",
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION: "Pending Pre-Site Resubmission",
    ApplicationStatus.PRE_SITE_RESUBMITTED: "Pre-Site Resubmitted",
    ApplicationStatus.SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
    ApplicationStatus.SITE_VISIT_DONE: "Site Visit Done",
    ApplicationStatus.AWAITING_POST_SITE_CLARIFICATION: "Awaiting Post-Site Clarification",
    ApplicationStatus.PENDING_POST_SITE_RESUBMISSION: "Awaiting Post-Site Resubmission",
    ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED: "Post-Site Clarification Resubmitted",
    ApplicationStatus.PENDING_APPROVAL: "Route to Approval",
    ApplicationStatus.APPROVED: "Approved",
    ApplicationStatus.REJECTED: "Rejected",
}

# Operator sees different labels for some statuses
OPERATOR_STATUS_LABELS: dict[ApplicationStatus, str] = {
    ApplicationStatus.APPLICATION_RECEIVED: "Submitted",
    ApplicationStatus.UNDER_REVIEW: "Under Review",
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION: "Pending Pre-Site Resubmission",
    ApplicationStatus.PRE_SITE_RESUBMITTED: "Pre-Site Resubmitted",
    ApplicationStatus.SITE_VISIT_SCHEDULED: "Pending Site Visit",
    ApplicationStatus.SITE_VISIT_DONE: "Pending Post-Site Clarification",
    ApplicationStatus.AWAITING_POST_SITE_CLARIFICATION: "Pending Post-Site Clarification",
    ApplicationStatus.PENDING_POST_SITE_RESUBMISSION: "Pending Post-Site Resubmission",
    ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED: "Post-Site Resubmitted",
    ApplicationStatus.PENDING_APPROVAL: "Pending Approval",
    ApplicationStatus.APPROVED: "Approved",
    ApplicationStatus.REJECTED: "Rejected",
}


def get_status_label(status: ApplicationStatus, role: str) -> str:
    """Get display label for a status based on user role"""
    if role == "officer":
        return OFFICER_STATUS_LABELS.get(status, status.value)
    return OPERATOR_STATUS_LABELS.get(status, status.value)


def get_valid_status_transitions(current_status: ApplicationStatus, role: str) -> list[ApplicationStatus]:
    """Get valid status transitions based on current status and role.

    Note: Site visit flow (Use Case 3) is out of scope for MVP.
    Entry into SITE_VISIT_SCHEDULED and related states is disabled to prevent
    applications from being trapped in states with no exit transitions.
    """
    # Officers can change status according to workflow
    if role == "officer":
        transitions = {
            ApplicationStatus.APPLICATION_RECEIVED: [
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.UNDER_REVIEW: [
                ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
                # SITE_VISIT_SCHEDULED disabled - Use Case 3 out of scope
                ApplicationStatus.PENDING_APPROVAL,
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.PRE_SITE_RESUBMITTED: [
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,  # Request more changes
                # SITE_VISIT_SCHEDULED disabled - Use Case 3 out of scope
                ApplicationStatus.PENDING_APPROVAL,
                ApplicationStatus.REJECTED,
            ],
            # Site visit states (Use Case 3) - disabled for MVP
            # If somehow entered, allow exit to prevent trap
            ApplicationStatus.SITE_VISIT_SCHEDULED: [
                ApplicationStatus.PENDING_APPROVAL,  # Emergency exit
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.SITE_VISIT_DONE: [
                ApplicationStatus.PENDING_APPROVAL,  # Emergency exit
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.AWAITING_POST_SITE_CLARIFICATION: [
                ApplicationStatus.PENDING_APPROVAL,  # Emergency exit
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED: [
                ApplicationStatus.UNDER_REVIEW,  # Back to review (matches frontend)
                ApplicationStatus.PENDING_POST_SITE_RESUBMISSION,  # Request more changes
                ApplicationStatus.PENDING_APPROVAL,
                ApplicationStatus.REJECTED,
            ],
            ApplicationStatus.PENDING_APPROVAL: [
                ApplicationStatus.APPROVED,
                ApplicationStatus.REJECTED,
            ],
        }
        return transitions.get(current_status, [])

    # Operators can only resubmit when in pending resubmission status
    if role == "operator":
        transitions = {
            ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION: [
                ApplicationStatus.PRE_SITE_RESUBMITTED,
            ],
            ApplicationStatus.PENDING_POST_SITE_RESUBMISSION: [
                ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED,
            ],
        }
        return transitions.get(current_status, [])

    return []


# Auto-transition mapping for operator resubmissions
RESUBMISSION_TRANSITIONS: dict[ApplicationStatus, ApplicationStatus] = {
    ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION: ApplicationStatus.PRE_SITE_RESUBMITTED,
    ApplicationStatus.PENDING_POST_SITE_RESUBMISSION: ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED,
}


def get_resubmission_status(current_status: ApplicationStatus) -> ApplicationStatus:
    """
    Get the new status after an operator resubmits an application.
    Returns the current status if no auto-transition applies.
    """
    return RESUBMISSION_TRANSITIONS.get(current_status, current_status)
