import pytest
from unittest.mock import MagicMock
from fastapi import status
from fastapi.testclient import TestClient

class MockSession:
    access_token = "mock-access-token"
    refresh_token = "mock-refresh-token"
    expires_in = 3600
    token_type = "bearer"

class MockUser:
    id = "user-uuid-123"
    email = "test@example.com"
    user_metadata = {
        "username": "testuser",
        "full_name": "Test User",
        "avatar_url": "http://avatar.url"
    }

class MockAuthResponse:
    session = MockSession()
    user = MockUser()

def test_signup_success(test_client: TestClient, mock_service_client):
    # Mock sign_up return value
    mock_service_client.auth.sign_up.return_value = MockAuthResponse()
    
    payload = {
        "email": "test@example.com",
        "password": "securepassword123",
        "username": "testuser",
        "full_name": "Test User",
        "avatar_url": "http://avatar.url",
        "onboarding_survey": {
            "dietary_preferences": ["vegan"]
        },
        "sauce_log": {
            "inventory": {}
        }
    }
    
    resp = test_client.post("/auth/signup", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["session"]["access_token"] == "mock-access-token"
    assert data["user"]["id"] == "user-uuid-123"
    assert data["user"]["email"] == "test@example.com"
    
    # Assert signature of signup was called correctly
    mock_service_client.auth.sign_up.assert_called_once()
    args, kwargs = mock_service_client.auth.sign_up.call_args
    called_creds = args[0] if args else kwargs.get("credentials")
    assert called_creds["email"] == "test@example.com"
    assert called_creds["options"]["data"]["username"] == "testuser"
    assert called_creds["options"]["data"]["onboarding_survey"] == {"dietary_preferences": ["vegan"]}

def test_signup_validation_errors(test_client: TestClient):
    # Too short password
    payload = {
        "email": "invalid-email",
        "password": "123"
    }
    resp = test_client.post("/auth/signup", json=payload)
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_login_success(test_client: TestClient, mock_service_client):
    mock_service_client.auth.sign_in_with_password.return_value = MockAuthResponse()
    
    payload = {
        "email": "test@example.com",
        "password": "securepassword123"
    }
    resp = test_client.post("/auth/login", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["session"]["access_token"] == "mock-access-token"
    assert data["user"]["email"] == "test@example.com"
    
    mock_service_client.auth.sign_in_with_password.assert_called_once_with({
        "email": "test@example.com",
        "password": "securepassword123"
    })

def test_login_failure(test_client: TestClient, mock_service_client):
    mock_service_client.auth.sign_in_with_password.side_effect = Exception("Invalid credentials")
    
    payload = {
        "email": "test@example.com",
        "password": "wrongpassword"
    }
    resp = test_client.post("/auth/login", json=payload)
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert "Login failed" in resp.json()["detail"]

def test_get_user_profile_success(test_client: TestClient, mock_user_client, generate_jwt):
    user_id = "user-uuid-123"
    email = "test@example.com"
    token = generate_jwt(sub=user_id, email=email)
    
    # Mock user client database queries
    mock_query_res = MagicMock()
    mock_query_res.data = {
        "id": user_id,
        "email": email,
        "username": "testuser",
        "full_name": "Test User",
        "avatar_url": "http://avatar.url",
        "onboarding_survey": {"dietary_preferences": ["vegan"]},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }
    
    mock_user_client.from_.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_query_res
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/auth/user", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["id"] == user_id
    assert data["email"] == email
    assert data["username"] == "testuser"
    assert data["onboarding_survey"]["dietary_preferences"] == ["vegan"]

def test_get_user_profile_unauthorized_missing_token(test_client: TestClient):
    resp = test_client.get("/auth/user")
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_get_user_profile_expired_token(test_client: TestClient, generate_jwt):
    token = generate_jwt(sub="123", email="expired@example.com", expired=True)
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/auth/user", headers=headers)
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert "expired" in resp.json()["detail"].lower()
