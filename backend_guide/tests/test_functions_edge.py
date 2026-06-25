import json, hmac, hashlib, base64, os
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

def make_signature(body_bytes: bytes) -> str:
    secret = settings.SHOPIFY_WEBHOOK_SECRET.encode()
    digest = hmac.new(secret, body_bytes, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()

def test_shopify_sync_success(test_client: TestClient, mock_service_client):
    # Mock select response
    mock_select_res = MagicMock()
    mock_select_res.data = [{
        "id": "user-1",
        "email": "shopify_user@example.com",
        "sauce_log": {"inventory": {}}
    }]
    mock_service_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = mock_select_res
    
    # Mock update response
    mock_update_res = MagicMock()
    mock_update_res.data = [{
        "id": "user-1",
        "email": "shopify_user@example.com",
        "sauce_log": {
            "inventory": {
                "SKU-TEST": {"quantity": 2, "last_updated": "2026-06-24T00:00:00Z"}
            }
        }
    }]
    mock_service_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = mock_update_res
    
    payload = {
        "email": "shopify_user@example.com",
        "line_items": [{"sku": "SKU-TEST", "quantity": 2}]
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    signature = make_signature(body_bytes)
    resp = test_client.post("/functions/shopify_sync", content=body_bytes,
                            headers={"X-Shopify-Hmac-Sha256": signature})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user_profile"]["sauce_log"]["inventory"]["SKU-TEST"]["quantity"] == 2

def test_shopify_sync_missing_hmac(test_client: TestClient):
    payload = {"email": "a@b.c", "line_items": []}
    resp = test_client.post("/functions/shopify_sync", json=payload)
    assert resp.status_code == 401

def test_shopify_sync_invalid_hmac(test_client: TestClient):
    payload = {"email": "a@b.c", "line_items": []}
    resp = test_client.post("/functions/shopify_sync", json=payload,
                            headers={"X-Shopify-Hmac-Sha256": "bad"})
    assert resp.status_code == 401
