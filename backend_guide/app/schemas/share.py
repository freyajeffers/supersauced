from pydantic import BaseModel, ConfigDict
from typing import Optional

class Share(BaseModel):
    id: int
    user_id: str
    recipe_id: str
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
