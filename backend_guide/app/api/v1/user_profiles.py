from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from supabase import Client
except Exception:

    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass


from app.api.deps import get_user_client, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.user_profile import UserProfile, UserProfileUpdate

router = APIRouter()


@router.get("", response_model=List[UserProfile])
def list_profiles(
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Retrieves all visible user profiles.
    Because of RLS policies (Allow select own profile), a standard user
    will only see their own profile in the returned list.
    """
    try:
        res = user_client.from_("user_profiles").select("*").execute()
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to query profiles: {str(e)}",
        )


@router.get("/{id}", response_model=UserProfile)
def get_profile(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Retrieves a single user profile.
    Delegates querying to RLS-enabled user-scoped client. If RLS blocks it,
    it returns empty data, which translates to a 404 Not Found.
    """
    try:
        res = user_client.from_("user_profiles").select("*").eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found or access denied.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch profile: {str(e)}",
        )


@router.put("/{id}", response_model=UserProfile)
def update_profile(
    id: str,
    body: UserProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Updates a user profile.
    Enforces owner-only edits before invoking the update query on the user-scoped client.
    """
    if id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only modify your own profile.",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No update fields provided."
        )

    try:
        res = (
            user_client.from_("user_profiles")
            .update(update_data)
            .eq("id", id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found or update failed.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update profile: {str(e)}",
        )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Deletes a user profile.
    Enforces owner-only deletion.
    """
    if id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only delete your own profile.",
        )

    try:
        res = user_client.from_("user_profiles").delete().eq("id", id).execute()
        # In PostgREST, a successful delete returns empty list or matching objects depending on Prefer header.
        # But we just return 204.
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete profile: {str(e)}",
        )
