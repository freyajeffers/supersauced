from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any

# Provide a functional dummy Supabase client for local development and testing.
# This implementation avoids external dependencies and mimics the minimal interface
# required by the authentication, user profile, and recipe routers.

class _DummyAuth:
    """Mock of Supabase Auth client used for local demo.

    It returns a predictable session and user shape compatible with the existing
    signup/login handlers.
    """
    class _Result:
        def __init__(self, email: str, user_meta: dict | None = None):
            class _Session:
                access_token = "dummy-access-token"
                refresh_token = "dummy-refresh-token"
                expires_in = 3600
                token_type = "bearer"
            class _User:
                def __init__(self, email: str, meta: dict | None = None):
                    self.id = "dummy-id"
                    self.email = email
                    self.user_metadata = meta or {}
            self.session = _Session()
            self.user = _User(email, user_meta)
    def sign_up(self, credentials: dict):
        meta = credentials.get("options", {}).get("data", {})
        return self._Result(credentials.get("email"), meta)
    def sign_in_with_password(self, credentials: dict):
        # For the mock, sign‑in behaves the same as sign‑up.
        return self.sign_up(credentials)

class _DummyPostgrest:
    def auth(self, token: str):
        # No‑op token injection for the dummy client.
        return None

class _DummyClient:
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.auth = _DummyAuth()
        self.postgrest = _DummyPostgrest()
    def from_(self, *args, **kwargs):
        raise NotImplementedError("Supabase client not available in documentation mode.")

def create_client(url: str, key: str) -> _DummyClient:  # type: ignore
    """Fallback ``create_client`` returning a dummy client with minimal auth.

    The dummy client mimics the interface used by the routers (`auth` and
    `postgrest.auth`).
    """
    return _DummyClient(url, key)

from app.core.config import settings
from app.core.security import verify_and_decode_jwt
from app.schemas.auth import CurrentUser

reusable_oauth2 = HTTPBearer()

def get_token(
    credentials: HTTPAuthorizationCredentials = Depends(reusable_oauth2),
) -> str:
    """Dependency to retrieve the raw JWT token from the Authorization header."""
    return credentials.credentials

def get_current_user_claims(token: str = Depends(get_token)) -> dict:
    """Dependency to verify and decode the JWT token, returning the raw claims."""
    return verify_and_decode_jwt(token)

def get_current_user(claims: dict = Depends(get_current_user_claims)) -> CurrentUser:
    """Dependency to construct the CurrentUser schema from decoded JWT claims."""
    return CurrentUser(
        id=claims.get("sub"),
        email=claims.get("email"),
        role=claims.get("role", "authenticated"),
    )

def get_user_client(token: str = Depends(get_token)) -> Any:
    """Dependency injecting a user‑scoped Supabase client (RLS enforced)."""
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(token)
    return client

def get_service_client() -> Any:
    """Dependency injecting a service‑role Supabase client (bypassing RLS)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
