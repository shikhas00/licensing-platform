"""
AI verification service - mocked document verification

MOCKED BEHAVIOR:
Verification is deterministic based on filename keywords for predictable testing/demos.

Trigger keywords (case-insensitive):
- "expired" -> FLAGGED: "Document appears to be expired"
- "blurry" or "unclear" -> FLAGGED: "Document quality is too low"
- "invalid" -> FLAGGED: "Document format is invalid"
- "mismatch" -> FLAGGED: "Information does not match application"
- "fake" -> FAILED: "Document authenticity could not be verified"

All other documents -> VERIFIED

Unknown sections -> PENDING (manual review required, fail-safe)

DESIGN PRINCIPLE:
AI verification is advisory only. Results inform the officer but never auto-reject
applications or change application status. Officers make all approval decisions.
"""

import asyncio
import logging
from typing import Callable, Optional

from sqlalchemy.orm import Session

from ..models import AIVerificationStatus, FormSection

logger = logging.getLogger(__name__)

# Injectable session factory for testing - defaults to None, uses SessionLocal if not set
_session_factory: Optional[Callable[[], Session]] = None


def set_session_factory(factory: Optional[Callable[[], Session]]) -> None:
    """Set the session factory for background tasks. Use None to reset to default."""
    global _session_factory
    _session_factory = factory


def get_session() -> Session:
    """Get a database session, using injectable factory if set."""
    if _session_factory is not None:
        return _session_factory()
    # Default: import SessionLocal here to avoid circular imports
    from ..database import SessionLocal
    return SessionLocal()

# Sections that have defined verification rules
KNOWN_SECTIONS = {
    FormSection.BUSINESS_LICENSE,
    FormSection.FLOOR_PLAN,
    FormSection.ID_PROOF,
    FormSection.INSURANCE,
}

# Deterministic flag triggers based on filename keywords
FLAG_TRIGGERS: dict[str, tuple[AIVerificationStatus, str]] = {
    "expired": (
        AIVerificationStatus.FLAGGED,
        "Document appears to be expired. Please provide a current version."
    ),
    "blurry": (
        AIVerificationStatus.FLAGGED,
        "Document quality is too low. Please upload a clearer image."
    ),
    "unclear": (
        AIVerificationStatus.FLAGGED,
        "Document quality is too low. Please upload a clearer image."
    ),
    "invalid": (
        AIVerificationStatus.FLAGGED,
        "Document format is invalid. Please provide a valid document."
    ),
    "mismatch": (
        AIVerificationStatus.FLAGGED,
        "Information does not match application details. Please verify and resubmit."
    ),
    "fake": (
        AIVerificationStatus.FAILED,
        "Document authenticity could not be verified. Manual review required."
    ),
}


def verify_document_sync(
    filename: str,
    section: FormSection,
) -> tuple[AIVerificationStatus, str]:
    """
    Synchronous mock verification - deterministic based on filename.

    This is called by the background task after upload.
    Returns (status, message) tuple.
    """
    logger.info("[MOCK AI] Verifying document: %s for section %s", filename, section.value)

    filename_lower = filename.lower()

    # Check for trigger keywords in filename (deterministic)
    for keyword, (status, message) in FLAG_TRIGGERS.items():
        if keyword in filename_lower:
            logger.info("[MOCK AI] Triggered '%s' -> %s", keyword, status.value)
            return (status, message)

    # Unknown sections go to manual review (fail-safe, not fail-open)
    if section not in KNOWN_SECTIONS:
        logger.info("[MOCK AI] Unknown section '%s' -> PENDING for manual review", section.value)
        return (
            AIVerificationStatus.PENDING,
            f"Section '{section.value}' requires manual officer review."
        )

    # No triggers found, document passes
    logger.info("[MOCK AI] No issues found -> VERIFIED")
    return (
        AIVerificationStatus.VERIFIED,
        "Document verification passed."
    )


async def run_verification_task(document_id: int, filename: str, section: FormSection):
    """
    Background task to run verification after upload.
    Updates the document record with results.

    In production, this would call an actual AI service.
    For MVP, uses deterministic mock verification.

    Error handling: On any failure, sets status to PENDING with a message
    indicating manual review is required. This is fail-safe (not fail-open).
    """
    from ..models import Document

    logger.info("[MOCK AI] Starting background verification for document %s", document_id)

    db = get_session()
    try:
        # Simulate some processing time (would be real AI call in production)
        await asyncio.sleep(0.5)

        # Run verification
        status, message = verify_document_sync(filename, section)

        # Update document in database
        document = db.query(Document).filter(Document.id == document_id).first()
        if document is None:
            logger.warning("[MOCK AI] Document %s not found, skipping verification", document_id)
            return

        document.ai_verification_status = status
        document.ai_verification_message = message
        db.commit()
        logger.info("[MOCK AI] Document %s updated: %s", document_id, status.value)

    except Exception:
        logger.exception("[MOCK AI] Verification failed for document %s", document_id)
        db.rollback()
        # Attempt to mark document as requiring manual review
        try:
            document = db.query(Document).filter(Document.id == document_id).first()
            if document:
                document.ai_verification_status = AIVerificationStatus.PENDING
                document.ai_verification_message = (
                    "Automated verification unavailable. Manual review required."
                )
                db.commit()
        except Exception:
            logger.exception("[MOCK AI] Failed to update document %s after error", document_id)
            db.rollback()
    finally:
        db.close()
