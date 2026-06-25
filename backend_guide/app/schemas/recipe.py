from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


# Recipes
class RecipeBase(BaseModel):
    title: str
    slug: str
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    difficulty: int = Field(..., ge=1, le=3)
    cook_time_minutes: Optional[int] = Field(None, ge=0)
    calories_per_serving: Optional[int] = Field(None, ge=0)
    protein_g: Optional[int] = Field(None, ge=0)
    fat_g: Optional[int] = Field(None, ge=0)
    carbs_g: Optional[int] = Field(None, ge=0)
    cube_tags: List[str] = Field(default_factory=list)
    dietary_tags: List[str] = Field(default_factory=list)
    servings_default: Optional[int] = Field(None, ge=1)
    is_published: bool = False


class RecipeCreate(RecipeBase):
    pass


class RecipeUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    difficulty: Optional[int] = Field(None, ge=1, le=3)
    cook_time_minutes: Optional[int] = Field(None, ge=0)
    calories_per_serving: Optional[int] = Field(None, ge=0)
    protein_g: Optional[int] = Field(None, ge=0)
    fat_g: Optional[int] = Field(None, ge=0)
    carbs_g: Optional[int] = Field(None, ge=0)
    cube_tags: Optional[List[str]] = None
    dietary_tags: Optional[List[str]] = None
    servings_default: Optional[int] = Field(None, ge=1)
    is_published: Optional[bool] = None


class Recipe(RecipeBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# RecipeIngredients
class RecipeIngredientBase(BaseModel):
    recipe_id: str
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)


class RecipeIngredientCreate(RecipeIngredientBase):
    pass


class RecipeIngredientUpdate(BaseModel):
    recipe_id: Optional[str] = None
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)


class RecipeIngredient(RecipeIngredientBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


# RecipeSteps
class RecipeStepBase(BaseModel):
    recipe_id: str
    step_number: int = Field(..., ge=1)
    description: str
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None


class RecipeStepCreate(RecipeStepBase):
    pass


class RecipeStepUpdate(BaseModel):
    recipe_id: Optional[str] = None
    step_number: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None


class RecipeStep(RecipeStepBase):
    id: str

    model_config = ConfigDict(from_attributes=True)
