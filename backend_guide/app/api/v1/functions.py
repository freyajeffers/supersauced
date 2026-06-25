from datetime import datetime, timezone
import json
import hmac
import hashlib
import base64
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
import httpx

try:
    from supabase import Client
except Exception:

    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass


from app.api.deps import get_service_client
from app.core.config import settings

router = APIRouter()


class AnalyticsEventRequest(BaseModel):
    event_name: str
    distinct_id: str
    properties: Dict[str, Any] = {}


@router.post("/auth_callback")
def auth_callback(body: dict, service_client: Client = Depends(get_service_client)):
    """
    Supabase Auth callback simulation / webhook endpoint.
    Updates or creates a user profile using a service-role client.
    """
    user = body.get("user")
    if not user or "id" not in user or "email" not in user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing user info (id and email are required)",
        )

    user_metadata = user.get("user_metadata") or {}

    # Map the properties from the webhook payload to the public.user_profiles schema fields
    profile_data = {
        "id": user["id"],
        "email": user["email"],
        "username": user_metadata.get("username") or user["email"].split("@")[0],
        "full_name": user_metadata.get("full_name") or "",
        "avatar_url": user_metadata.get("avatar_url") or "",
        "onboarding_survey": user_metadata.get("onboarding_survey") or {},
        "sauce_log": user_metadata.get("sauce_log") or {},
    }

    try:
        res = (
            service_client.from_("user_profiles")
            .upsert(profile_data, on_conflict="id")
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Upsert failed: database returned no data.",
            )
        return {"success": True, "user": res.data[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upsert failed: {str(e)}",
        )


@router.post("/shopify_sync")
async def shopify_sync(
    request: Request, service_client: Client = Depends(get_service_client)
):
    """
    Verifies Shopify HMAC signature and updates a user's sauce_log variant history.
    If the user has not registered yet (guest checkout), records the credits to
    the pending credits table (if available).
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Shopify-Hmac-Sha256")

    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Shopify-Hmac-Sha256 signature header",
        )

    # Verify the HMAC SHA-256 signature
    computed_hmac = hmac.new(
        settings.SHOPIFY_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).digest()
    expected_signature = base64.b64encode(computed_hmac).decode("utf-8")

    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature"
        )

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body"
        )

    email = payload.get("email") or (payload.get("customer") or {}).get("email")
    line_items = payload.get("line_items") or []

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer identifier (email)",
        )

    # Find matching user profile
    try:
        res = (
            service_client.from_("user_profiles")
            .select("*")
            .eq("email", email)
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}",
        )

    if not res.data:
        # Profile not found: attempt to insert to pending table if it exists
        pending_credits = []
        for item in line_items:
            sku = item.get("sku")
            quantity = item.get("quantity", 0)
            if sku:
                pending_credits.append(
                    {"email": email, "sku": sku, "quantity": quantity}
                )
        if pending_credits:
            try:
                service_client.from_("pending_sauce_log_credits").insert(
                    pending_credits
                ).execute()
            except Exception as e:
                # Fallback if table doesn't exist yet
                return {
                    "success": True,
                    "message": f"User profile not found. Pending credit log skipped: {str(e)}",
                }
        return {
            "success": True,
            "message": "User profile not found, logged pending credits.",
        }

    profile = res.data[0]
    profile_id = profile["id"]

    # Load and update current sauce_log
    sauce_log = profile.get("sauce_log") or {}
    if not isinstance(sauce_log, dict):
        sauce_log = {}
    if "inventory" not in sauce_log:
        sauce_log["inventory"] = {}

    inventory = sauce_log["inventory"]

    # Merge new items into inventory
    for item in line_items:
        sku = item.get("sku")
        quantity = item.get("quantity", 0)
        if sku:
            if sku not in inventory:
                inventory[sku] = {"quantity": 0, "last_updated": ""}
            inventory[sku]["quantity"] += quantity
            inventory[sku]["last_updated"] = (
                datetime.now(timezone.utc).isoformat() + "Z"
            )

    # Update profile in Supabase database
    try:
        update_res = (
            service_client.from_("user_profiles")
            .update({"sauce_log": sauce_log})
            .eq("id", profile_id)
            .execute()
        )
        return {"success": True, "user_profile": update_res.data[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update sauce log: {str(e)}",
        )


@router.post("/analytics_event")
async def analytics_event(body: AnalyticsEventRequest):
    """
    Forwards client analytics events to PostHog and Firebase Analytics.
    """
    errors = []

    # 1. Forward to PostHog API
    posthog_url = f"{settings.POSTHOG_HOST}/capture/"
    posthog_payload = {
        "api_key": settings.POSTHOG_API_KEY,
        "event": body.event_name,
        "properties": {"distinct_id": body.distinct_id, **body.properties},
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                posthog_url,
                json=posthog_payload,
                headers={"Authorization": f"Bearer {settings.POSTHOG_API_KEY}"},
                timeout=5.0,
            )
            if resp.status_code >= 400:
                errors.append(
                    f"PostHog capture API returned status {resp.status_code}: {resp.text}"
                )
    except Exception as e:
        errors.append(f"Failed to forward to PostHog: {str(e)}")

    # 2. Forward to Firebase Analytics via REST API
    # Since GA4 requires api_key and project ID from config, we resolve them here
    firebase_api_key = getattr(settings, "FIREBASE_API_KEY", "mock-firebase-api-key")
    firebase_url = f"https://firebase.googleapis.com/v1/projects/{settings.FIREBASE_PROJECT_ID}/events:logEvent?key={firebase_api_key}"
    firebase_payload = {
        "name": body.event_name,
        "params": {"user_id": body.distinct_id, **body.properties},
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(firebase_url, json=firebase_payload, timeout=5.0)
            if resp.status_code >= 400:
                errors.append(
                    f"Firebase REST API returned status {resp.status_code}: {resp.text}"
                )
    except Exception as e:
        errors.append(f"Failed to forward to Firebase: {str(e)}")

    if errors:
        return {"success": False, "errors": errors}
    return {"success": True}
