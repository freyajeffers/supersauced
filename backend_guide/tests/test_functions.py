import json
import hmac
import hashlib
import base64
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import status
from fastapi.testclient import TestClient

from app.core.config import settings

def test_auth_callback(test_client: TestClient, mock_service_client):
    mock_query_res = MagicMock()
    mock_query_res.data = [{
        "id": "user-uuid-123",
        "email": "callback@example.com",
        "username": "callback_user",
        "full_name": "Callback User",
        "avatar_url": "http://avatar",
        "onboarding_survey": {},
        "sauce_log": {},
        "created_at": "2026-06-24T00:00:00Z",
        "updated_at": "2026-06-24T00:00:00Z"
    }]
    
    mock_service_client.from_.return_value.upsert.return_value.execute.return_value = mock_query_res
    
    payload = {
        "user": {
            "id": "user-uuid-123",
            "email": "callback@example.com",
            "user_metadata": {
                "username": "callback_user",
                "full_name": "Callback User",
                "avatar_url": "http://avatar"
            }
        }
    }
    
    resp = test_client.post("/functions/auth_callback", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["success"] is True
    assert resp.json()["user"]["username"] == "callback_user"
    mock_service_client.from_.assert_called_with("user_profiles")

def test_shopify_sync_success(test_client: TestClient, mock_service_client):
    payload = {
        "email": "shopify_user@example.com",
        "line_items": [
            {
                "sku": "SKU-CUBE-SPICY",
                "quantity": 2
            }
        ]
    }
    
    # Calculate real HMAC using the settings secret
    body_bytes = json.dumps(payload).encode("utf-8")
    computed_hmac = hmac.new(
        settings.SHOPIFY_WEBHOOK_SECRET.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).digest()
    signature = base64.b64encode(computed_hmac).decode("utf-8")
    
    # Mock user query
    mock_query_res = MagicMock()
    mock_query_res.data = [{
        "id": "user-uuid-999",
        "email": "shopify_user@example.com",
        "sauce_log": {
            "inventory": {
                "SKU-CUBE-SPICY": {
                    "quantity": 1,
                    "last_updated": "2026-06-24T00:00:00Z"
                }
            }
        }
    }]
    
    mock_service_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_query_res
    
    # Mock update
    mock_update_res = MagicMock()
    mock_update_res.data = [{
        "id": "user-uuid-999",
        "email": "shopify_user@example.com",
        "sauce_log": {
            "inventory": {
                "SKU-CUBE-SPICY": {
                    "quantity": 3,  # 1 (existing) + 2 (purchased)
                    "last_updated": "2026-06-24T10:00:00Z"
                }
            }
        }
    }]
    mock_service_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_res
    
    headers = {"X-Shopify-Hmac-Sha256": signature}
    resp = test_client.post("/functions/shopify_sync", content=body_bytes, headers=headers)
    
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["success"] is True
    assert resp.json()["user_profile"]["sauce_log"]["inventory"]["SKU-CUBE-SPICY"]["quantity"] == 3

def test_shopify_sync_invalid_signature(test_client: TestClient):
    payload = {
        "email": "shopify_user@example.com",
        "line_items": []
    }
    
    headers = {"X-Shopify-Hmac-Sha256": "wrong-signature"}
    resp = test_client.post("/functions/shopify_sync", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid webhook signature" in resp.json()["detail"]

@patch("httpx.AsyncClient.post", new_callable=AsyncMock)
def test_analytics_event(mock_post, test_client: TestClient):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "Success"
    mock_post.return_value = mock_resp
    
    payload = {
        "event_name": "start_cooking",
        "distinct_id": "user-uuid-123",
        "properties": {
            "recipe_id": "recipe-uuid-555",
            "cuisine": "Mexican"
        }
    }
    
    resp = test_client.post("/functions/analytics_event", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == {"success": True}
    
    # Assert two posts (one for PostHog, one for Firebase)
    assert mock_post.call_count == 2
