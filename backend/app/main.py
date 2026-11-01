from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import engine, Base
from . import models  # noqa: F401 - ensures models are registered
from .routers import applications_router, documents_router, comments_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create database tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title=settings.app_name,
    description="API for regulatory and licensing platform",
    version=settings.app_version,
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": settings.app_name, "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# Register routers
app.include_router(applications_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(comments_router, prefix="/api")
