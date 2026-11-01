from .applications import router as applications_router
from .documents import router as documents_router
from .comments import router as comments_router

__all__ = [
    "applications_router",
    "documents_router",
    "comments_router",
]
