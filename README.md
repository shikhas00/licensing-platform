# Licensing Platform

An MVP regulatory and licensing platform where operators submit license applications and officers review them.

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 20.19+ or 22.12+

### Backend

```bash
# From project root, create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt

# Start the server (from backend/)
uvicorn app.main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs

### Frontend

```bash
# From project root (in a new terminal)
cd frontend
npm install

# Start the dev server (from frontend/)
npm run dev
```

Frontend runs at http://localhost:5173

### Demo Users

The app uses mocked authentication. On the login page, select a role:

- **Operator**: Can submit applications, upload documents, respond to feedback
- **Officer**: Can review applications, add comments, change status

### Demo Walkthrough

**1. Operator submits an application**
1. Log in as **Operator** (note your User ID for later)
2. Click "New Application"
3. Fill in business details (only Business Name is required) and click "Create Application"
4. On the application detail page, upload a document - try naming it `expired_license.pdf` to trigger a FLAGGED verification
5. The application is automatically submitted - you'll see status "Submitted"

**2. Officer reviews and requests changes**
1. Log out and log in as **Officer**
2. Click on the application in the Review Queue
3. See the uploaded documents with AI verification badges
4. Change status to "Under Review"
5. Add a comment: select a section, type feedback (or use a template)
6. Change status to "Pending Pre-Site Resubmission"

**3. Operator responds to feedback**
1. Log out and log in as **Operator** (use the same User ID as step 1)
2. Open the application - notice the status and officer comments displayed prominently
3. Update the flagged section or upload a replacement document
4. Click "Save Changes", then click "Resubmit Application"

**4. Officer reviews changes**
1. Log back in as **Officer**
2. Open the application - status is now "Pre-Site Resubmitted"
3. See the "What Changed" section showing differences from the previous revision
4. Resolve comments that have been addressed
5. Change status to "Route to Approval", then to "Approved" (or request another round)

**Tips:**
- Upload files named `blurry_scan.pdf` or `fake_id.png` to see different verification results
- Multiple resubmission rounds are supported - repeat steps 2-4 as needed
- Check the API at http://localhost:8000/docs to explore endpoints directly

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Backend | FastAPI | Async API with automatic OpenAPI docs, excellent file upload support, fast development |
| ORM | SQLAlchemy | Mature ORM with good migration support, works well with FastAPI |
| Database | SQLite | Zero-setup, portable, perfect for MVP demos |
| Frontend | React + TypeScript | Type-safe components, large ecosystem |
| Build | Vite | Fast HMR, simple config |
| Styling | Tailwind CSS | Utility-first, rapid prototyping |


## Features Built

This MVP implements Use Case 1 (Operator Submission) and Use Case 2 (Officer Review). Use Case 3 (Site Visit) is deferred. See [SCOPE.md](SCOPE.md) for detailed scope decisions, incomplete criteria, and assumptions.

### Use Case 1: Operator Submission

- Submit new application with business details
- Upload documents with drag-and-drop
- View AI verification status per document
- See officer comments linked to sections (document linking via API only)
- Resubmit with updated data and replacement documents
- Track application status through the workflow

### Use Case 2: Officer Review

- View all submitted applications with status filtering
- Review application details and documents
- See AI verification results and flagged issues
- Add comments tied to sections (document linking via API only)
- Use predefined comment templates
- Change application status (creates notification record, mock delivery)
- Compare latest two form revisions (document comparison partial)
- Mark comments as resolved

## Project Structure

```
backend/
├── app/
│   ├── routers/          # API endpoints
│   │   ├── applications.py
│   │   ├── documents.py
│   │   └── comments.py
│   ├── services/         # Business logic
│   │   ├── status.py     # Status mapping & transitions
│   │   ├── notifications.py
│   │   ├── ai_verification.py
│   │   └── document_service.py  # File type validation
│   ├── main.py           # FastAPI app
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic schemas
│   └── database.py       # DB connection
└── tests/

