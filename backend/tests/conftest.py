"""Pytest fixtures for backend tests"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.services.ai_verification import set_session_factory


# Use file-backed SQLite for tests (creates test.db in current directory)
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with overridden database dependency"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Also override session factory for background tasks (e.g., AI verification)
    set_session_factory(TestingSessionLocal)

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    set_session_factory(None)  # Reset to default


@pytest.fixture
def operator_headers():
    """Headers for operator user"""
    return {
        "X-User-ID": "operator-1",
        "X-User-Role": "operator"
    }


@pytest.fixture
def officer_headers():
    """Headers for officer user"""
    return {
        "X-User-ID": "officer-1",
        "X-User-Role": "officer"
    }


@pytest.fixture
def sample_application_data():
    """Sample application data for tests"""
    return {
        "business_name": "Test Business",
        "business_type": "Restaurant",
        "contact_name": "John Doe",
        "contact_email": "john@test.com",
        "contact_phone": "555-1234",
        "address": "123 Test St"
    }
