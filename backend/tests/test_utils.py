"""Tests for utility functions"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models import Application, ApplicationStatus
from app.utils.helpers import (
    OPERATOR_EDITABLE_STATUSES,
    require_application,
    check_editable_status,
)
from app.utils.auth import get_current_user


class TestAuth:
    """Tests for authentication utilities"""

    def test_get_current_user_operator(self):
        """Valid operator returns correct dict"""
        result = get_current_user(x_user_id="user-1", x_user_role="operator")
        assert result == {"user_id": "user-1", "role": "operator"}

    def test_get_current_user_officer(self):
        """Valid officer returns correct dict"""
        result = get_current_user(x_user_id="officer-1", x_user_role="officer")
        assert result == {"user_id": "officer-1", "role": "officer"}

    def test_get_current_user_invalid_role(self):
        """Invalid role raises 400"""
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(x_user_id="user-1", x_user_role="admin")
        assert exc_info.value.status_code == 400
        assert "Invalid role" in exc_info.value.detail


class TestHelpers:
    """Tests for helper functions"""

    def test_operator_editable_statuses(self):
        """Check the correct statuses are editable"""
        assert ApplicationStatus.APPLICATION_RECEIVED in OPERATOR_EDITABLE_STATUSES
        assert ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION in OPERATOR_EDITABLE_STATUSES
        assert ApplicationStatus.PENDING_POST_SITE_RESUBMISSION in OPERATOR_EDITABLE_STATUSES
        assert ApplicationStatus.UNDER_REVIEW not in OPERATOR_EDITABLE_STATUSES
        assert ApplicationStatus.APPROVED not in OPERATOR_EDITABLE_STATUSES

    def test_require_application_not_found(self, db_session):
        """Non-existent application raises 404"""
        current_user = {"user_id": "operator-1", "role": "operator"}
        with pytest.raises(HTTPException) as exc_info:
            require_application(999, db_session, current_user)
        assert exc_info.value.status_code == 404
        assert "Application not found" in exc_info.value.detail

    def test_require_application_operator_access_denied(self, db_session):
        """Operator cannot access another operator's application"""
        # Create an application owned by a different operator
        app = Application(
            operator_id="other-operator",
            business_name="Other Business",
        )
        db_session.add(app)
        db_session.commit()

        current_user = {"user_id": "operator-1", "role": "operator"}
        with pytest.raises(HTTPException) as exc_info:
            require_application(app.id, db_session, current_user)
        assert exc_info.value.status_code == 403
        assert "Access denied" in exc_info.value.detail

    def test_require_application_operator_own_app(self, db_session):
        """Operator can access their own application"""
        app = Application(
            operator_id="operator-1",
            business_name="My Business",
        )
        db_session.add(app)
        db_session.commit()

        current_user = {"user_id": "operator-1", "role": "operator"}
        result = require_application(app.id, db_session, current_user)
        assert result.id == app.id
        assert result.business_name == "My Business"

    def test_require_application_officer_can_access_any(self, db_session):
        """Officer can access another user's submitted application."""
        app = Application(
            operator_id="operator-1",
            business_name="Test Business",
            submitted_at=datetime.now(timezone.utc),
        )
        db_session.add(app)
        db_session.commit()

        current_user = {"user_id": "officer-1", "role": "officer"}
        result = require_application(app.id, db_session, current_user)
        assert result.id == app.id


    def test_require_application_officer_cannot_access_unsubmitted(self, db_session):
        app = Application(operator_id="operator-1", business_name="Draft")
        db_session.add(app)
        db_session.commit()
        with pytest.raises(HTTPException) as exc_info:
            require_application(app.id, db_session, {"user_id": "officer-1", "role": "officer"})
        assert exc_info.value.status_code == 404

    def test_require_application_require_owner(self, db_session):
        """require_owner=True enforces ownership even for officers"""
        app = Application(
            operator_id="operator-1",
            business_name="Test Business",
        )
        db_session.add(app)
        db_session.commit()

        # Officer with require_owner=True should be denied
        current_user = {"user_id": "officer-1", "role": "officer"}
        with pytest.raises(HTTPException) as exc_info:
            require_application(app.id, db_session, current_user, require_owner=True)
        assert exc_info.value.status_code == 403

    def test_require_application_soft_deleted(self, db_session):
        """Soft-deleted application returns 404"""
        app = Application(
            operator_id="operator-1",
            business_name="Deleted Business",
            is_deleted=True,
        )
        db_session.add(app)
        db_session.commit()

        current_user = {"user_id": "operator-1", "role": "operator"}
        with pytest.raises(HTTPException) as exc_info:
            require_application(app.id, db_session, current_user)
        assert exc_info.value.status_code == 404

    def test_check_editable_status_allowed(self, db_session):
        """Editable status does not raise"""
        app = Application(
            operator_id="operator-1",
            business_name="Test Business",
            status=ApplicationStatus.APPLICATION_RECEIVED,
        )
        db_session.add(app)
        db_session.commit()

        # Should not raise
        check_editable_status(app)

    def test_check_editable_status_not_allowed(self, db_session):
        """Non-editable status raises 400"""
        app = Application(
            operator_id="operator-1",
            business_name="Test Business",
            status=ApplicationStatus.UNDER_REVIEW,
        )
        db_session.add(app)
        db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            check_editable_status(app)
        assert exc_info.value.status_code == 400
        assert "Cannot modify application" in exc_info.value.detail