frontend/
├── src/
│   ├── api/              # API client
│   ├── components/       # Shared UI components
│   ├── hooks/            # Custom hooks (useAuth)
│   ├── pages/
│   │   ├── operator/     # Operator views
│   │   └── officer/      # Officer views
│   └── types/            # TypeScript types
└── index.html
```

## What's Mocked

| Feature | Implementation |
|---------|----------------|
| Authentication | User ID and role passed in headers (`X-User-ID`, `X-User-Role`) |
| AI Verification | Deterministic based on filename keywords (e.g., "expired" → FLAGGED) |
| Notifications | Logged to console, stored in DB, no actual email or inbox UI |
| File Storage | Real local storage (`uploads/`), replacing cloud storage for MVP |

### AI Verification Keywords

Upload documents with these keywords in the filename to trigger specific results:

- `expired` → FLAGGED: "Document appears to be expired"
- `blurry` / `unclear` → FLAGGED: "Document quality is too low"
- `invalid` → FLAGGED: "Document format is invalid"
- `mismatch` → FLAGGED: "Information does not match application"
- `fake` → FAILED: "Document authenticity could not be verified"
- (other) → VERIFIED in supported sections; sections requiring manual review remain PENDING

## API Overview

All endpoints are prefixed with `/api` (e.g., `/api/applications`).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/applications` | GET | List applications (filtered by role) |
| `/applications` | POST | Create new application |
| `/applications/{id}` | GET | Get application details |
| `/applications/{id}` | PUT | Update application data |
| `/applications/{id}/submit` | POST | Submit or resubmit application |
| `/applications/{id}/status` | PATCH | Change status (officer only) |
| `/applications/{id}/revisions/{rev}` | GET | Get specific revision for comparison |
| `/applications/{id}/documents` | GET | List documents |
| `/applications/{id}/documents` | POST | Upload document |
| `/applications/{id}/documents/{id}` | GET | Get document metadata |
| `/applications/{id}/documents/{id}` | DELETE | Soft delete (immediate or staged until resubmission) |
| `/applications/{id}/documents/{id}/download` | GET | Download file content |
| `/applications/{id}/documents/{id}/history` | GET | Get document version history |
| `/applications/{id}/comments` | GET | List comments |
| `/applications/{id}/comments` | POST | Add comment (officer only) |
| `/applications/{id}/comments/templates` | GET | Get predefined comment templates |
| `/applications/{id}/comments/{id}` | GET | Get specific comment |
| `/applications/{id}/comments/{id}/resolve` | PATCH | Mark comment resolved |

Full API documentation at http://localhost:8000/docs when running.

## AI Usage

### Tools Used

- **Claude Code** (Anthropic) - Primary development assistant for code generation, architecture decisions, and documentation

For a detailed log of prompts, outputs, and corrections, see [docs/AI_LOG.md](docs/AI_LOG.md).

### Example Prompts

1. "Design the data model for tracking application revisions and ensuring no data is lost between resubmission rounds"
2. "Implement status transition validation - officers can change status based on workflow rules, operators can only trigger resubmission"
3. "Create a mocked AI verification service that's deterministic for testing"

### Review Process and Corrections

Generated code was reviewed for correctness and security. Specific corrections made:

- **Draft document visibility**: Initial design committed documents immediately on upload. Added `is_draft` flag so officers don't see uncommitted changes until operator resubmits.
- **Section validation**: Changed `section` field from String to Enum. Claude suggested String for flexibility, but Enum prevents typos like "buisness_info".
- **Database initialization**: Initial version called `Base.metadata.create_all()` on every request. Moved to lifespan context manager for one-time setup.
- **Notification scope**: Initial version only notified operators. Added officer notification when operators resubmit.
- **File type validation**: Initial trust-the-extension approach replaced with magic-byte detection to prevent disguised uploads.

Testing included:
- API endpoints tested via Swagger UI and pytest (58 backend tests)
- Frontend components verified across key status transitions
- Playwright E2E tests (74 tests) covering submission, resubmission, and review flows

### What Was Discarded

- Initial random AI verification approach replaced with deterministic keyword-based system for reliable demos
- Complex diff-based revision tracking replaced with simpler full snapshots
- Over-engineered comment threading system simplified to flat comments with section/document links

## What I Would Do Next

### Security

- [ ] Real authentication (OAuth2/JWT) instead of header-based mock
- [ ] Rate limiting on API endpoints
- [ ] Stronger file parsing and virus scanning (basic signature checks exist)
- [ ] CORS configuration for production

### Features

- [ ] Real AI document verification integration (OCR, expiry detection)
- [ ] Email notifications via SendGrid/SES
- [ ] Cloud file storage (S3) with signed URLs
- [ ] Bulk document upload with progress tracking
- [ ] Manual officer assignment/reassignment (auto-assignment exists)
- [ ] Dashboard with analytics

### Infrastructure

- [ ] PostgreSQL for production (SQLite doesn't scale)
- [ ] Database migrations with Alembic
- [ ] Docker containerization
- [ ] CI/CD pipeline with automated tests
- [ ] Monitoring and logging (Sentry, structured logs)

### UX

- [ ] Real-time updates via WebSockets
- [ ] Full revision browser with selectable versions (form diff exists)
- [ ] Rich text editor for comments
- [ ] Mobile-responsive design improvements
- [ ] Accessibility audit (WCAG compliance)

## Running Tests

### Backend (pytest)

```bash
cd backend
pytest
```

### Frontend (Playwright E2E)

Requires backend server running. Tests use the development database by default.

```bash
cd frontend

# Build frontend (required before tests)
npm run build

# Install Chromium (first time only)
npx playwright install chromium

# Run all tests
npm run test

# Run with visible browser
npm run test:headed

# Run with Playwright UI
npm run test:ui

# View test report
npx playwright show-report
```

**Note:** Tests run against the development database and may create/modify data.

## License

MIT
