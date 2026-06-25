# Python FastAPI Auth & User Profile API Design Strategy

## 1. Executive Summary
This document outlines the recommended design strategy for implementing user authentication and user profile management in a Python FastAPI backend for SuperSauced. The system leverages Supabase Auth (GoTrue) for secure user authentication, locally verifies JWT tokens for sub-millisecond route protection, and integrates with the PostgreSQL schema utilizing DB triggers for automatic profile creation.

---

## 2. Evidence Chain & Workspace Observations

The design strategy is informed by the following specific components and configurations observed in the workspace:

| Observation | Source File / Location | Relevance |
| :--- | :--- | :--- |
| **`user_profiles` Schema** | `backend_guide/database/migrations/00002_core_schema.sql` (lines 2–12) | Defines columns `id` (references `auth.users(id)`), `email`, `username`, `full_name`, `avatar_url`, and the JSONB columns `onboarding_survey` and `sauce_log` which must be handled by FastAPI endpoints. |
| **Automatic Profile Trigger** | `docs/auth_integration.md` (lines 698–774) | Shows that when a user registers on Supabase Auth, a `SECURITY DEFINER` trigger `handle_new_user()` automatically extracts details from `raw_user_meta_data` to initialize the `user_profiles` table, meaning `/auth/signup` should populate this metadata on registration. |
| **JWT Claims & RLS Policies** | `backend_guide/database/migrations/00004_rls_policies.sql` (lines 8–16) | Implements Row Level Security (RLS) restricting reads/writes on `public.user_profiles` to `auth.uid() = id`. This dictates how the FastAPI backend must authorize profile operations. |
| **API Endpoints Specifications** | `docs/api_spec.yaml` (lines 8–103) & `docs/api_spec.md` (lines 48–77) | Defines RESTful path routing and schemas for `/user_profiles` and `/user_profiles/{id}`, which are matched in our proposed routes. |
| **Shopify Display Shelf Inventory** | `docs/auth_integration.md` (lines 873–889) | Defines the nested structure of `sauce_log` JSONB mapping, which requires FastAPI validation to prevent data corruption. |

---

## 3. Proposed Directory Structure

To support scalable and clean division of concerns, the FastAPI application should follow a modular architecture:

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Application setup, lifespan hooks, CORS, middleware, global router mounts
│   ├── core/
│   │   ├── config.py           # Settings management (Pydantic-settings) for Supabase credentials & JWT secrets
│   │   └── security.py         # JWT decoding, signature checking, cryptographic verification
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py             # FastAPI dependency injection (Auth verification, DB sessions, Supabase clients)
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── api.py          # Combined router for v1 endpoints
│   │       ├── auth.py         # Routes: /auth/signup, /auth/login, /auth/user
│   │       └── user_profiles.py# Routes: /user_profiles, /user_profiles/{id}
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py             # Pydantic validation schemas for credentials and login tokens
│   │   └── user_profile.py     # Pydantic validation schemas for user profiles (including onboarding & sauce log structures)
│   └── services/
│       ├── __init__.py
│       ├── supabase_client.py  # Supabase client pool managers (anon client vs. service_role client)
│       └── profile_service.py  # Business logic separating routes from direct database queries
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Pytest fixtures, database transaction rollback managers, mock JWT generators
│   ├── test_auth.py            # API tests for authentication endpoints
│   └── test_user_profiles.py   # API tests for user profile queries and updates
├── requirements.txt            # Package dependencies (fastapi, uvicorn, supabase, PyJWT, pydantic-settings, etc.)
└── .env                        # Local environment credentials (git-ignored)
```

---

## 4. Supabase Integration Strategy

### 4.1. Two-Tier Client Architecture
FastAPI must initialize and manage two distinct Supabase clients to balance user privilege boundary enforcement with administrative capabilities:
1. **User-Authenticated Client**: Initialized dynamically per request using the user's bearer token (`supabase.postgrest.auth(jwt_token)`). This ensures any database querying performed directly via the client respects RLS policies (`auth.uid() = id`).
2. **Service Role Client (Admin Bypass)**: Initialized once globally using the Supabase `SERVICE_ROLE_KEY`. This client bypasses all RLS checks. It must be carefully guarded and reserved for backend-to-backend operations, such as creating users in Supabase Auth or managing external webhook syncs.

### 4.2. Signup Flow (`/auth/signup`)
- **Action**: Receive client parameters (email, password, username, full name, avatar URL, onboarding survey, sauce log).
- **Integration**: Forward the email and password to Supabase Auth API using the python client SDK (`supabase.auth.sign_up()`). 
- **Metadata Registration**: Place the extra user parameters (`username`, `full_name`, `avatar_url`, `onboarding_survey`, `sauce_log`) into the `options.data` payload (mapped to `raw_user_meta_data` in Supabase Auth).
- **Trigger Alignment**: This triggers the SQL function `public.handle_new_user()` in the database to cleanly insert a matched record into `public.user_profiles` automatically.
- **Response**: Return the Supabase User object, or auto-login the user and return the initial JWT session keys.

### 4.3. Login Flow (`/auth/login`)
- **Action**: Receive user email and password.
- **Integration**: Invoke `supabase.auth.sign_in_with_password({"email": email, "password": password})`.
- **Response**: Return the resulting JWT `access_token` (typically valid for 1 hour) and the `refresh_token` to the B2C client.

---

## 5. JWT Authentication Strategy

JWT verification must be optimized to prevent unnecessary external network calls, ensuring fast response times.

```
                    +------------------------------------+
                    |       Incoming API Request         |
                    | (Authorization: Bearer <JWT Token>)|
                    +------------------------------------+
                                      |
                                      v
                      [FastAPI HTTPBearer Dependency]
                                      |
                                      v
                      [Local Cryptographic Validation]
                      - Verify signature using HS256 JWT_SECRET
                      - Verify expiration time (exp claim)
                      - Verify token audience ("authenticated")
                                      |
                      +---------------+---------------+
                      |                               |
                      v (Valid Claims)                v (Failed Checks)
               [Extract JWT Claims]             [Raise HTTP 401 Unauthorized]
               - uid (sub claim)
               - email
               - role (e.g. cms_editor)
                      |
                      v
             [Inject User Context]
