"""Document service - file validation and processing logic"""

from typing import Dict, Optional, Set

from fastapi import HTTPException

from ..models import FormSection


# Allowed file types per section (extension -> mime magic bytes prefix)
ALLOWED_FILE_TYPES = {
    "pdf": b"%PDF",
    "jpg": b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
    "png": b"\x89PNG",
}

# Which file types are allowed for each section
SECTION_ALLOWED_TYPES: Dict[FormSection, Set[str]] = {
    FormSection.BUSINESS_LICENSE: {"pdf"},
    FormSection.FLOOR_PLAN: {"pdf", "jpg", "jpeg", "png"},
    FormSection.ID_PROOF: {"pdf", "jpg", "jpeg", "png"},
    FormSection.INSURANCE: {"pdf"},
    FormSection.BUSINESS_INFO: {"pdf"},
    FormSection.CONTACT_INFO: {"pdf"},
    FormSection.ADDRESS: {"pdf"},
    FormSection.OTHER: {"pdf", "jpg", "jpeg", "png"},
}


def detect_file_type(content: bytes) -> Optional[str]:
    """Detect file type from magic bytes. Returns None if unknown."""
    for ext, magic in ALLOWED_FILE_TYPES.items():
        if content.startswith(magic):
            # Normalize jpeg -> jpg
            return "jpg" if ext == "jpeg" else ext
    return None


def validate_file_type(content: bytes, section: FormSection) -> str:
    """
    Validate file type using magic bytes, not trusting client extension.
    Returns the verified file type or raises HTTPException.
    """
    allowed = SECTION_ALLOWED_TYPES.get(section, {"pdf"})
    detected_type = detect_file_type(content)

    if not detected_type:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed)}"
        )

    # Check if detected type is allowed for this section
    if detected_type not in allowed and "jpeg" not in allowed:
        raise HTTPException(
            status_code=415,
            detail=f"File type '{detected_type}' not allowed for section '{section.value}'. Allowed: {', '.join(allowed)}"
        )

    return detected_type


def validate_file_size(content: bytes, max_size: int) -> None:
    """Validate file size. Raises HTTPException if too large."""
    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {max_size // (1024*1024)}MB"
        )
