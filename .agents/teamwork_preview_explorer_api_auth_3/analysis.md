# Python FastAPI Authentication and User Profile Design Strategy

This document provides a design strategy for implementing robust, production-grade authentication and user profile endpoints in Python FastAPI. The strategy leverages the existing database schema, Row-Level Security (RLS) policies, and triggers defined in the SuperSauced database layer.

---

## 1. Directory Structure Strategy

We recommend a modular, layered directory structure that separates concerns (routing, schemas, dependencies, core logic, and external service clients). This structure aligns with FastAPI best practices and makes it easy to maintain and scale.

```text
src/
├── main.py                     # Application entry point, CORS middleware, exception handlers
├── core/
│   ├── config.py               # Pydantic BaseSettings for config validation (Supabase URL, keys, JWT secret)
│   ├── security.py             # Local JWT decoding, validation helper functions
│   └── supabase.py             # Supabase client singleton provider (both Admin and Delegated clients)
├── api/
│   ├── dependencies.py         # FastAPI Depends providers (get_db, get_current_user, get_supabase_client)
│   ├── router.py               # Main API Router aggregating v1 routers
│   └── v1/
│       ├── auth.py             # Endpoints: /auth/signup, /auth/login, /auth/user
│       └── profiles.py         # Endpoints: /user_profiles, /user_profiles/{id}
├── schemas/
│   ├── auth.py                 # Pydantic request/response schemas for login, signup, and user payload
│   └── profiles.py             # Pydantic schemas for UserProfile, onboarding survey, and sauce log
└── services/
    ├── auth_service.py         # Domain logic for interacting with Supabase GoTrue Auth
    └── profile_service.py      # Domain logic for querying/mutating public.user_profiles
```

### Purpose of Key Modules
- **`core/config.py`**: Validates environment variables (like `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`) using `pydantic-settings`.
- **`core/security.py`**: Performs local, sub-millisecond cryptographic verification of Supabase-issued JWTs using the project's shared `SUPABASE_JWT_SECRET`.
- **`api/dependencies.py`**: Defines reusable dependencies. For example, `get_current_user` extracts the JWT from the `Authorization: Bearer <token>` header, verifies it locally, and returns a domain `User` representation.
- **`schemas/`**: Enforces strict input validation and output filtering using Pydantic models. This ensures no database details or internal parameters leak to the client.
- **`services/`**: Encapsulates data logic and interacts with the Supabase clients. By abstracting the Supabase SDK calls behind services, the API routes remain thin and easily testable.

---

## 2. JWT Authentication Strategy

Supabase Auth uses JWTs signed with the project's unique JWT Secret using the `HS256` algorithm. To achieve high performance, the FastAPI backend should perform **local JWT validation** instead of making a round-trip network call to the Supabase Auth API for every incoming request.

### 2.1 JWT Verification Flow
```
[Client] --(Request with Bearer Token)--> [FastAPI Security Dependency]
                                                       |
                                            (Local JWT Verification)
                                            - Decode using JWT_SECRET
                                            - Verify algorithm is HS256
                                            - Verify audience is 'authenticated'
                                            - Verify exp (expiration)
                                                       |
                                           [Decoded JWT Claims (UUID, role)]
                                                       |
                                            (Inject into Request Context)
```

### 2.2 Local vs. Remote Verification

| Metric | Local Verification (Recommended) | Remote Verification (`auth.get_user`) |
| --- | --- | --- |
| **Performance** | Sub-millisecond (cryptographic check in-memory) | 50–150ms (requires external HTTP request) |
| **Network Overhead**| Zero | One HTTP request per authenticated endpoint call |
| **Revocation Check**| None (relies on token expiration) | Real-time check against Supabase session database |
| **Dependency** | None (only requires the secret key) | Requires active network connection to Supabase |

**Recommendation:** Use Local Verification for standard requests due to speed. For high-privilege operations (e.g., password changes or profile deletions), optional remote verification can be used as a fallback to guarantee that the session has not been revoked.

### 2.3 JWT Claims Integration
The decoded JWT payload contains claims that FastAPI should extract and map:
- `sub`: The database-level UUID of the user (maps to `user_profiles.id`).
- `role`: The security role claim (e.g., `authenticated`, `cms_editor`).
- `email`: User's email address.

These values should be parsed into a Pydantic `CurrentUser` model and injected into request handlers via FastAPI's dependency injection system:
```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    # Decode token using settings.SUPABASE_JWT_SECRET
    # Validate expiration, audience, and algorithm
    # Return CurrentUser(id=claims["sub"], email=claims["email"], role=claims["role"])
```

---

## 3. Supabase Integration Strategy

The Python FastAPI backend will act as a coordinator, communicating with Supabase via the official `supabase-py` SDK. There are two primary paradigms for this integration:

