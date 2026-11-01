"""Documents router - file upload and management"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Document, FormSection, AIVerificationStatus, ApplicationStatus
from ..schemas import DocumentResponse
from ..services import validate_file_type, validate_file_size
from ..services.ai_verification import run_verification_task
from ..utils import get_current_user, require_application, check_editable_status

router = APIRouter(prefix="/applications/{application_id}/documents", tags=["documents"])
settings = get_settings()


@router.post("/", response_model=DocumentResponse, status_code=201)
async def upload_document(
    application_id: int,
    background_tasks: BackgroundTasks,
    section: FormSection = Form(..., description="Form section this document belongs to"),
    file: UploadFile = File(..., description="Document file to upload"),
    supersedes_id: int = Form(None, description="ID of document this replaces (for resubmission)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a document for an application (operator only).

    File type is validated using magic bytes (not trusting extension).
    Document is saved with PENDING status, then AI verification runs async.
    """
    if current_user["role"] != "operator":
        raise HTTPException(status_code=403, detail="Only operators can upload documents")

    application = require_application(application_id, db, current_user, require_owner=True)
    check_editable_status(application)

    # Read and validate file
    content = await file.read()
    validate_file_size(content, settings.max_upload_size)
    verified_type = validate_file_type(content, section)

    # Generate unique filename with verified extension
    unique_filename = f"{uuid.uuid4()}.{verified_type}"

    # Ensure upload directory exists
    upload_dir = Path(settings.upload_dir) / str(application_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save file
    file_path = upload_dir / unique_filename
    with open(file_path, "wb") as f:
        f.write(content)

    # Check if this is a draft (uploading during pending resubmission - officer shouldn't see yet)
    is_draft = application.status in [
        ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION,
        ApplicationStatus.PENDING_POST_SITE_RESUBMISSION,
    ]

    # Validate supersedes_id belongs to this application (security: prevent cross-app references)
    if supersedes_id:
        old_doc = db.query(Document).filter(
            Document.id == supersedes_id,
            Document.application_id == application_id,
            Document.is_deleted == False,
        ).first()
        if not old_doc:
            raise HTTPException(
                status_code=400,
                detail="Invalid supersedes_id: document not found in this application"
            )

        # Check for existing draft replacement of the same original document
        # If one exists, delete it to prevent duplicate replacements
        existing_draft_replacement = db.query(Document).filter(
            Document.application_id == application_id,
            Document.supersedes_id == supersedes_id,
            Document.is_draft == True,
            Document.is_deleted == False,
        ).first()
        if existing_draft_replacement:
            existing_draft_replacement.is_deleted = True

        # Only mark old document as non-current if NOT creating a draft
        # For drafts, old doc stays visible to officers until resubmission
        if not is_draft:
            old_doc.is_current = False

    # Create document record with PENDING status (verification runs async)
    document = Document(
        application_id=application_id,
        filename=file.filename,
        file_path=str(file_path),
        file_type=verified_type,
        file_size=len(content),
        section=section,
        ai_verification_status=AIVerificationStatus.PENDING,
        ai_verification_message="Verification in progress...",
        revision_number=application.revision_number,
        supersedes_id=supersedes_id,
        is_draft=is_draft,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Start async verification task (won't block upload response)
    background_tasks.add_task(
        run_verification_task,
        document_id=document.id,
        filename=file.filename,
        section=section,
    )

    return document


@router.get("/", response_model=list[DocumentResponse])
def list_documents(
    application_id: int,
    current_only: bool = True,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List documents for an application"""
    require_application(application_id, db, current_user)  # Validates access

    query = db.query(Document).filter(
        Document.application_id == application_id,
        Document.is_deleted == False,
    )

    if current_only:
        query = query.filter(Document.is_current == True)

    # Officers don't see draft documents (pending deletions visible until resubmit)
    if current_user["role"] == "officer":
        query = query.filter(Document.is_draft == False)

    return query.order_by(Document.uploaded_at.desc()).all()


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific document (poll this to check verification status)"""
    require_application(application_id, db, current_user)  # Validates access

    query = db.query(Document).filter(
        Document.id == document_id,
        Document.application_id == application_id,
        Document.is_deleted == False,
    )

    # Officers don't see draft documents (pending deletions visible until resubmit)
    if current_user["role"] == "officer":
        query = query.filter(Document.is_draft == False)

    document = query.first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return document


@router.get("/{document_id}/download")
def download_document(
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Download the actual file content for a document"""
    require_application(application_id, db, current_user)  # Validates access

    query = db.query(Document).filter(
        Document.id == document_id,
        Document.application_id == application_id,
        Document.is_deleted == False,
    )

    # Officers don't see draft documents (pending deletions visible until resubmit)
    if current_user["role"] == "officer":
        query = query.filter(Document.is_draft == False)

    document = query.first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check file exists on disk
    file_path = Path(document.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    # Determine media type
    media_types = {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
    }
    media_type = media_types.get(document.file_type, "application/octet-stream")

    return FileResponse(
        path=file_path,
        filename=document.filename,
        media_type=media_type,
    )


@router.delete("/{document_id}", status_code=204)
def delete_document(
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Soft delete a document (operator only, during allowed statuses)"""
    if current_user["role"] != "operator":
        raise HTTPException(status_code=403, detail="Only operators can delete documents")

    application = require_application(application_id, db, current_user, require_owner=True)
    check_editable_status(application)

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.application_id == application_id,
        Document.is_deleted == False,
        Document.is_pending_deletion == False,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Determine if we can delete immediately or need pending deletion
    # Pending deletion is only needed when officer has already reviewed the document
    can_delete_immediately = (
        document.is_draft  # Draft docs not visible to officers
        or not application.submitted_at  # Not yet submitted, officers haven't seen it
        or application.status == ApplicationStatus.APPLICATION_RECEIVED  # Initial submission, still editing
    )

    if can_delete_immediately:
        document.is_deleted = True
        document.is_current = False
    else:
        # Submitted documents during resubmission get marked for pending deletion
        # Officers continue to see them until operator resubmits
        document.is_pending_deletion = True

    db.commit()

    return None


@router.get("/{document_id}/history", response_model=list[DocumentResponse])
def get_document_history(
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get version history for a document (all versions in the replacement chain)"""
    require_application(application_id, db, current_user)  # Validates access

    is_officer = current_user["role"] == "officer"

    # Initial document lookup - officers can't see drafts
    query = db.query(Document).filter(
        Document.id == document_id,
        Document.application_id == application_id,
    )
    if is_officer:
        query = query.filter(Document.is_draft == False)

    document = query.first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Build the replacement chain
    history = [document]

    # Walk back through supersedes chain (security: only follow docs in same application)
    current = document
    while current.supersedes_id:
        prev_query = db.query(Document).filter(
            Document.id == current.supersedes_id,
            Document.application_id == application_id,  # Prevent cross-app traversal
        )
        # Officers can't see drafts in history either
        if is_officer:
            prev_query = prev_query.filter(Document.is_draft == False)

        prev = prev_query.first()
        if prev:
            history.append(prev)
            current = prev
        else:
            break

    # Return in chronological order (oldest first)
    return list(reversed(history))
