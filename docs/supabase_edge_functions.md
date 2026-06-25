# Supabase Edge Functions in Python

<!-- toc -->

- [Overview](#overview)
- [Use Cases in SuperSauced](#use-cases-in-supersauced)
- [Python-Based Implementations](#python-based-implementations)
  - [1. Auth Callback Webhook](#1-auth-callback-webhook)
  - [2. Shopify Sync Webhook (with HMAC Verification)](#2-shopify-sync-webhook-with-hmac-verification)
  - [3. Analytics Event Proxy](#3-analytics-event-proxy)
- [Supabase Integration Points](#supabase-integration-points)
  - [Auth Webhook Triggers](#auth-webhook-triggers)
  - [PostgreSQL Database Webhooks](#postgresql-database-webhooks)
- [Local Testing Guidance](#local-testing-guidance)
  - [Uvicorn Execution](#uvicorn-execution)
  - [Mock curl Requests](#mock-curl-requests)
- [Deployment Details](#deployment-details)
  - [Dockerized Deployment](#dockerized-deployment)
  - [Serverless Deployment (AWS Lambda / GCP Functions)](#serverless-deployment-aws-lambda--gcp-functions)
  - [Setting Dashboard Secrets](#setting-dashboard-secrets)

---

## Overview

While Supabase historically defaults to Deno/TypeScript for Edge Functions, the production backend of **SuperSauced** utilizes **Python-based webhooks and serverless functions** (deployed either as FastAPI endpoints, AWS Lambda, or GCP Cloud Functions). Python provides superior data-science libraries, robust type-checking with Pydantic, and native SDKs that interface seamlessly with Supabase services.

---

## Use Cases in SuperSauced

| Scenario | Trigger | What the function does |
| ---------- | --------- | ----------------------- |
| **Auth Callback** | `auth.users` insert trigger or webhook | Receives raw user metadata, upserts a user profile in `public.user_profiles` using a service-role client (bypassing RLS). |
| **Shopify Sync** | Shopify checkout/paid webhook | Verifies Shopify's HMAC signature, merges bought items into `sauce_log.inventory`, or logs pending credits for guest checkouts. |
| **Analytics Proxy** | App telemetry events | Receives telemetry payloads and forwards them to PostHog and Firebase Analytics concurrently. |

---

## Python-Based Implementations

Below are complete Python implementations for each webhook endpoint, utilizing **FastAPI**, **Pydantic**, and the **Supabase Python SDK**.

### 1. Auth Callback Webhook

This endpoint listens to user registration events and ensures corresponding records are populated in the database.

```python
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.api.deps import get_service_client

router = APIRouter()

@router.post("/auth_callback")
def auth_callback(body: dict, service_client: Client = Depends(get_service_client)):
    """
    Supabase Auth Callback webhook.
    Creates or updates the public user profile when a user registers.
    Uses the service-role client to bypass RLS restrictions.
    """
    user = body.get("user")
    if not user or "id" not in user or "email" not in user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing user info (id and email are required)"
        )
        
    user_metadata = user.get("user_metadata") or {}
    
    # Map raw user metadata to public.user_profiles schema
    profile_data = {
        "id": user["id"],
        "email": user["email"],
        "username": user_metadata.get("username") or user["email"].split("@")[0],
        "full_name": user_metadata.get("full_name") or "",
        "avatar_url": user_metadata.get("avatar_url") or "",
        "onboarding_survey": user_metadata.get("onboarding_survey") or {},
        "sauce_log": user_metadata.get("sauce_log") or {}
    }
    
    try:
        res = service_client.from_("user_profiles").upsert(profile_data, on_conflict="id").execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Upsert failed: database returned empty result."
            )
        return {"success": True, "user": res.data[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upsert failed: {str(e)}"
        )
```

---

### 2. Shopify Sync Webhook (with HMAC Verification)

Verifies webhooks received from Shopify using HMAC SHA-256 signatures, ensuring authenticity, then updates the user's variant history.

```python
import hmac
import hashlib
import base64
import json
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException, status
from supabase import Client
from app.api.deps import get_service_client
from app.core.config import settings

@router.post("/shopify_sync")
async def shopify_sync(request: Request, service_client: Client = Depends(get_service_client)):
    """
    Verify Shopify HMAC signature and update variant inventory in the user's sauce_log.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Shopify-Hmac-Sha256")
    
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Shopify-Hmac-Sha256 signature header"
        )
        
    # Verify HMAC-SHA256 signature
    computed_hmac = hmac.new(
        settings.SHOPIFY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).digest()
    expected_signature = base64.b64encode(computed_hmac).decode("utf-8")
    
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
        
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON body"
        )
        
    email = payload.get("email") or (payload.get("customer") or {}).get("email")
    line_items = payload.get("line_items") or []
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer identifier (email)"
        )
        
    # Query matching profile
    res = service_client.from_("user_profiles").select("*").eq("email", email).execute()
    
    if not res.data:
        # Fallback to pending credit logic if profile doesn't exist (guest checkout)
        pending_credits = []
        for item in line_items:
            sku = item.get("sku")
            quantity = item.get("quantity", 0)
            if sku:
                pending_credits.append({
                    "email": email,
                    "sku": sku,
                    "quantity": quantity
                })
        if pending_credits:
            try:
                service_client.from_("pending_sauce_log_credits").insert(pending_credits).execute()
            except Exception as e:
                return {"success": True, "message": f"User profile not found. Pending credit log skipped: {str(e)}"}
        return {"success": True, "message": "User profile not found, logged pending credits."}
        
    profile = res.data[0]
    profile_id = profile["id"]
    sauce_log = profile.get("sauce_log") or {}
    if "inventory" not in sauce_log:
        sauce_log["inventory"] = {}
        
    inventory = sauce_log["inventory"]
    
    # Merge items into inventory
    for item in line_items:
        sku = item.get("sku")
        quantity = item.get("quantity", 0)
        if sku:
            if sku not in inventory:
                inventory[sku] = {"quantity": 0, "last_updated": ""}
            inventory[sku]["quantity"] += quantity
            inventory[sku]["last_updated"] = datetime.utcnow().isoformat() + "Z"
            
    # Update profile using service-role client
    update_res = service_client.from_("user_profiles").update({"sauce_log": sauce_log}).eq("id", profile_id).execute()
    return {"success": True, "user_profile": update_res.data[0]}
```

---

### 3. Analytics Event Proxy

Forwards telemetry events from mobile devices to third-party providers (PostHog and Firebase) via backend APIs.

```python
import httpx
from pydantic import BaseModel
from fastapi import APIRouter
from app.core.config import settings

class AnalyticsEventRequest(BaseModel):
    event_name: str
    distinct_id: str
    properties: dict = {}

@router.post("/analytics_event")
async def analytics_event(body: AnalyticsEventRequest):
    """
    Proxy event to PostHog and Firebase Google Analytics REST API.
    """
    errors = []
    
    # 1. Forward to PostHog
    posthog_url = f"{settings.POSTHOG_HOST}/capture/"
    posthog_payload = {
        "api_key": settings.POSTHOG_API_KEY,
        "event": body.event_name,
        "properties": {
            "distinct_id": body.distinct_id,
            **body.properties
        }
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(posthog_url, json=posthog_payload, timeout=5.0)
            if resp.status_code >= 400:
                errors.append(f"PostHog returned {resp.status_code}: {resp.text}")
    except Exception as e:
        errors.append(f"PostHog error: {str(e)}")
        
    # 2. Forward to Firebase Analytics
    firebase_url = f"https://firebase.googleapis.com/v1/projects/{settings.FIREBASE_PROJECT_ID}/events:logEvent?key={settings.FIREBASE_API_KEY}"
    firebase_payload = {
        "name": body.event_name,
        "params": {
            "user_id": body.distinct_id,
            **body.properties
        }
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(firebase_url, json=firebase_payload, timeout=5.0)
            if resp.status_code >= 400:
                errors.append(f"Firebase returned {resp.status_code}: {resp.text}")
    except Exception as e:
        errors.append(f"Firebase error: {str(e)}")
        
    if errors:
        return {"success": False, "errors": errors}
    return {"success": True}
```

---

## Supabase Integration Points

### Auth Webhook Triggers

Instead of client-side logic listening to authentication flows, Supabase Auth utilizes webhooks to signal user changes:
1. **User Sign Up/OAuth Login**: Triggered automatically on registration.
2. **Setup in Supabase Dashboard**: Under *Authentication -> Hooks*, register your deployed endpoint URL (e.g. `https://api.supersauced.com/v1/functions/auth_callback`) as the target webhook for auth events. This ensures backend synchronization without client-side intervention.

### PostgreSQL Database Webhooks

You can configure database changes to trigger serverless Python Edge functions via Supabase's PostgreSQL webhooks (using `pg_net` or native HTTP triggers):
* Example trigger setup:
```sql
CREATE OR REPLACE TRIGGER on_recipe_changes
AFTER INSERT OR UPDATE ON public.recipes
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://api.supersauced.com/v1/functions/recipe_update_sync',
  'POST',
  '{"Content-Type": "application/json"}',
  '{}',
  '1000'
);
```

---

## Local Testing Guidance

### Uvicorn Execution

To run the local server for testing the webhooks:
```bash
cd backend_guide
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_ANON_KEY="mock-anon"
export SUPABASE_SERVICE_ROLE_KEY="mock-service-role"
export SUPABASE_JWT_SECRET="test-secret-at-least-32-characters-long"
export SHOPIFY_WEBHOOK_SECRET="test-shopify-secret"
uvicorn app.main:app --reload --port 8000
```

### Mock curl Requests

1. **Test Auth Callback**:
```bash
curl -X POST http://localhost:8000/api/v1/functions/auth_callback \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "d748f321-df1e-4ee0-880c-e2f03f39a1b9",
      "email": "chef@supersauced.com",
      "user_metadata": {
        "username": "saucechef",
        "full_name": "Sauce Chef",
        "onboarding_survey": {"dietary_preferences": ["gluten-free"]}
      }
    }
  }'
```

2. **Test Shopify Sync**:
```bash
# Payload HMAC signature for SHOPIFY_WEBHOOK_SECRET="test-shopify-secret"
# Computed signature header: X-Shopify-Hmac-Sha256: dVdf1K+Q65/Yv8z9g6xN85K8bJp6Y7a3Zf4N7+g6/vA=
curl -X POST http://localhost:8000/api/v1/functions/shopify_sync \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: dVdf1K+Q65/Yv8z9g6xN85K8bJp6Y7a3Zf4N7+g6/vA=" \
  -d '{
    "email": "chef@supersauced.com",
    "line_items": [
      {
        "sku": "sauce-cube-classic",
        "quantity": 3
      }
    ]
  }'
```

3. **Test Analytics Event**:
```bash
curl -X POST http://localhost:8000/api/v1/functions/analytics_event \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "recipe_cooked",
    "distinct_id": "d748f321-df1e-4ee0-880c-e2f03f39a1b9",
    "properties": {
      "recipe_id": "8b5f39a2-df6e-44e2-881b-a2c03f59e211",
      "duration_seconds": 1200
    }
  }'
```

---

## Deployment Details

### Dockerized Deployment

Create a `Dockerfile` at the root of the project to package the Python backend app:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run using Docker:
```bash
docker build -t supersauced-backend .
docker run -p 8000:8000 --env-file .env supersauced-backend
```

### Serverless Deployment (AWS Lambda / GCP Functions)

To deploy as independent serverless endpoints (e.g. via Serverless Framework or AWS SAM):
* Wrap the FastAPI application using `mangum` to make it compatible with AWS API Gateway + Lambda.
```python
# app/lambda_handler.py
from mangum import Mangum
from app.main import app

handler = Mangum(app)
```
* Deploy using Serverless framework `serverless.yml`:
```yaml
service: supersauced-functions
provider:
  name: aws
  runtime: python3.11
  region: us-east-1

functions:
  api:
    handler: app.lambda_handler.handler
    events:
      - httpApi: '*'
```

### Setting Dashboard Secrets

Sensitive keys must not be hardcoded in the codebase.
Configure environment secrets in the **Supabase Dashboard** under *Project Settings -> Edge Functions -> Add Secret* or inside your hosting provider settings (AWS Lambda Env, Render, GCP Env):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `SHOPIFY_WEBHOOK_SECRET`
- `POSTHOG_API_KEY`
- `POSTHOG_HOST`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`
