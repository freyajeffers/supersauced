from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class RatingBase(BaseModel):
    user_id: str
    recipe_id: str
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RatingCreate(RatingBase):
    pass

class Rating(RatingBase):
    id: int
