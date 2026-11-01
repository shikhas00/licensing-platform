"""Tests for service functions"""

import pytest
from fastapi import HTTPException

from app.models import ApplicationStatus, FormSection
from app.services.status import (
    get_status_label,
    get_valid_status_transitions,
    get_resubmission_status,
)
from app.services.document_service import (
    detect_file_type,
    validate_file_type,
    validate_file_size,
)


class TestStatusService:
    """Tests for status service functions"""

    def test_get_status_label_officer(self):
        """Officer sees internal labels"""
        label = get_status_label(ApplicationStatus.APPLICATION_RECEIVED, "officer")
        assert label == "Application Received"

    def test_get_status_label_operator(self):
        """Operator sees 'Submitted' for APPLICATION_RECEIVED"""
        label = get_status_label(ApplicationStatus.APPLICATION_RECEIVED, "operator")
        assert label == "Submitted"

    def test_get_status_label_operator_site_visit(self):
        """Operator sees 'Pending Site Visit' for SITE_VISIT_SCHEDULED"""
        label = get_status_label(ApplicationStatus.SITE_VISIT_SCHEDULED, "operator")
        assert label == "Pending Site Visit"

    def test_officer_valid_transitions_from_received(self):
        """Officer can move from APPLICATION_RECEIVED to UNDER_REVIEW or REJECTED"""
        transitions = get_valid_status_transitions(
            ApplicationStatus.APPLICATION_RECEIVED, "officer"
        )
        assert ApplicationStatus.UNDER_REVIEW in transitions
        assert ApplicationStatus.REJECTED in transitions
        assert len(transitions) == 2

    def test_officer_valid_transitions_from_under_review(self):
        """Officer has multiple options from UNDER_REVIEW (site visit disabled for MVP)"""
        transitions = get_valid_status_transitions(
            ApplicationStatus.UNDER_REVIEW, "officer"
        )
        assert ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION in transitions
        # SITE_VISIT_SCHEDULED disabled - Use Case 3 out of scope
        assert ApplicationStatus.SITE_VISIT_SCHEDULED not in transitions
        assert ApplicationStatus.PENDING_APPROVAL in transitions
        assert ApplicationStatus.REJECTED in transitions

    def test_operator_valid_transitions(self):
        """Operator can only resubmit from pending resubmission statuses"""
        transitions = get_valid_status_transitions(
            ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION, "operator"
        )
        assert transitions == [ApplicationStatus.PRE_SITE_RESUBMITTED]

    def test_operator_no_transitions_from_under_review(self):
        """Operator cannot change status when under review"""
        transitions = get_valid_status_transitions(
            ApplicationStatus.UNDER_REVIEW, "operator"
        )
        assert transitions == []

    def test_get_resubmission_status_pre_site(self):
        """Pre-site resubmission transitions correctly"""
        new_status = get_resubmission_status(
            ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION
        )
        assert new_status == ApplicationStatus.PRE_SITE_RESUBMITTED

    def test_get_resubmission_status_post_site(self):
        """Post-site resubmission transitions correctly"""
        new_status = get_resubmission_status(
            ApplicationStatus.PENDING_POST_SITE_RESUBMISSION
        )
        assert new_status == ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED

    def test_get_resubmission_status_no_change(self):
        """Non-resubmission statuses return unchanged"""
        new_status = get_resubmission_status(ApplicationStatus.UNDER_REVIEW)
        assert new_status == ApplicationStatus.UNDER_REVIEW


class TestDocumentService:
    """Tests for document service functions"""

    def test_detect_file_type_pdf(self):
        """Detect PDF from magic bytes"""
        pdf_content = b"%PDF-1.4 test content"
        assert detect_file_type(pdf_content) == "pdf"

    def test_detect_file_type_png(self):
        """Detect PNG from magic bytes"""
        png_content = b"\x89PNG\r\n\x1a\n test content"
        assert detect_file_type(png_content) == "png"

    def test_detect_file_type_jpg(self):
        """Detect JPG from magic bytes (normalized from jpeg)"""
        jpg_content = b"\xff\xd8\xff test content"
        assert detect_file_type(jpg_content) == "jpg"

    def test_detect_file_type_unknown(self):
        """Unknown file type returns None"""
        unknown_content = b"some random bytes"
        assert detect_file_type(unknown_content) is None

    def test_validate_file_type_valid_pdf(self):
        """Valid PDF for business license section"""
        pdf_content = b"%PDF-1.4 test content"
        result = validate_file_type(pdf_content, FormSection.BUSINESS_LICENSE)
        assert result == "pdf"

    def test_validate_file_type_valid_image(self):
        """Valid image for floor plan section"""
        png_content = b"\x89PNG\r\n\x1a\n test content"
        result = validate_file_type(png_content, FormSection.FLOOR_PLAN)
        assert result == "png"

    def test_validate_file_type_invalid_type(self):
        """Unknown file type raises 415"""
        unknown_content = b"some random bytes"
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type(unknown_content, FormSection.BUSINESS_LICENSE)
        assert exc_info.value.status_code == 415
        assert "Unsupported file type" in exc_info.value.detail

    def test_validate_file_type_wrong_section(self):
        """Image not allowed for insurance section"""
        png_content = b"\x89PNG\r\n\x1a\n test content"
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type(png_content, FormSection.INSURANCE)
        assert exc_info.value.status_code == 415
        assert "not allowed for section" in exc_info.value.detail

    def test_validate_file_size_valid(self):
        """Valid file size passes"""
        content = b"x" * 1000
        # Should not raise
        validate_file_size(content, max_size=2000)

    def test_validate_file_size_too_large(self):
        """Oversized file raises 413"""
        content = b"x" * 2000
        with pytest.raises(HTTPException) as exc_info:
            validate_file_size(content, max_size=1000)
        assert exc_info.value.status_code == 413
        assert "File too large" in exc_info.value.detail
