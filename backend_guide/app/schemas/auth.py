from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.schemas.user_profile import OnboardingSurvey, SauceLog


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(...)
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarding_survey: Optional[OnboardingSurvey] = None
    sauce_log: Optional[SauceLog] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserSession(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserDetail(BaseModel):
    id: str
    email: EmailStr
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    session: UserSession
    user: UserDetail


class CurrentUser(BaseModel):
    id: str
    email: str
    role: str
