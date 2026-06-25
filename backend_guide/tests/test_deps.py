import os
import pytest
import jwt
from datetime import datetime, timedelta, timezone
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import HTTPException
from app.core.config import settings
from app.api.deps import (
    get_token,
    get_current_user_claims,
    get_current_user,
    get_user_client,
    get_service_client,
)

# Ensure required env vars for JWT operations are set for all tests
@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "test-secret-32-characters-long")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setattr(settings, "SHOPIFY_WEBHOOK_SECRET", "shopify-secret")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-32-characters-long")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SHOPIFY_WEBHOOK_SECRET", "shopify-secret")
    # Default to using mocks; individual tests can override
    monkeypatch.setenv("USE_MOCKS", "true")
    yield

# Helper to create a valid JWT
def make_jwt(sub: str = "test-sub", exp_offset: int = 3600):
    payload = {
        "sub": sub,
        "email": "test@example.com",
        "role": "authenticated",
        "exp": datetime.now(timezone.utc) + timedelta(seconds=exp_offset),
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")

def test_get_token():
    cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="mytoken")
    assert get_token(cred) == "mytoken"

def test_valid_jwt_claims():
    token = make_jwt()
    claims = get_current_user_claims(token)
    assert claims["sub"] == "test-sub"
    assert claims["email"] == "test@example.com"

def test_invalid_jwt_claims():
    bad_token = "invalid.token.here"
    with pytest.raises(HTTPException) as exc:
        get_current_user_claims(bad_token)
    assert exc.value.status_code == 401

def test_expired_jwt():
    token = make_jwt(exp_offset=-10)
    with pytest.raises(HTTPException) as exc:
        get_current_user_claims(token)
    assert exc.value.status_code == 401

def test_current_user_model():
    token = make_jwt()
    claims = get_current_user_claims(token)
    user = get_current_user(claims)
    assert user.id == "test-sub"
    assert user.email == "test@example.com"
    assert user.role == "authenticated"

def test_user_client_calls(monkeypatch):
    calls = {}
    class DummyClient:
        def __init__(self, *a, **kw):
            pass
        class _postgrest:
            @staticmethod
            def auth(token):
                calls["token"] = token
        postgrest = _postgrest()
    monkeypatch.setattr("app.api.deps.create_client", lambda url, key: DummyClient())
    client = get_user_client("mytoken")
    assert calls["token"] == "mytoken"
    assert isinstance(client, DummyClient)

def test_service_client(monkeypatch):
    monkeypatch.setattr("app.api.deps.create_client", lambda url, key: f"client-{key}")
    client = get_service_client()
    assert client == f"client-{os.getenv('SUPABASE_SERVICE_ROLE_KEY')}"
