import os
# Ensure JWT secret is available to Settings before import
os.environ["SUPABASE_JWT_SECRET"] = "super-secret-key-which-is-at-least-32-characters-long"
import sys
import pytest
import jwt
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

# Ensure app directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.main import app
from app.api.deps import get_service_client, get_user_client

# Force testing configuration
settings.SUPABASE_JWT_SECRET = "test-secret-at-least-32-characters-long"
settings.SUPABASE_JWT_ALGORITHM = "HS256"
settings.SHOPIFY_WEBHOOK_SECRET = "test-shopify-secret"

@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)

@pytest.fixture
def generate_jwt():
    """
    Fixture returning a helper function to sign valid/invalid local JWTs for testing.
    """
    def _generate(sub: str, email: str, role: str = "authenticated", expired: bool = False) -> str:
        payload = {
            "sub": sub,
            "email": email,
            "role": role,
            "aud": "authenticated"
        }
        if expired:
            payload["exp"] = datetime.now(timezone.utc) - timedelta(minutes=5)
        else:
            payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=1)
            
        return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm=settings.SUPABASE_JWT_ALGORITHM)
    return _generate

@pytest.fixture
def mock_service_client():
    """
    Mock service-role Supabase client.
    """
    client = MagicMock()
    # Mock auth methods
    client.auth = MagicMock()
    
    # Mock database builder methods
    from_mock = MagicMock()
    client.from_ = from_mock
    
    return client

@pytest.fixture
def mock_user_client():
    """
    Mock user-scoped Supabase client.
    """
    client = MagicMock()
    # Mock database builder methods
    from_mock = MagicMock()
    client.from_ = from_mock
    
    return client

@pytest.fixture(autouse=True)
def override_deps(mock_service_client, mock_user_client):
    """
    Conditionally override FastAPI dependencies with mock Supabase clients.
    Controlled by the environment variable USE_MOCKS (default true).
    """
    import os
    use_mocks = os.getenv("USE_MOCKS", "true").lower() == "true"
    if use_mocks:
        app.dependency_overrides[get_service_client] = lambda: mock_service_client
        app.dependency_overrides[get_user_client] = lambda: mock_user_client
        yield
        app.dependency_overrides.clear()
    else:
        # No overrides – real Supabase clients will be used.
        yield
