# MVP Scope

## Scope and rationale

This assessment MVP focuses on **Use Case 1: Operator Application Submission & Resubmission** and **Use Case 2: Officer Application Review & Feedback**. The priority is a demonstrable feedback/resubmission cycle with retained form data, contextual comments, and officer review. Use Case 3 is deferred to keep the implementation manageable within the three-day assessment constraint. Selected-use-case requirements that remain incomplete are identified below.

## Architecture

The backend uses FastAPI, Pydantic, SQLAlchemy, and SQLite to expose a REST API. The frontend uses React, TypeScript, Vite, and Tailwind CSS, with role-specific pages and shared components. Backend modules separate routing, validation, persistence models, service functions, and access-control helpers, although routers still orchestrate business operations. Authentication and AI verification are mocked, and notifications are persisted with mock email logging. Documents are stored locally with UUID filenames, keeping the demo self-contained without external credentials.

SQLite and local storage minimise setup; FastAPI provides request validation and API documentation, while React supports reusable operator/officer interfaces.

## Features delivered

| Area | Current implementation |
| --- | --- |
| Operator submission | Business/contact/address form, drag-and-drop uploads, section-specific file checks, and downloadable documents. The creation UI automatically calls initial submission. |
| Verification | Per-document badges and operator polling for deterministic mock results; flagged/failed issues appear in officer review. AI is advisory and never changes application status. |
| Feedback | General and section-linked comments, predefined templates, and prominent unresolved feedback during resubmission. |
| Resubmission | Prefilled edits, draft replacements, separate Save Changes and Resubmit actions, and no configured round limit. |
| Document deletion | Draft/unsubmitted documents can be deleted immediately. During pending resubmission, deletion of submitted documents is staged: operators see a pending-deletion label, officers retain access until resubmission. Deletion is exposed through the API; the UI has no delete action. |
| Officer review | Submitted applications in grouped status filters; organised form/document review, downloads, status changes, and comment resolution. |
| History and comparison | Submitted form snapshots, previous comments, status history, and highlighted differences between the latest two form revisions. Document comparison is partial. |
| Notifications | Status changes create operator notification records; resubmission creates a record for the assigned officer. Delivery is mocked through logging. |

## Incomplete acceptance criteria

- **Completion progress:** no overall completion indicator or defined required-document checklist.
- **Document-specific feedback:** API supports `document_id`, but the UI only provides section linking.
- **Revision browsing:** no operator version browser or arbitrary-version comparison. Document membership is not snapshotted per revision, so previous filenames/deletions are not reliably represented.
- **Complete audit guarantees:** comments, snapshots, status history, and soft deletion retain information, but resolution changes are not separate events and concurrency protection is incomplete. Revision 1 can be updated before officer review starts.

## Mocks and deferrals

| Area | Decision and reason |
| --- | --- |
| Use Case 3 | Defer site inspections, checklist drafts, and per-item clarification to focus on pre-site review. Related enum values do not imply the workflow is implemented. |
| Authentication | Demo identity and role headers; no real identity verification. Replace before use with real users or documents. |
| AI verification | Filename keywords provide reproducible results without external services; no OCR or authenticity analysis. |
| Notification delivery | Database records and logs demonstrate triggers without an email provider. Real email and an inbox UI are deferred. |
| Storage/infrastructure | Real local file storage; cloud storage, durable jobs, migrations, CI/CD, and production hosting are deferred. |

## Workflow and assumptions

- One operator owns an application; any officer may review submitted applications. The first officer to comment or change status is assigned when no officer is assigned.
- UI creation calls `POST /api/applications/` followed by `POST /api/applications/{id}/submit`; create-only API applications remain hidden from officers.
- `PUT /api/applications/{id}` saves changes. Resubmit explicitly creates the next form snapshot, publishes draft replacements/deletions, changes status to Pre-Site Resubmitted, and creates the assigned officer's notification.
- Form sections are fixed. Only business name is mandatory in the reduced form; the brief does not prescribe the licensing form schema.
- **Approval-label ambiguity:** follow the page 4 mapping: officers see Route to Approval, operators see Pending Approval. Page 5's final-outcome-only constraint appears under deferred Use Case 3. This is an explicit interpretation of the conflicting wording.
- Site-visit entry is disabled; the MVP review flow can proceed directly to Pending Approval. Labels and some rules are duplicated in frontend/backend code; status history displays internal values.

## Limitations and next steps

**Current limitations:** operators cannot delete draft applications or withdraw submitted ones (abandoned drafts remain in their list; withdrawal would require a status transition, not deletion). Cross-section document replacements are accepted; officer lists/mutation responses can expose working form values while detail shows the submitted snapshot; optional fields cannot reliably be cleared. Submit in an unavailable state can return success without doing anything. Upload validation/cleanup, download error feedback, polling cancellation/manual-review handling, accessibility, and load-error recovery need improvement.

**Engineering priorities:** centralise workflow operations and transaction ownership, snapshot document membership, and strengthen database integrity/concurrency constraints. Notification helpers currently commit the caller's session; SQLite foreign keys are not enabled and timestamps can lose their UTC offset. Add migrations, strict TypeScript checks, isolated test defaults, CI, and runtime-data ignore rules before production deployment.

**Future AI integration:** Replace the filename-based mock behind the verification service with document text extraction/OCR and an LLM returning structured findings. Run verification through durable background jobs with timeouts and retries, configure credentials through environment settings, and retain manual officer review for uncertain or failed results. AI findings would remain advisory, with officers making approval decisions.

**Latest verification:** frontend production build passed; backend tests passed **58/58** with one Pydantic configuration deprecation warning. A full Playwright run passed 69 tests; the remaining five passed after test fixes and targeted reruns, including draft visibility, pending deletion/download access, and preserving an original after deleting its draft replacement. The final 74-test suite has not been rerun uninterrupted after those fixes. These are the latest recorded results, not a new verification run for this documentation edit; setup and execution commands belong in README.md.
