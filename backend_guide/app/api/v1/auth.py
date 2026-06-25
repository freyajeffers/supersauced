from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any

# Client import removed – using generic client type

from app.api.deps import get_service_client, get_current_user, get_user_client
from app.schemas.auth import (
    SignUpRequest,
    LoginRequest,
    AuthResponse,
    UserSession,
    UserDetail,
    CurrentUser,
)
from app.schemas.user_profile import UserProfile

router = APIRouter()


@router.post(
    "/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
def signup(body: SignUpRequest, client: Any = Depends(get_service_client)):
    """
    Registers a new user with Supabase Auth, forwarding metadata to options.data
    so that the handle_new_user database trigger can initialize the user profile.
    """
    try:
        # Build options metadata matching schema expectations
        metadata = {
            "username": body.username,
            "full_name": body.full_name,
            "avatar_url": body.avatar_url,
            "onboarding_survey": (
                body.onboarding_survey.model_dump() if body.onboarding_survey else {}
            ),
            "sauce_log": body.sauce_log.model_dump() if body.sauce_log else {},
        }

        credentials = {
            "email": body.email,
            "password": body.password,
            "options": {"data": metadata},
        }

        res = client.auth.sign_up(credentials)

        if not res.session:
            # If email verification is enabled, session might be None.
            # Create a placeholder session for mock consistency or raise exception.
            # But let's build the response properly.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup completed, but session could not be established (verification email sent).",
            )

        return AuthResponse(
            session=UserSession(
                access_token=res.session.access_token,
                refresh_token=res.session.refresh_token,
                expires_in=res.session.expires_in,
                token_type=res.session.token_type,
            ),
            user=UserDetail(
                id=res.user.id,
                email=res.user.email,
                username=res.user.user_metadata.get("username"),
                full_name=res.user.user_metadata.get("full_name"),
                avatar_url=res.user.user_metadata.get("avatar_url"),
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Signup failed: {str(e)}"
        )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, client: Any = Depends(get_service_client)):
    """
    Logs in a user with Supabase Auth using email and password.
    """
    try:
        credentials = {"email": body.email, "password": body.password}
        res = client.auth.sign_in_with_password(credentials)

        if not res.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not establish login session.",
            )

        return AuthResponse(
            session=UserSession(
                access_token=res.session.access_token,
                refresh_token=res.session.refresh_token,
                expires_in=res.session.expires_in,
                token_type=res.session.token_type,
            ),
            user=UserDetail(
                id=res.user.id,
                email=res.user.email,
                username=(
                    res.user.user_metadata.get("username")
                    if res.user.user_metadata
                    else None
                ),
                full_name=(
                    res.user.user_metadata.get("full_name")
                    if res.user.user_metadata
                    else None
                ),
                avatar_url=(
                    res.user.user_metadata.get("avatar_url")
                    if res.user.user_metadata
                    else None
                ),
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Login failed: {str(e)}"
        )


@router.get("/user", response_model=UserProfile)
def get_user(
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Any = Depends(get_user_client),
):
    """
    Retrieves the current user's profile from the database.
    Query is delegated to the RLS-enabled user-scoped client.
    """
    try:
        res = (
            user_client.from_("user_profiles")
            .select("*")
            .eq("id", current_user.id)
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found in database.",
            )
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch profile: {str(e)}",
        )
