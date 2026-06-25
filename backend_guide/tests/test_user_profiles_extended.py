import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from fastapi import status
from app.main import app

def test_profile_crud(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-1", email="u@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Get profile (Read)
    mock_select_res = MagicMock()
    mock_select_res.data = [{
        "id": "user-1",
        "email": "u@example.com",
        "username": "u1",
        "full_name": "User 1",
        "avatar_url": "",
        "onboarding_survey": {"dietary_preferences": []},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_select_res
    
    resp = test_client.get("/user_profiles/user-1", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["username"] == "u1"
    
    # 2. Update profile (Update)
    mock_update_res = MagicMock()
    mock_update_res.data = [{
        "id": "user-1",
        "email": "u@example.com",
        "username": "newname",
        "full_name": "User 1",
        "avatar_url": "",
        "onboarding_survey": {"dietary_preferences": []},
        "sauce_log": {"inventory": {}},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    mock_user_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_res
    
    upd = {"username": "newname"}
    resp = test_client.put("/user_profiles/user-1", json=upd, headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["username"] == "newname"
    
    # 3. Delete profile (Delete)
    mock_delete_res = MagicMock()
    mock_delete_res.data = []
    mock_user_client.from_.return_value.delete.return_value.eq.return_value.execute.return_value = mock_delete_res
    
    resp = test_client.delete("/user_profiles/user-1", headers=headers)
    assert resp.status_code == status.HTTP_204_NO_CONTENT