### 3.1 Paradigm A: Delegated User-Scoped client (Recommended)
FastAPI instantiates a Supabase client using the **Anon Key** and injects the user's incoming JWT token into the request headers:
```python
client = create_client(supabase_url, supabase_anon_key)
client.postgrest.auth(user_jwt_token)
```
- **Pros:** Respects and enforces all database-level **Row-Level Security (RLS)** policies defined in PostgreSQL (e.g., `auth.uid() = id`). The database blocks unauthorized access directly, ensuring FastAPI cannot accidentally leak rows.
- **Cons:** Slightly more overhead to instantiate a user-scoped client per request.
- **Use Case:** All reading and updating of user profiles (`GET`, `PUT`, `PATCH` on `/user_profiles/{id}`).

### 3.2 Paradigm B: Admin/Service Role Client
FastAPI instantiates a single persistent Supabase client using the **Service Role Key**:
- **Pros:** Bypasses RLS. High performance, simpler connection pool.
- **Cons:** Bypassing RLS puts the burden of authorization checks entirely on the FastAPI application code. An oversight in Python logic could lead to data exposure.
- **Use Case:** Administrative scripts, background synchronization (e.g. Shopify Display Shelf Webhook processing), and creating users during signup if additional validation is required.

---

## 4. Endpoint Design & Mapping

### 4.1 `/auth/signup` (POST)
- **Request Body:** Email, Password, Username, Full Name, and Onboarding Survey.
- **Service Logic:**
  1. Call Supabase Auth signup (`supabase.auth.sign_up`).
  2. Map the metadata fields (`username`, `full_name`, `onboarding_survey`) to the GoTrue signup options metadata dictionary (`options.data`), which maps to `raw_user_meta_data` in PostgreSQL.
  3. Supabase Auth inserts the new record into the internal table `auth.users`.
  4. The PostgreSQL trigger `handle_new_user()` fires automatically, securely extracting the metadata, checking for username collisions, and creating the matching `public.user_profiles` entry (as detailed in `docs/auth_integration.md`).
- **Response:** `201 Created` with user details (id, email) and a confirmation status.

### 4.2 `/auth/login` (POST)
- **Request Body:** Email and Password.
- **Service Logic:**
  1. Call Supabase Auth sign-in (`supabase.auth.sign_in_with_password`).
  2. Receive the access token (JWT), refresh token, and user metadata from GoTrue.
- **Response:** `200 OK` returning access token, refresh token, token type (Bearer), and expiration.

### 4.3 `/auth/user` (GET)
- **Request Header:** Bearer token.
- **Service Logic:**
  1. Extract and decode the JWT locally to verify its signature.
  2. Return the parsed user information (ID, email, roles).
- **Response:** `200 OK` with user identification payload.

### 4.4 `/user_profiles` (GET & POST)
- **GET `/user_profiles`** (Query Profiles):
  - Returns a list of profiles. To avoid information leakage, RLS automatically limits standard users to seeing only their own profile.
  - If a CMS Editor queries this, the RLS policies or app-level policies determine if they can view other profiles.
- **POST `/user_profiles`** (Create Profile Manually):
  - Standard user registration goes through `/auth/signup` and is handled automatically by the database trigger.
  - This endpoint acts as a manual fallback. It must enforce that the payload `id` matches `auth.uid()`.

### 4.5 `/user_profiles/{id}` (GET, PUT, DELETE)
- **GET `/user_profiles/{id}`**:
  - The endpoint queries `user_profiles` filtering by ID.
  - If using a delegated user client, RLS filters the row out if it does not belong to the user. The database returns an empty result set, which FastAPI converts into a `404 Not Found` or `403 Forbidden` response.
- **PUT/PATCH `/user_profiles/{id}`**:
  - Updates profile fields (such as `username`, `full_name`, `avatar_url`, `onboarding_survey`, `sauce_log`).
  - Request body schemas must validate that structure modifications are sound (e.g. `onboarding_survey` and `sauce_log` adhere to their structured JSON format).
  - delegated clients ensure that users cannot update profiles of other users.
- **DELETE `/user_profiles/{id}`**:
  - Deletes the profile.
  - Due to foreign key references with `ON DELETE CASCADE`, deleting the user in Supabase Auth (or public.user_profiles, depending on cascade direction) will clean up all associated data. Note that deleting auth users usually requires service role privileges.

---

## 5. Security & Validation Recommendations

1. **Robust Schema Validations:** Use Pydantic's `Field` and custom validators to ensure incoming `onboarding_survey` and `sauce_log` payloads conform to strict JSON schemas, preventing corrupted JSONB inserts.
2. **Username Collision Handling:** The DB trigger handles database-level collisions, but the FastAPI app should perform a proactive check during signup if it wants to return user-friendly validation errors before committing.
3. **CORS and Middleware:** Enforce CORS policies so that only the official Next.js web application and the React Native app can call the endpoints.
4. **Error Mapping:** Map Supabase HTTP errors (e.g., `422` or `409` conflict errors) to standard FastAPI `HTTPException` responses with proper REST status codes.
