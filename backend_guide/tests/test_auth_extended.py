import pytest, os, jwt
from app.core.config import settings
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def make_jwt(sub: str = "user-123", exp_offset: int = 3600):
    payload = {
        "sub": sub,
        "email": "user@example.com",
        "exp": datetime.now(timezone.utc) + timedelta(seconds=exp_offset),
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")

def test_missing_token():
    resp = client.get("/auth/user")
    assert resp.status_code == 401

def test_expired_token():
    token = make_jwt(exp_offset=-10)
    resp = client.get("/auth/user", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()

def test_signup_error_path(monkeypatch):
    class DummyClient:
        class auth:
            @staticmethod
            def sign_up(_):
                raise Exception("boom")
    monkeypatch.setenv("USE_MOCKS", "false")
    monkeypatch.setattr("app.api.deps.create_client", lambda *a, **k: DummyClient())
    payload = {
        "email": "bad@example.com",
        "password": "password",
        "username": "bad",
        "full_name": "Bad",
        "avatar_url": "",
    }
    resp = client.post("/auth/signup", json=payload)
    assert resp.status_code == 400
    assert "Signup failed" in resp.json()["detail"]

def test_login_error_path(monkeypatch):
    class DummyClient:
        class auth:
            @staticmethod
            def sign_in_with_password(_):
                raise Exception("boom")
    monkeypatch.setenv("USE_MOCKS", "false")
    monkeypatch.setattr("app.api.deps.create_client", lambda *a, **k: DummyClient())
    payload = {"email": "bad@example.com", "password": "pwd"}
    resp = client.post("/auth/login", json=payload)
    assert resp.status_code == 400
    assert "Login failed" in resp.json()["detail"]
