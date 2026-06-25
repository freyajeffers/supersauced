import pytest
from unittest.mock import MagicMock
from fastapi import status
from fastapi.testclient import TestClient

def test_list_profiles(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    mock_query_res = MagicMock()
    mock_query_res.data = [{
        "id": "user-123",
        "email": "user123@example.com",
        "username": "user123",
        "full_name": "User 123",
        "avatar_url": "http://avatar",
        "onboarding_survey": {"dietary_preferences": []},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    
    mock_user_client.from_.return_value.select.return_value.execute.return_value = mock_query_res
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/user_profiles", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == "user-123"

def test_get_profile_by_id_success(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    mock_query_res = MagicMock()
    mock_query_res.data = [{
        "id": "user-123",
        "email": "user123@example.com",
        "username": "user123",
        "full_name": "User 123",
        "avatar_url": "http://avatar",
        "onboarding_survey": {"dietary_preferences": []},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    
    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_query_res
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/user_profiles/user-123", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["id"] == "user-123"

def test_get_profile_by_id_not_found(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    mock_query_res = MagicMock()
    mock_query_res.data = []  # Empty results represent 404/RLS filter out
    
    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_query_res
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/user_profiles/other-user-uuid", headers=headers)
    assert resp.status_code == status.HTTP_404_NOT_FOUND

def test_update_profile_success(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    mock_query_res = MagicMock()
    mock_query_res.data = [{
        "id": "user-123",
        "email": "user123@example.com",
        "username": "new_username",
        "full_name": "New Name",
        "avatar_url": "http://avatar",
        "onboarding_survey": {"dietary_preferences": ["gluten-free"]},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    
    mock_user_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = mock_query_res
    
    payload = {
        "username": "new_username",
        "full_name": "New Name",
        "onboarding_survey": {
            "dietary_preferences": ["gluten-free"]
        }
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put("/user_profiles/user-123", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["username"] == "new_username"
    assert resp.json()["onboarding_survey"]["dietary_preferences"] == ["gluten-free"]

def test_update_profile_forbidden(test_client: TestClient, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    payload = {
        "full_name": "New Name"
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put("/user_profiles/different-user-uuid", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert "Forbidden" in resp.json()["detail"]

def test_delete_profile_success(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    mock_query_res = MagicMock()
    mock_query_res.data = []
    
    mock_user_client.from_.return_value.delete.return_value.eq.return_value.execute.return_value = mock_query_res
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.delete("/user_profiles/user-123", headers=headers)
    assert resp.status_code == status.HTTP_204_NO_CONTENT

def test_delete_profile_forbidden(test_client: TestClient, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.delete("/user_profiles/different-user-uuid", headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
