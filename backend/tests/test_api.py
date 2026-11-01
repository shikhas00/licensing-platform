"""API integration tests for routers"""

import pytest


class TestApplicationsAPI:
    """Tests for applications router"""

    def test_create_application_as_operator(self, client, operator_headers, sample_application_data):
        """Operator can create an application"""
        response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["business_name"] == "Test Business"
        assert data["status"] == "Application Received"
        assert data["revision_number"] == 1

    def test_create_application_as_officer_forbidden(self, client, officer_headers, sample_application_data):
        """Officer cannot create applications"""
        response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=officer_headers,
        )
        assert response.status_code == 403

    def test_create_application_missing_auth(self, client, sample_application_data):
        """Missing auth headers returns 422"""
        response = client.post("/api/applications/", json=sample_application_data)
        assert response.status_code == 422

    def test_list_applications_as_operator(self, client, operator_headers, sample_application_data):
        """Operator sees only their applications"""
        # Create an application
        client.post("/api/applications/", json=sample_application_data, headers=operator_headers)

        response = client.get("/api/applications/", headers=operator_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["business_name"] == "Test Business"

    def test_list_applications_as_officer(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer sees submitted applications from all operators, excluding drafts."""
        submitted_ids = []
        for headers, name in [
            (operator_headers, "Test Business"),
            ({"X-User-ID": "operator-2", "X-User-Role": "operator"}, "Other Business"),
        ]:
            created = client.post(
                "/api/applications/", json={**sample_application_data, "business_name": name},
                headers=headers,
            )
            assert created.status_code == 201
            app_id = created.json()["id"]
            submitted = client.post(f"/api/applications/{app_id}/submit", headers=headers)
            assert submitted.status_code == 200
            submitted_ids.append(app_id)

        draft = client.post("/api/applications/", json=sample_application_data, headers=operator_headers)
        assert draft.status_code == 201
        response = client.get("/api/applications/", headers=officer_headers)
        assert response.status_code == 200
        assert {app["id"] for app in response.json()} == set(submitted_ids)

    @pytest.mark.parametrize("method, suffix, payload", [
        ("get", "", None),
        ("patch", "/status", {"status": "Under Review"}),
        ("post", "/comments/", {"content": "Review feedback"}),
    ])
    def test_officer_cannot_access_unsubmitted_application(
        self, client, operator_headers, officer_headers, sample_application_data,
        method, suffix, payload,
    ):
        created = client.post("/api/applications/", json=sample_application_data, headers=operator_headers)
        assert created.status_code == 201
        app_id = created.json()["id"]
        kwargs = {"headers": officer_headers}
        if payload is not None:
            kwargs["json"] = payload
        response = client.request(method, f"/api/applications/{app_id}{suffix}", **kwargs)
        assert response.status_code == 404
        detail = client.get(f"/api/applications/{app_id}", headers=operator_headers)
        assert detail.status_code == 200
        assert detail.json()["submitted_at"] is None
        assert detail.json()["status"] == "Application Received"
        assert detail.json()["comments"] == []

    def test_get_application_detail(self, client, operator_headers, sample_application_data):
        """Get application with full details"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.get(f"/api/applications/{app_id}", headers=operator_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["business_name"] == "Test Business"
        assert "documents" in data
        assert "comments" in data
        assert "revisions" in data
        assert "status_history" in data

    def test_get_application_not_found(self, client, operator_headers):
        """Non-existent application returns 404"""
        response = client.get("/api/applications/999", headers=operator_headers)
        assert response.status_code == 404

    def test_update_application(self, client, operator_headers, sample_application_data):
        """Operator can update their application (revision only increments on resubmit)"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.put(
            f"/api/applications/{app_id}",
            json={"business_name": "Updated Business"},
            headers=operator_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_name"] == "Updated Business"
        # Revision only increments on resubmit, not on regular updates
        assert data["revision_number"] == 1

    def test_update_application_as_officer_forbidden(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer cannot update applications"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.put(
            f"/api/applications/{app_id}",
            json={"business_name": "Hacked"},
            headers=officer_headers,
        )
        assert response.status_code == 403

    def test_officer_update_status(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer can change application status"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]
        submit_response = client.post(
            f"/api/applications/{app_id}/submit", headers=operator_headers,
        )
        assert submit_response.status_code == 200
        assert submit_response.json()["submitted_at"] is not None

        response = client.patch(
            f"/api/applications/{app_id}/status",
            json={"status": "Under Review", "reason": "Starting review"},
            headers=officer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Under Review"

    def test_operator_cannot_update_status(self, client, operator_headers, sample_application_data):
        """Operator cannot change status"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.patch(
            f"/api/applications/{app_id}/status",
            json={"status": "Under Review"},
            headers=operator_headers,
        )
        assert response.status_code == 403

    def test_invalid_status_transition(self, client, operator_headers, officer_headers, sample_application_data):
        """Invalid status transition returns 400"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]
        submit_response = client.post(
            f"/api/applications/{app_id}/submit", headers=operator_headers,
        )
        assert submit_response.status_code == 200
        assert submit_response.json()["submitted_at"] is not None

        # Try to jump directly to Approved (invalid)
        response = client.patch(
            f"/api/applications/{app_id}/status",
            json={"status": "Approved"},
            headers=officer_headers,
        )
        assert response.status_code == 400
        assert "Invalid status transition" in response.json()["detail"]


class TestCommentsAPI:
    """Tests for comments router"""

    def test_officer_create_comment(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer can add comments"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]
        submit_response = client.post(
            f"/api/applications/{app_id}/submit", headers=operator_headers,
        )
        assert submit_response.status_code == 200
        assert submit_response.json()["submitted_at"] is not None

        response = client.post(
            f"/api/applications/{app_id}/comments/",
            json={"content": "Please fix this", "section": "business_info"},
            headers=officer_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Please fix this"
        assert data["section"] == "business_info"
        assert data["is_resolved"] is False

    def test_operator_cannot_create_comment(self, client, operator_headers, sample_application_data):
        """Operator cannot add comments"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.post(
            f"/api/applications/{app_id}/comments/",
            json={"content": "My comment"},
            headers=operator_headers,
        )
        assert response.status_code == 403

    def test_list_comments(self, client, operator_headers, officer_headers, sample_application_data):
        """List comments for an application"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]
        submit_response = client.post(
            f"/api/applications/{app_id}/submit", headers=operator_headers,
        )
        assert submit_response.status_code == 200
        assert submit_response.json()["submitted_at"] is not None

        # Add a comment
        client.post(
            f"/api/applications/{app_id}/comments/",
            json={"content": "Test comment"},
            headers=officer_headers,
        )

        response = client.get(f"/api/applications/{app_id}/comments/", headers=operator_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Test comment"

    def test_resolve_comment(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer can resolve comments"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]
        submit_response = client.post(
            f"/api/applications/{app_id}/submit", headers=operator_headers,
        )
        assert submit_response.status_code == 200
        assert submit_response.json()["submitted_at"] is not None

        comment_response = client.post(
            f"/api/applications/{app_id}/comments/",
            json={"content": "Fix this"},
            headers=officer_headers,
        )
        assert comment_response.status_code == 201
        comment_id = comment_response.json()["id"]

        response = client.patch(
            f"/api/applications/{app_id}/comments/{comment_id}/resolve",
            json={"is_resolved": True},
            headers=officer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_resolved"] is True
        assert data["resolved_by"] is not None

    def test_get_comment_templates(self, client, operator_headers, sample_application_data):
        """Get predefined comment templates"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.get(f"/api/applications/{app_id}/comments/templates", headers=operator_headers)
        assert response.status_code == 200
        data = response.json()
        assert "missing_document" in data
        assert "unclear_document" in data


