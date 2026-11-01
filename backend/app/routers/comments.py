"""Comments router - officer feedback on applications"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Comment, Document
from ..schemas import CommentCreate, CommentResponse, CommentResolve
from ..services import notify_comment_added
from ..utils import get_current_user, require_application

router = APIRouter(prefix="/applications/{application_id}/comments", tags=["comments"])

# Predefined comment templates for common issues
COMMENT_TEMPLATES = {
    "missing_document": "Required document is missing. Please upload: {document_type}",
    "unclear_document": "Document is unclear or unreadable. Please upload a clearer version.",
    "expired_document": "Document appears to be expired. Please provide a current version.",
    "incomplete_info": "Information is incomplete. Please provide: {missing_fields}",
    "mismatch": "Information does not match other submitted documents. Please verify and correct.",
    "format_issue": "Document format is incorrect. Please provide in PDF format.",
}


@router.get("/templates")
def get_comment_templates():
    """Get predefined comment templates"""
    return COMMENT_TEMPLATES


@router.post("/", response_model=CommentResponse, status_code=201)
def create_comment(
    application_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Add a comment to an application (officer only)"""
    if current_user["role"] != "officer":
        raise HTTPException(status_code=403, detail="Only officers can add comments")

    application = require_application(application_id, db, current_user)

    # Validate document_id if provided
    if comment.document_id:
        document = db.query(Document).filter(
            Document.id == comment.document_id,
            Document.application_id == application_id,
            Document.is_deleted == False,
        ).first()
        if not document:
            raise HTTPException(status_code=400, detail="Document not found")

    # Create comment
    db_comment = Comment(
        application_id=application_id,
        officer_id=current_user["user_id"],
        content=comment.content,
        section=comment.section,
        document_id=comment.document_id,
        revision_number=application.revision_number,
    )
    db.add(db_comment)

    # Assign officer if not already assigned
    if not application.assigned_officer_id:
        application.assigned_officer_id = current_user["user_id"]

    db.commit()
    db.refresh(db_comment)

    # Notify operator
    notify_comment_added(db, application, current_user["user_id"])

    return db_comment


@router.get("/", response_model=list[CommentResponse])
def list_comments(
    application_id: int,
    unresolved_only: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List comments for an application"""
    application = require_application(application_id, db, current_user)

    query = db.query(Comment).filter(Comment.application_id == application_id)

    if unresolved_only:
        query = query.filter(Comment.is_resolved == False)

    return query.order_by(Comment.created_at.desc()).all()


@router.get("/{comment_id}", response_model=CommentResponse)
def get_comment(
    application_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific comment"""
    application = require_application(application_id, db, current_user)

    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.application_id == application_id,
    ).first()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    return comment


@router.patch("/{comment_id}/resolve", response_model=CommentResponse)
def resolve_comment(
    application_id: int,
    comment_id: int,
    resolve: CommentResolve,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Mark a comment as resolved (officer only)"""
    if current_user["role"] != "officer":
        raise HTTPException(status_code=403, detail="Only officers can resolve comments")

    application = require_application(application_id, db, current_user)

    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.application_id == application_id,
    ).first()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.is_resolved = resolve.is_resolved
    if resolve.is_resolved:
        comment.resolved_by = current_user["user_id"]
        comment.resolved_at = datetime.now(timezone.utc)
        comment.resolved_in_revision = application.revision_number
    else:
        # Unresolving
        comment.resolved_by = None
        comment.resolved_at = None
        comment.resolved_in_revision = None

    db.commit()
    db.refresh(comment)

    return comment


@router.get("/by-section/{section}", response_model=list[CommentResponse])
def get_comments_by_section(
    application_id: int,
    section: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get comments for a specific section"""
    application = require_application(application_id, db, current_user)

    comments = db.query(Comment).filter(
        Comment.application_id == application_id,
        Comment.section == section,
    ).order_by(Comment.created_at.desc()).all()

    return comments


@router.get("/by-document/{document_id}", response_model=list[CommentResponse])
def get_comments_by_document(
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get comments for a specific document"""
    application = require_application(application_id, db, current_user)

    comments = db.query(Comment).filter(
        Comment.application_id == application_id,
        Comment.document_id == document_id,
    ).order_by(Comment.created_at.desc()).all()

    return comments
