from typing import Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class OnboardingSurvey(BaseModel):
    dietary_preferences: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="allow")


class SauceInventoryItem(BaseModel):
    quantity: int = Field(default=0, ge=0)
    last_updated: str


class SauceLog(BaseModel):
    inventory: Dict[str, SauceInventoryItem] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class UserProfileBase(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarding_survey: OnboardingSurvey = Field(default_factory=OnboardingSurvey)
    sauce_log: SauceLog = Field(default_factory=SauceLog)


class UserProfileCreate(UserProfileBase):
    id: str
    email: EmailStr


class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarding_survey: Optional[OnboardingSurvey] = None
    sauce_log: Optional[SauceLog] = None


class UserProfile(UserProfileBase):
    id: str
    email: EmailStr
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)
