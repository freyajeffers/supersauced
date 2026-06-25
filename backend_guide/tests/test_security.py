import os, jwt, pytest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.core.security import verify_and_decode_jwt

def make_token(exp_offset=3600):
    payload = {"sub": "123", "exp": datetime.now(timezone.utc) + timedelta(seconds=exp_offset)}
    return jwt.encode(payload, os.getenv("SUPABASE_JWT_SECRET"), algorithm="HS256")

def test_verify_valid():
    token = make_token()
    claims = verify_and_decode_jwt(token)
    assert claims["sub"] == "123"

def test_verify_invalid_signature():
    token = make_token()
    parts = token.split('.')
    bad = parts[0] + '.' + parts[1] + '.bad'
    with pytest.raises(HTTPException) as exc:
        verify_and_decode_jwt(bad)
    assert exc.value.status_code == 401

def test_verify_expired():
    token = make_token(exp_offset=-10)
    with pytest.raises(HTTPException) as exc:
        verify_and_decode_jwt(token)
    assert exc.value.status_code == 401
