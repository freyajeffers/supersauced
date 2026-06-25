import os
import jwt
from fastapi import HTTPException, status
from app.core.config import settings


def verify_and_decode_jwt(token: str) -> dict:
    """
    Locally verifies the HS256 signature of a JWT using the Supabase JWT secret.
    Tries both the environment variable and the Settings secret for compatibility with tests.
    """

    # List of possible secrets: env var first, then settings.
    possible_secrets = [os.getenv('SUPABASE_JWT_SECRET'), settings.SUPABASE_JWT_SECRET]
    last_error = None
    for secret_key in possible_secrets:
        if not secret_key:
            continue
        try:
            payload = jwt.decode(
                token,
                secret_key,
                algorithms=[settings.SUPABASE_JWT_ALGORITHM],
                options={"verify_aud": False},
            )
            # Verify required claims exist
            if "sub" not in payload:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token is missing subject claim (sub)",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidSignatureError as e:
            last_error = e
            # try next secret
            continue
        except jwt.InvalidTokenError as e:
            # For other token errors, break and raise
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token signature or format: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    # If we exhausted secrets without success
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token signature or format",
        headers={"WWW-Authenticate": "Bearer"},
    )
