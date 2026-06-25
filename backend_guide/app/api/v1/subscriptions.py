from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

try:
    from supabase import Client  # type: ignore
except Exception:
    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass

from app.api.deps import get_service_client, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate, Subscription

router = APIRouter()

# Require admin role for managing subscription tiers
def _require_admin(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user

@router.get("/", response_model=List[Subscription])
def list_subscriptions(admin: CurrentUser = Depends(_require_admin), service_client: Client = Depends(get_service_client)):
    """List all subscription tiers (RevenueCat integration placeholder)."""
    try:
        res = service_client.from_("subscriptions").select("*").execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to list subscriptions: {str(e)}")

@router.post("/", response_model=Subscription, status_code=status.HTTP_201_CREATED)
def create_subscription(body: SubscriptionCreate, admin: CurrentUser = Depends(_require_admin), service_client: Client = Depends(get_service_client)):
    """Create a new subscription tier."""
    try:
        res = service_client.from_("subscriptions").insert(body.model_dump()).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create subscription")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Create subscription failed: {str(e)}")

@router.put("/{id}", response_model=Subscription)
def update_subscription(id: str, body: SubscriptionUpdate, admin: CurrentUser = Depends(_require_admin), service_client: Client = Depends(get_service_client)):
    """Update an existing subscription tier."""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No update fields provided.")
    try:
        res = service_client.from_("subscriptions").update(update_data).eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found or update failed.")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Update subscription failed: {str(e)}")

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(id: str, admin: CurrentUser = Depends(_require_admin), service_client: Client = Depends(get_service_client)):
    """Delete a subscription tier."""
    try:
        service_client.from_("subscriptions").delete().eq("id", id).execute()
        return None
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Delete subscription failed: {str(e)}")