class TestDocumentsAPI:
    """Tests for documents router"""

    def test_list_documents_empty(self, client, operator_headers, sample_application_data):
        """New application has no documents"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.get(f"/api/applications/{app_id}/documents/", headers=operator_headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_upload_document_invalid_type(self, client, operator_headers, sample_application_data):
        """Invalid file type returns 415"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        response = client.post(
            f"/api/applications/{app_id}/documents/",
            data={"section": "business_license"},
            files={"file": ("test.txt", b"not a valid file", "text/plain")},
            headers=operator_headers,
        )
        assert response.status_code == 415

    def test_upload_document_valid_pdf(self, client, operator_headers, sample_application_data):
        """Valid PDF upload succeeds"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        pdf_content = b"%PDF-1.4 test content"
        response = client.post(
            f"/api/applications/{app_id}/documents/",
            data={"section": "business_license"},
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            headers=operator_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["file_type"] == "pdf"
        assert data["section"] == "business_license"

    def test_officer_cannot_upload_document(self, client, operator_headers, officer_headers, sample_application_data):
        """Officer cannot upload documents"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        pdf_content = b"%PDF-1.4 test content"
        response = client.post(
            f"/api/applications/{app_id}/documents/",
            data={"section": "business_license"},
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            headers=officer_headers,
        )
        assert response.status_code == 403

    def test_delete_document(self, client, operator_headers, sample_application_data):
        """Operator can delete their documents"""
        create_response = client.post(
            "/api/applications/",
            json=sample_application_data,
            headers=operator_headers,
        )
        app_id = create_response.json()["id"]

        # Upload a document
        pdf_content = b"%PDF-1.4 test content"
        upload_response = client.post(
            f"/api/applications/{app_id}/documents/",
            data={"section": "business_license"},
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            headers=operator_headers,
        )
        doc_id = upload_response.json()["id"]

        # Delete it
        response = client.delete(
            f"/api/applications/{app_id}/documents/{doc_id}",
            headers=operator_headers,
        )
        assert response.status_code == 204

        # Verify it's gone from list
        list_response = client.get(
            f"/api/applications/{app_id}/documents/",
            headers=operator_headers,
        )
        assert list_response.json() == []
