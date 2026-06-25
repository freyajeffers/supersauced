import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = "super-secret-key-which-is-at-least-32-characters-long"

    PROJECT_NAME: str = "SuperSauced Backend"
    API_V1_STR: str = "/api/v1"
    SUPABASE_JWT_ALGORITHM: str = "HS256"

    # PostHog and Firebase settings for analytics forwarding
    POSTHOG_API_KEY: str = ""
    POSTHOG_HOST: str = ""
    FIREBASE_PROJECT_ID: str = ""

    # Shopify webhook secret
    SHOPIFY_WEBHOOK_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()

# Ensure JWT secret is available as environment variable for test token generation
if not os.getenv("SUPABASE_JWT_SECRET"):
    os.environ["SUPABASE_JWT_SECRET"] = settings.SUPABASE_JWT_SECRET
