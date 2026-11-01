# AI Usage Log

This document records how AI (Claude) was used during development, following best practices from [Anthropic's Claude Code guidance](https://www.anthropic.com/research/claude-code-best-practices). Each entry includes a prompt summary, output description, and any corrections made.

---

## Session 1: Project Setup and Data Model Design

### 1.1 Initial Planning

**Prompt:**
> I need to build an MVP for a regulatory licensing platform. Operators submit applications, officers review them. Here's the brief [attached CLAUDE.md]. Before writing any code, help me plan the data model. What tables do I need? What are the relationships?

**Output:**
Claude proposed 6 tables: Application, Document, Comment, ApplicationRevision, StatusHistory, Notification. Key design decisions:
- `ApplicationRevision` to snapshot form data at each submission (preserves history)
- `StatusHistory` for audit trail
- `supersedes_id` on Document to track replacement chains
- Soft delete (`is_deleted`) instead of hard delete

**Corrections:**
- Added `is_draft` flag on Document. Claude's initial design committed documents immediately on upload, but officers shouldn't see uncommitted changes. The draft flag allows "save progress" behavior.
- Changed `section` from String to Enum. Claude suggested String for flexibility, but Enum enforces valid values and prevents typos like "buisness_info".

---

### 1.2 Status Workflow Mapping

**Prompt:**
> The brief has a table mapping internal status to officer/operator display labels. How should I model this? Should the labels be in the database or in code?

**Output:**
Claude recommended keeping labels in the service layer (Python dicts), not the database. Rationale: labels are presentation logic, not data. If stored in DB, every label change requires a migration.

**Corrections:** None. This was sound advice.

---

## Session 2: Backend Infrastructure

### 2.1 Application Configuration and Database Setup

**Prompt:**
> Set up the FastAPI application structure: main.py with CORS middleware, database.py with SQLAlchemy engine and session dependency, and config.py with Pydantic Settings for environment variables (database_url, upload_dir, max_upload_size). Tables should be created on app startup.

**Output:**
Generated `main.py`, `database.py`, and `config.py`:
- FastAPI app with CORS middleware for localhost:5173, using lifespan context manager for startup/shutdown
- SQLAlchemy engine with SQLite, `get_db` dependency for session injection
- Pydantic Settings class loading from `.env` file

**Corrections:**
- Initial version called `Base.metadata.create_all()` on every request. Moved to lifespan context manager.
- Added `connect_args={"check_same_thread": False}` for SQLite to work with FastAPI's async context.

---

### 2.2 Authentication and Access Helpers

**Prompt:**
> Create mock authentication: a `get_current_user` FastAPI dependency that extracts user identity from `X-User-ID` and `X-User-Role` headers. Also create helper functions: `require_application()` to fetch an application with ownership/access checks, and `check_editable_status()` to enforce which statuses allow operator edits.

**Output:**
Generated `utils/auth.py` and `utils/helpers.py`:
- `get_current_user()` dependency in `auth.py` extracting `X-User-ID` and `X-User-Role` headers, validating role is "operator" or "officer"
- `require_application()` helper in `helpers.py` fetching application by ID with role-based access control
- `check_editable_status()` in `helpers.py` raising 400 if application not in editable status
- `OPERATOR_EDITABLE_STATUSES` constant listing `APPLICATION_RECEIVED`, `PENDING_PRE_SITE_RESUBMISSION`, `PENDING_POST_SITE_RESUBMISSION`
- `create_revision_snapshot()` to capture form data at each revision

**Corrections:** None needed after initial split into auth vs helpers modules.

---

### 2.3 Notification Service

**Prompt:**
> Create a notification service that stores notification records in the database and logs mock email delivery. Implement `notify_status_change()` to notify operators when officers change status, and `notify_comment_added()` when officers add comments. When operators resubmit, notify the assigned officer.

**Output:**
Generated `services/notifications.py` with:
- `create_notification()` base function that inserts `Notification` record and logs mock email
- `notify_status_change()` creates notification for operator when officer changes status; also notifies assigned officer when operator resubmits to `PRE_SITE_RESUBMITTED` or `POST_SITE_CLARIFICATION_RESUBMITTED`
- `notify_comment_added()` creates notification when officer adds comment

`Notification` model in `models.py` with fields: `application_id`, `recipient_id`, `recipient_role`, `message`, `notification_type`, `read_at`, `created_at`

**Corrections:**
- Initial version only notified operators. Added officer notification branch when `changed_by_role == "operator"` and status is a resubmission status.

---

## Session 3: Backend API Implementation

### 3.1 Applications Router

**Prompt:**
> Write the applications router with CRUD operations. Include: create (operator only), list (operators see own, officers see all submitted), get details (with access control), update form fields, and status change (officer only with transition validation). Use the auth utilities. Officers should be auto-assigned when they first interact with an application.

**Output:**
Generated `routers/applications.py` with proper role checks, status validation, and auto-assignment of officers on first status change.

**Corrections:**
- Status transition validation was too permissive initially. Added `get_valid_status_transitions()` in the service layer and integrated it into the PATCH endpoint.
- Missing `submitted_at` timestamp - initial submission wasn't recording when the application was first submitted. Added timestamp update in submit endpoint.

---

### 3.2 Document Upload with AI Verification

**Prompt:**
> Implement document upload to a specific application/section. After upload, trigger AI verification in a background task. The AI verification should be mocked - use filename keywords to determine the result deterministically (e.g., "expired" -> FLAGGED, "blurry" -> FLAGGED, "fake" -> FAILED). Unknown sections should go to PENDING for manual review as a fail-safe.

**Output:**
Generated `routers/documents.py` and `services/ai_verification.py`. Mock verification checks filename for keywords like "expired", "blurry", "fake" with deterministic results documented in the module docstring.

**Corrections:**
- Background task had no error handling. If the database update failed, document stayed PENDING forever with no message. Added try/except with rollback and fallback update that sets status to PENDING with "Automated verification unavailable. Manual review required."
- `import asyncio` was inside the function body. Moved to top of file.
- Logger calls used f-strings (`logger.info(f"...")`). Changed to `logger.info("...", args)` per Python logging best practices (deferred string formatting).

---

### 3.3 Resubmission Flow

**Prompt:**
> Implement the resubmission flow. When an operator is in "Pending Pre-Site Resubmission" status, they can update form data and replace documents. On submit, the system should: increment revision number, create a snapshot of current form data, commit draft documents (set is_draft=False and update revision_number), change status to "Pre-Site Resubmitted", and notify the assigned officer.

**Output:**
Generated `POST /applications/{id}/submit` endpoint that handles both initial submission and resubmission. Created `create_revision_snapshot()` utility in helpers.py.

**Corrections:**
- Initial version didn't distinguish between draft and committed documents. Officers could see work-in-progress uploads. Added `is_draft` flag and filter in the GET documents endpoint.
- Forgot to clear the draft flag on commit. Added loop to set `is_draft = False` for all application documents when committing during resubmission.

---

## Session 4: Frontend Setup and API Integration

### 4.1 Project Scaffolding

**Prompt:**
> Set up a React + TypeScript + Vite project with Tailwind CSS. Configure React Router with role-based routes: `/operator/*` for operator screens, `/officer/*` for officer screens. Create a Layout component with navigation and a role switcher dropdown for demo purposes. Create a `useAuth` hook that manages user identity in localStorage.

**Output:**
Generated project structure with:
- Vite config with React and TypeScript
- Tailwind CSS configuration (using default theme)
- React Router with nested route structure (`/operator/*`, `/officer/*`)
- `Layout.tsx` with navigation header and role switcher
- `useAuth` hook managing `userId` and `role` in localStorage, with restoration in state initializer

**Corrections:**
- Auth headers weren't set on page refresh. Added `setAuthHeaders()` call in the state initializer when restoring from localStorage.

---

### 4.2 API Client

**Prompt:**
> Create an Axios-based API client for all backend endpoints. Include: a function to set auth headers (`X-User-ID`, `X-User-Role`) on the axios instance defaults, typed wrapper functions for applications CRUD, document upload/download/delete, and comments CRUD. Document download should trigger browser download using blob response.

**Output:**
Generated `api/client.ts` with:
- Axios instance with `baseURL` from environment variable `VITE_API_URL`
- `setAuthHeaders()` function to configure auth headers on the axios instance
- Typed functions: `getApplications`, `getApplication`, `createApplication`, `updateApplication`, `updateApplicationStatus`, `submitApplication`
- Document functions: `getDocuments`, `getDocument`, `uploadDocument`, `deleteDocument`, `getDocumentHistory`, `downloadDocument`
- Comment functions: `getComments`, `createComment`, `resolveComment`
- `downloadDocument()` creates blob URL and triggers browser download via temporary anchor element

**Corrections:** None needed.

---

## Session 5: Frontend Screens and Components

### 5.1 Type Definitions

**Prompt:**
> Generate TypeScript types matching the backend Pydantic schemas. Include all enums (ApplicationStatus, AIVerificationStatus, FormSection) as const objects with string values matching the backend exactly. Add OFFICER_STATUS_LABELS and OPERATOR_STATUS_LABELS mappings for display.

**Output:**
Generated `types/index.ts` with interfaces matching backend schemas, plus enum objects with display labels.

**Corrections:**
- Status enum values used snake_case (`application_received`) but backend uses space-separated strings (`"Application Received"`). Fixed to match exact backend values.
- Missing `OFFICER_STATUS_LABELS` and `OPERATOR_STATUS_LABELS` display mapping dictionaries. Added both.

---

### 5.2 Operator Screens

**Prompt:**
> Build operator screens: `NewApplication.tsx` - a form with business name (required), business type, contact name/email/phone, and address fields. On submit, call `createApplication` then `submitApplication` in sequence and redirect to detail page. `ApplicationDetail.tsx` - displays application data with inline editing, document upload sections grouped by FormSection, status badge, and unresolved comments alert when resubmission is needed.

**Output:**
Generated `pages/operator/NewApplication.tsx` and `ApplicationDetail.tsx`:
- New application form with controlled inputs and validation
- Automatic submission after creation (create + submit in one flow)
- Detail page with edit mode toggle, document upload per section, status display
- Alert banner showing unresolved comment count when in `PENDING_PRE_SITE_RESUBMISSION` status

**Corrections:**
- Initial version required separate "Create" then "Submit" actions. Simplified to auto-submit on create for better UX - operators expect "Create" to submit the application.
- Document upload section didn't show existing documents for that section. Added display of current documents with verification badges.

---

### 5.3 Officer Queue and Review

**Prompt:**
> Build officer queue page: `ReviewQueue.tsx` showing all submitted applications in a table with columns for ID, business name, status, submitted date, and assigned officer. Add filter tabs: "Needs Review" (Application Received, Pre-Site Resubmitted), "In Progress" (Under Review, Pending Pre-Site Resubmission), "Completed" (Approved, Rejected). Show count badges per filter.

**Output:**
Generated `pages/officer/ReviewQueue.tsx`:
- Table with fixed sort (needs-review first, then by update date)
- Filter tabs with count badges
- Row highlighting for applications needing immediate attention
- "Review" link per row to navigate to review page

**Corrections:** None needed.

### 5.4 Officer Review Page

**Prompt:**
> Build officer review page: `ApplicationReview.tsx` showing full application details. Include: AI verification alerts banner at top for any flagged/failed documents, business info section, documents grouped by FormSection with download buttons and VerificationBadge, comments sidebar with form to add new comments and list of existing comments, status history timeline, and status change button opening a modal with valid transitions.

**Output:**
Generated `pages/officer/ApplicationReview.tsx` with:
- AI verification alerts banner showing documents with `FLAGGED` or `FAILED` status
- Documents grouped by FormSection with download links and verification badges
- Comment form and list in fixed sidebar (right column of 3-column grid)
- Status history timeline
- Status change modal showing only valid transitions from current status

**Corrections:**
- Status transitions were hardcoded in frontend, duplicating backend logic. Kept for MVP but noted as tech debt - should fetch valid transitions from API.
- Initial version didn't show revision comparison. Added `RevisionComparison` component integration when `revision_number > 1`.

---

### 5.5 Revision Comparison Component

**Prompt:**
> Build `RevisionComparison.tsx` that shows what changed between the current revision and the previous one. For form fields, highlight changed values with before/after display. For documents, show which were added or replaced with type labels. Group changes by section for clarity.

**Output:**
Generated `components/RevisionComparison.tsx` that:
- Compares current revision to previous using props (no additional fetches)
- Highlights changed form fields with old value struck through, new value in green
- Shows document changes with "(added)" or "(replaced)" labels and old/new filenames
- Groups changes by section for clarity

**Corrections:**
- Initial version compared against revision 1 instead of the previous revision. Fixed to use `revisions[length-2]` after sorting by revision_number.
- Sorting revisions by `revision_number` wasn't guaranteed from API. Added explicit sort before comparison.

---

### 5.6 Shared UI Components

**Prompt:**
> Create reusable components: `StatusBadge.tsx` - displays application status with role-aware label (officer vs operator) and color coding by status category (success=green, warning=yellow, error=red, info=blue). `VerificationBadge.tsx` - displays AI verification status with icon and message. `DocumentUpload.tsx` - drag-and-drop file upload with accept attribute, upload state indicator, and display of uploaded files with verification badges.

**Output:**
Generated `components/StatusBadge.tsx`, `VerificationBadge.tsx`, `DocumentUpload.tsx`:
- StatusBadge reads role from `useAuth()` hook to show officer or operator label, with color coding by status category
- VerificationBadge shows AI verification status with icon (checkmark/warning/error) and inline message
- DocumentUpload handles drag-and-drop with `accept` prop for MIME type hints, shows "Uploading..." during upload, displays existing files with size and verification badges

**Corrections:**
- StatusBadge initially used hardcoded colors per status. Refactored to derive color from status category mapping for maintainability.

---

## Session 6: Comment System

### 6.1 Comment Templates

**Prompt:**
> Officers need predefined comment templates for common issues. Implement template buttons above the comment textarea that insert template text when clicked. Templates: "Document expired", "Image unclear", "Information mismatch", "Missing pages", "Wrong document type". Include a section dropdown to associate the comment with a specific form section.

**Output:**
Generated template data structure and template buttons in `CommentForm.tsx`. Templates are rendered as clickable pill buttons that populate the textarea. A separate dropdown handles section selection.

**Corrections:**
- Templates were stored in frontend only. For MVP this is fine, but noted that a real system would store templates in the database for officer customization.

---

### 6.2 Comment Resolution

**Prompt:**
> Officers need to mark comments as resolved after reviewing the operator's response. Add a "Mark Resolved" button to each unresolved comment. Track who resolved it (`resolved_by`), when (`resolved_at`), and in which revision round (`resolved_in_revision`). Show resolved comments with muted styling.

**Output:**
Added `PATCH /comments/{id}/resolve` endpoint with resolution tracking fields. Frontend shows resolved comments with gray background and "Resolved" label. Unresolved comments show amber background with "Mark Resolved" button (officers only).

**Corrections:** None needed.

---

## Session 7: AI Verification Robustness

### 7.1 Error Handling Improvements

**Prompt:**
> The AI verification background task has no error handling. If the database update throws, the document stays PENDING forever with no message. Fix this: wrap the verification in try/except, rollback on failure, and attempt a fallback update setting status to PENDING with message "Automated verification unavailable. Manual review required."

**Output:**
Refactored `run_verification_task()` with:
- Outer try/except catching all exceptions
- `db.rollback()` on failure
- Fallback database update in nested try/except setting status to PENDING with manual review message
- Proper logging with `logger.exception()` to capture full traceback

**Corrections:** None needed - the refactored version handles errors gracefully for the mock implementation.

---

### 7.2 AI Governance Documentation

**Prompt:**
> Add documentation to SCOPE.md explaining that AI verification is advisory only - it never auto-rejects or changes application status. This is important for a government system. Document the fail-safe principle: failures go to manual review, not auto-approve.

**Output:**
Added "AI Governance" section to SCOPE.md with two key principles:
1. AI is advisory only - officers make all decisions
2. Fail-safe, not fail-open - failures go to manual review

**Corrections:** None.

---

## Session 8: Testing Suite Development

### 8.1 Backend API Tests

**Prompt:**
> Write pytest tests for the backend API using TestClient. Set up fixtures: test database, test client with auth headers, sample application factory. Cover: application lifecycle (create, update, submit, resubmit), document upload with verification status polling, comment creation and resolution, status transition validation (valid and invalid transitions).

**Output:**
Generated `tests/test_api.py` with test classes, and `tests/conftest.py` with shared fixtures:
- Fixtures in `conftest.py`: test database engine, `client` fixture (TestClient), `operator_headers`/`officer_headers`, `sample_application_data`
- Tests for application CRUD, submit, status change
- Document upload tests checking HTTP status, file type, and section (AI verification runs async; result display tested via Playwright)
- Comment tests including resolution tracking
- Status transition tests for valid and invalid paths

**Corrections:**
- Tests shared database state between runs causing flaky failures. Used `scope="function"` for database fixture; teardown closes session and drops all tables.
- Some tests expected `revision_number == 2` after update, but implementation only increments on resubmit. Fixed assertions.

---

### 8.2 Service Layer Tests

**Prompt:**
> Write unit tests for the service layer modules: `status.py` (test key status transitions and role differences), `document_service.py` (test file type detection and validation). Put service tests in `test_services.py` and utility tests in `test_utils.py`.

**Output:**
Generated `tests/test_services.py`:
- Tests for `get_valid_status_transitions()` covering key officer/operator transitions
- Verification that site-visit states have restricted entry
- `get_status_label()` tests for officer vs operator label differences
- `detect_file_type()` and `validate_file_type()` tests for magic byte detection

Generated `tests/test_utils.py`:
- Tests for `get_current_user()` auth dependency (valid/invalid roles)
- Tests for `require_application()` access control (ownership, soft delete, unsubmitted)
- Tests for `check_editable_status()` status validation

**Note:** AI verification logic (`verify_document_sync`) is not unit tested separately; coverage is via integration tests that upload documents and check resulting status.

---

### 8.3 End-to-End Tests

**Prompt:**
> Write Playwright tests covering the main user flows: (1) operator creates application, submits, uploads documents; (2) officer reviews, adds comments, requests resubmission; (3) operator sees comments, replaces document, resubmits; (4) officer sees revision comparison, resolves comments, approves. Add tests for draft visibility (officers shouldn't see draft documents) and pending deletion workflow.

**Output:**
Generated Playwright test suite with:
- Operator submission flow with document upload
- Officer review flow with comment and status change
- Resubmission cycle with revision comparison verification
- Draft visibility tests (operator sees draft, officer doesn't)
- Pending deletion tests (document shows pending until resubmit)

**Corrections:**
- Tests used hardcoded `waitForTimeout()` which was brittle. Replaced some with `waitForSelector()` and `waitForResponse()` (some timeouts remain for async operations).
- Draft visibility test caught a real bug (drafts were visible to officers via direct document ID). Fixed in code, test now passes.
- Pending deletion test confirmed intended behavior: officers retain download access for pending-deletion documents until resubmission commits the deletion.

---

## Session 9: Security Review and Bug Fixes

### 9.1 Code Review and Vulnerability Assessment

**Prompt:**
> Review the backend code for security issues, logic bugs, and test coverage gaps. Focus on: access control (can users access resources they shouldn't?), data leakage (are draft/deleted items properly hidden?), and error handling (what happens on failure?).

**Output:**
Claude identified 4 issues:

1. **Security vulnerability**: Document history endpoint followed `supersedes_id` chain without checking `application_id`, potentially exposing another application's document metadata.

2. **Logic bug**: When uploading a replacement document during pending resubmission, the old document was immediately marked `is_current=False` while the new one was `is_draft=True`. Officers couldn't see either document until resubmission.

3. **Inconsistency**: The individual document GET endpoint lacked the `is_draft` filter that the list endpoint had, allowing officers to fetch draft document metadata directly by ID.

4. **Testing issue**: Background verification task imported `SessionLocal` directly, bypassing the test database override. Upload tests could touch the production database instead of the test database.

**Corrections:** All issues confirmed and fixed (see 9.2-9.5 below).

---

### 9.2 Fix: Document History Cross-Application Exposure

**Prompt:**
> Fix the security vulnerability where document history can expose another application's document metadata by following supersedes_id across applications.

**Output:**
Two-part fix in `routers/documents.py`:

1. **Upload validation** (lines 66-81): Reject `supersedes_id` if document doesn't exist in the same application. Previously it silently stored invalid references.

2. **History traversal** (lines 205-208): Added `application_id` filter when following `supersedes_id` chain. Prevents cross-application traversal even if bad data exists.

```python
# Before (vulnerable)
prev = db.query(Document).filter(Document.id == current.supersedes_id).first()

# After (secure)
prev = db.query(Document).filter(
    Document.id == current.supersedes_id,
    Document.application_id == application_id,  # Prevent cross-app traversal
).first()
```

**Corrections:** None needed.

---

### 9.3 Fix: Draft Replacement Document Visibility

**Prompt:**
> Fix the logic bug where uploading a draft replacement immediately hides the submitted document from officers. Officers should see the original until the operator resubmits.

**Output:**
Two-part fix:

1. **Upload** (`documents.py` lines 78-81): Only mark old document as non-current when NOT creating a draft. During pending resubmission, old doc stays visible to officers.

2. **Resubmission commit** (`applications.py` lines 255-269): Mark superseded documents as non-current when drafts are committed during resubmission.

```python
# On upload: defer marking old doc non-current if creating draft
if not is_draft:
    old_doc.is_current = False

# On resubmission: now mark superseded docs non-current
for doc in draft_docs:
    if doc.supersedes_id:
        old_doc = db.query(Document).filter(...).first()
        if old_doc:
            old_doc.is_current = False
```

**Corrections:** None needed.

---

### 9.4 Fix: Officer Draft Access via Direct ID

**Prompt:**
> Add draft filter to the individual document GET endpoint so officers cannot fetch draft document metadata by ID.

**Output:**
Added `is_draft` filter to `get_document()` endpoint (`documents.py` lines 145-147):

```python
# Officers don't see draft documents
if current_user["role"] == "officer":
    query = query.filter(Document.is_draft == False)
```

**Corrections:** None needed.

---

### 9.5 Fix: Background Verification Test Database

**Prompt:**
> Fix the background verification task to use an injectable database session factory so tests can override it with the test database. The current implementation imports SessionLocal directly, bypassing test fixtures.

**Output:**
Refactored `ai_verification.py` with injectable session factory:

1. Added module-level `_session_factory` variable (line 34)
2. Added `set_session_factory()` function to override (lines 37-40)
3. Added `get_session()` helper that uses factory if set, else `SessionLocal` (lines 43-49)
4. Changed `run_verification_task()` to use `get_session()` (line 139)

Updated `tests/conftest.py` to configure the factory:
```python
set_session_factory(TestingSessionLocal)  # In client fixture setup
set_session_factory(None)  # In teardown
```

**Corrections:** None needed.

---

### 9.6 Test Fix: Revision Number Assertion

**Prompt:**
> Fix the failing test that expected revision_number to increment after calling PUT /applications/{id} (update form fields).

**Output:**
Fixed `test_update_application` in `test_api.py`. The test expected `revision_number == 2` after a form update, but the implementation only increments revision on resubmit, not on regular updates (by design - revisions track submissions, not edits).

```python
# Before (incorrect expectation)
assert data["revision_number"] == 2

# After (matches implementation)
# Revision only increments on resubmit, not on regular updates
assert data["revision_number"] == 1
```

**Corrections:** None needed - test was wrong, implementation was correct.

---

## Session 10: Comprehensive Bug Fixes

### 10.1 Extended Code Review

**Prompt:**
> Review backend, frontend, tests, and configuration for bugs beyond security issues. Look for: state inconsistencies, missing edge case handling, UI not reflecting backend state, workflow dead-ends.

**Output:**
Identified 14+ issues across backend logic, frontend state management, and data consistency. Prioritized by severity and addressed in order.

---

### 10.2 Fix: Draft Privacy in History Endpoint

**Issue:** Document history endpoint returned drafts to officers while GET endpoint correctly hid them.

**Fix:** Added `is_draft` filter to history endpoint (`documents.py` lines 205-232):
- Initial document lookup filters drafts for officers
- Chain traversal also filters drafts

---

### 10.3 Fix: Initial Revision Timing

**Issue:** Revision 1 was captured at application creation, not at first submission. Editing before submit meant revision 1 didn't match submitted data.

**Fix:** Moved `create_revision_snapshot()` from `create_application()` to `submit_application()`:
- `applications.py` line 49: Removed snapshot creation at creation
- `applications.py` lines 297-300: Create initial snapshot at first submission
- `applications.py` lines 387-402: Revision 1 can be overwritten while status remains APPLICATION_RECEIVED (allows operator to re-save before officer begins review); once review starts, revision history becomes immutable

---

### 10.4 Fix: Document Revision Numbers After Resubmission

**Issue:** Documents uploaded during pending resubmission kept their original revision number even after resubmission incremented the application revision.

**Fix:** Update document revision numbers when committing drafts (`applications.py` line 261):
```python
for doc in draft_docs:
    doc.revision_number = application.revision_number  # Fix: update doc revision
```

---

### 10.5 Fix: Workflow States Trap Applications

**Issue:** `SITE_VISIT_SCHEDULED` and `AWAITING_POST_SITE_CLARIFICATION` had no exit transitions, trapping applications.

**Fix:** Updated `status.py`:
- Disabled entry into site visit states from normal workflow (Use Case 3 out of scope)
- Added emergency exit transitions for any applications already in these states
- Updated test to reflect new behavior

---

### 10.6 Fix: Null business_name Causes HTTP 500

**Issue:** `ApplicationUpdate` schema accepted `business_name: null` which violated database NOT NULL constraint.

**Fix:** Two-part solution:
1. **Frontend** (`NewApplication.tsx`, `ApplicationDetail.tsx`): Request preparation removes empty strings from optional fields before sending, so they're excluded from the update payload.
2. **Backend** (`applications.py` line 229): Added `exclude_none=True` to `model_dump()`, preventing null or omitted fields from overwriting existing database values.

This describes the normal UI flow. Direct API clients could still send null, but `exclude_none=True` ignores it.

---

### 10.7 Fix: AI Verification Badge Stays Stale

**Issue:** After upload, verification status stayed "pending" forever because frontend never polled for updates.

**Fix:** Added polling logic to `ApplicationDetail.tsx`:
- Poll every 2 seconds for documents with pending verification
- Update state when verification completes
- Auto-stop polling when no pending documents remain

---

### 10.8 Fix: Status History Not Updating

**Issue:** After officer changed status, the response was merged into state but `status_history` wasn't included, so new entry didn't appear.

**Fix:** Changed `ApplicationReview.tsx` to reload full application after status change (`line 84-86`):
```javascript
await updateApplicationStatus(parseInt(id), data);
// Reload full application to get updated status_history
await loadApplication();
```

---

### 10.9 Fix: File Size Display Calculation

**Issue:** `(doc.file_size || 0 / 1024)` displayed wrong values due to operator precedence.

**Fix:** Added parentheses (`DocumentUpload.tsx` line 126):
```javascript
({((doc.file_size || 0) / 1024).toFixed(1)} KB)
```

---


## Session 11: Officer View Privacy and Response Consistency

### 11.1 Fix: Officers See Form Changes Before Resubmission

**Issue:** Officers could see uncommitted form field edits (business_name, address, etc.) while the operator was still making changes. They should only see data from the last committed revision.

**Fix:** Modified `get_application()` detail endpoint in `applications.py` (lines 125-149):
- For officers, return form data from the latest `ApplicationRevision` instead of the live `Application` fields
- This ensures officers only see form changes after the operator submits/resubmits

**Note:** This fix applies to the detail endpoint only. List and mutation responses still use live `Application` fields. This is documented as a known limitation in SCOPE.md.

```python
# Officers see the last committed revision's form data, not draft edits
if current_user["role"] == "officer" and application.revisions:
    latest_revision = max(application.revisions, key=lambda r: r.revision_number)
    return ApplicationDetailResponse(
        business_name=latest_revision.business_name,
        business_type=latest_revision.business_type,
        # ... other revision fields
    )
```

---

### 11.2 Fix: Mutation Responses Include Deleted Documents

**Issue:** Mutation endpoints (create, update, status change, submit) returned the raw SQLAlchemy model, which serialized all documents including deleted and draft ones.

**Fix:** Added `build_application_response()` helper in `applications.py` (lines 29-60):
- Filters documents by `is_current` and `is_deleted`
- For officers, also filters by `is_draft`
- Updated all mutation endpoints to use this helper instead of returning raw model

```python
def build_application_response(application, current_user: dict) -> ApplicationResponse:
    if current_user["role"] == "officer":
        filtered_docs = [
            d for d in application.documents
            if d.is_current and not d.is_deleted and not d.is_draft
        ]
    else:
        filtered_docs = [
            d for d in application.documents
            if d.is_current and not d.is_deleted
        ]
    return ApplicationResponse(..., documents=filtered_docs)
```

---

## Session 12: Workflow Refinements

### 12.1 Automatic Initial Submission

**Issue:** Operators had to create an application, then separately click Submit. This was confusing UX - they expected "Create" to submit the application.

**Fix:** Modified `NewApplication.tsx` to call both `createApplication()` and `submitApplication()` in sequence. The application is created and immediately submitted, then redirects to the detail page for document uploads.

---

### 12.2 Officers Only See Submitted Applications

**Issue:** Officers could see applications that operators had created but not yet submitted, leading to confusion about incomplete applications.

**Fix:** Added `submitted_at != None` filter to the officer's list query in `applications.py`. Officers now only see applications after the operator has completed initial submission.

---

### 12.3 Pending Deletion Workflow

**Issue:** Document deletion during pending resubmission was immediate, but officers should still see the document until the operator resubmits.

**Fix:** Implemented staged deletion:
- Added `is_pending_deletion` column to Document model (`models.py` line 176)
- During pending resubmission, DELETE endpoint sets this flag instead of `is_deleted`
- Officers continue to see the document without any visual marker (operator's `DocumentUpload` shows "Pending deletion" badge)
- On resubmission, documents with `is_pending_deletion=True` are set to `is_deleted=True`

---

### 12.4 Download Access Controls

**Issue:** Officers could download draft documents that shouldn't be visible to them yet.

**Fix:** Added draft filter to the download endpoint, matching the list and detail endpoint behavior. Officers cannot download documents with `is_draft=True`.

**Note:** Officers intentionally retain download access for pending-deletion documents. These remain visible until the operator resubmits, at which point the deletion is committed and the document is hidden.


---

