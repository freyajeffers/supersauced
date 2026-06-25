from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    auth,
    user_profiles,
    functions,
    recipes,
    recipe_ingredients,
    recipe_steps,
    features,
)
from app.core.config import settings
import jwt

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SuperSauced backend application handling Auth, User Profiles, and Edge Functions simulation.",
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for the mobile and web app clients
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers matching the expected URL structures
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(
    user_profiles.router, prefix="/user_profiles", tags=["User Profiles"]
)
app.include_router(functions.router, prefix="/functions", tags=["Edge Functions"])
app.include_router(recipes.router, prefix="/recipes", tags=["Recipes"])
app.include_router(
    recipe_ingredients.router, prefix="/recipe_ingredients", tags=["Ingredients"]
)
app.include_router(recipe_steps.router, prefix="/recipe_steps", tags=["Steps"])

# Optional compatibility routes under /api/v1 prefix
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication (v1)"])
app.include_router(
    user_profiles.router, prefix="/api/v1/user_profiles", tags=["User Profiles (v1)"]
)
app.include_router(
    functions.router, prefix="/api/v1/functions", tags=["Edge Functions (v1)"]
)
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["Recipes (v1)"])
app.include_router(
    recipe_ingredients.router,
    prefix="/api/v1/recipe_ingredients",
    tags=["Ingredients (v1)"],
)
app.include_router(
    recipe_steps.router, prefix="/api/v1/recipe_steps", tags=["Steps (v1)"]
)
app.include_router(features.router, prefix="/api/v1/features", tags=["Feature Stubs"])
app.include_router(features.router, prefix="/v1/features", tags=["Feature Stubs"])


@app.get("/health", tags=["System"])
def health_check():
    """
    Simple health check route to verify the service is running.
    """
    return {"status": "ok", "version": "1.0.0"}