```

### 5.1. Local Cryptographic JWT Verification (Recommended)
Because Supabase Auth issues standard JWTs signed with `HS256` using the project's secret key, the FastAPI backend can verify tokens locally using `PyJWT` or `python-jose`.
- **Methodology**:
  - The JWT is extracted from the `Authorization: Bearer <TOKEN>` header.
  - The token is decrypted and verified using the environment variable `SUPABASE_JWT_SECRET`.
  - Validate parameters:
    - Signature validation (validates that the token was signed by the specific Supabase project).
    - Expiration (`exp` check).
    - Audience (`aud` check, which defaults to `'authenticated'`).
  - Extract claims into a FastAPI `CurrentUser` schemas dependency:
    - `sub`: User ID (UUID).
    - `email`: User's email.
    - `role`: Role claim (e.g. `authenticated`, `cms_editor`).
- **Advantage**: Zero-network round trips for route protection, keeping database queries performant.

### 5.2. External Session Lookup (Alternative)
- **Methodology**: Pass the JWT token to `supabase.auth.get_user(token)`.
- **Trade-off**: High latency. This adds an external HTTP call to the Supabase Auth server for every protected route. It should only be used if instant token revocation checks are required at the API level (though standard token expirations of 1 hour coupled with active refresh storage handle this on mobile).

---

## 6. User Profile Management Strategy

The `/user_profiles` and `/user_profiles/{id}` endpoints must wrap database actions while reinforcing data integrity and auth constraints.

### 6.1. Route Permissions & Validations
1. **GET `/user_profiles`**:
   - Resolves the current user's profile based on the decoded JWT `sub` ID.
   - If an `id` query parameter is supplied, check if the query ID matches the logged-in user's UUID OR if the user is a `cms_editor`. If not authorized, raise `HTTP 403 Forbidden`.
2. **GET `/user_profiles/{id}`**:
   - Verify JWT. Assert `claims.sub == id` OR `claims.role == 'cms_editor'`.
   - Retrieve and return user profile details from the `user_profiles` table.
3. **PUT/PATCH `/user_profiles/{id}`**:
   - Verify JWT. Assert `claims.sub == id` (Only the profile owner can modify their profile).
   - Validate the input payload using strong Pydantic schemas (particularly for `onboarding_survey` and `sauce_log` JSON fields) to prevent corrupt JSON objects from breaking downstream database triggers or edge functions.
   - Write modifications to the database.

### 6.2. Schema Validation for JSONB Fields
To secure JSONB structures, FastAPI should define Pydantic models mapping expected nested structures:
- **`OnboardingSurveySchema`**:
  - `preferences`: List of tags (`list[str]`).
  - `experience_level`: Level rating (`str`).
- **`SauceLogSchema`**:
  - `inventory`: Dict mapping variants/SKUs to details:
    ```python
    class SauceInventoryItem(BaseModel):
        quantity: int = Field(ge=0)
        last_updated: datetime
    ```
  - `saved_recipes`: List of recipe IDs (`list[UUID]`).

---

## 7. Security and Implementation Recommendations

1. **Environment Secrets**: Keep `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_JWT_SECRET` in a secure `.env` file. Never expose the service role key to frontends.
2. **Error Boundary Handling**: Raise clean FastAPI exceptions. Return standard JSON schemas for authentication failures (`HTTP 401 Unauthorized`) and permission failures (`HTTP 403 Forbidden`).
3. **CORS Headers**: Ensure CORS middleware in `main.py` is configured to authorize calls only from known mobile schemas or secure domains, preventing cross-site scripting vulnerabilities.
4. **Testing**: Write unit tests mocks for Supabase client calls. Use PyJWT to build locally signed test tokens to verify the dependency injection pipeline works without hitting live Supabase servers.
