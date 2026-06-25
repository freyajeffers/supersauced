from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class CommentBase(BaseModel):
    recipe_id: str
    user_id: str
    content: str = Field(..., min_length=1, max_length=1000)
    parent_id: Optional[str] = None  # support threaded replies

class CommentCreate(CommentBase):
    pass

class CommentUpdate(BaseModel):
    content: Optional[str] = None
    parent_id: Optional[str] = None

class Comment(CommentBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
