# Design Strategy: Python FastAPI Auth & User Profiles

This analysis report provides a structured design strategy and architectural plan for implementing authentication and user profile endpoints in Python FastAPI, integrating seamlessly with Supabase Auth, PostgreSQL 16 schema, and Row-Level Security (RLS) policies.

---

## 1. Executive Summary

This design defines how the Super Sauced backend will expose and secure user-related endpoints. Rather than bypassing the database security layer, this design utilizes a hybrid architecture:
1. **Local JWT Verification**: FastAPI validates Supabase-issued JWTs locally using HS256 and the shared `SUPABASE_JWT_SECRET`. This prevents unnecessary network latency and API requests to Supabase on every call.
2. **Row-Level Security (RLS) Delegation**: For resource access, FastAPI initializes user-scoped Supabase client calls by forwarding the caller's JWT. This allows the PostgreSQL database to evaluate RLS policies natively (e.g. `auth.uid() = id`), keeping authorization logic unified in SQL.
3. **Database Trigger Synchronization**: Sign-up metadata containing onboarding survey preferences and initial sauce logs is forwarded to Supabase's `raw_user_meta_data`. This triggers the atomic creation of user profiles in the public database schema via the existing `handle_new_user()` trigger.

---

## 2. Directory Structure

A modular, domain-driven structure is recommended for the Python FastAPI project to ensure scalability, ease of testing, and maintainability.

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Application entry point & middleware mounting
│   ├── core/                   # Application config & global definitions
│   │   ├── __init__.py
│   │   ├── config.py           # Settings validation via pydantic-settings (Pydantic v2)
│   │   └── security.py         # JWT local decoding, validation, and claim helpers
│   ├── db/                     # Supabase client instantiation
│   │   ├── __init__.py
│   │   └── supabase.py         # Factory functions for User-scoped and Service-role clients
│   ├── dependencies/           # FastAPI dependency injection functions
│   │   ├── __init__.py
│   │   ├── auth.py             # User authentication extraction & JWT parsing
│   │   └── db.py               # Database client extraction dependencies
│   ├── schemas/                # Request & response validation models (Pydantic v2)
│   │   ├── __init__.py
│   │   ├── auth.py             # Signup, Login, and Token schemas
│   │   └── profile.py          # UserProfile schema matching api_spec.yaml
│   └── api/                    # API Route Endpoints
│       ├── __init__.py
│       ├── v1/
│       │   ├── __init__.py
│       │   ├── api.py          # Main v1 API router aggregating endpoints
│       │   └── endpoints/
│       │       ├── __init__.py
│       │       ├── auth.py     # Routes: /auth/signup, /auth/login, /auth/user
│       │       └── profiles.py # Routes: /user_profiles, /user_profiles/{id}
│   ├── tests/                  # Pytest verification suite
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   └── test_profiles.py
├── .env                        # Configuration secrets (excluded from git)
├── .env.template               # Template of required env vars
├── requirements.txt            # Python dependencies list
└── pyproject.toml              # Build & formatter configurations (black, ruff, pytest)
```

### Key Modules and Responsibilities

- **`app/main.py`**: Boots up the application, configures CORS middleware, registers routers, and sets up global exception handlers (e.g. mapping database violations to HTTP responses).
- **`app/core/config.py`**: Validates configuration parameters at launch. Uses `pydantic-settings` to declare variables like `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET`.
- **`app/core/security.py`**: Performs local, signature-validated decoding of the incoming token using standard HS256 logic.
- **`app/db/supabase.py`**: Exports client instantiations. Because client connections in Python may have request-specific contexts, factory functions should be used to instantiate client scopes dynamically.
- **`app/dependencies/auth.py`**: Holds FastAPI security dependencies, extracting the JWT bearer token, decoding it, and returning the user context.

---

## 3. JWT Authentication & Security Strategy

Supabase Auth uses GoTrue to manage user sessions and issues standard HS256 JSON Web Tokens (JWT). 

### Local JWT Decoding vs. API Validation

| Metric | Local JWT Verification (HS256) | Remote API Validation (`get_user`) |
| --- | --- | --- |
| **Network Request** | **None** (Pure CPU operation) | **Yes** (FastAPI makes HTTP call to Supabase API) |
| **Response Latency** | **< 1ms** | **20ms - 150ms** (dependent on network / cloud region) |
| **Supabase API Limits** | **No impact** (Runs locally on FastAPI) | **High impact** (Counts against project rate limits) |
| **Accuracy** | **High** (Validates signature, expiry, audience, and issuer) | **Very High** (Retrieves current real-time session state) |

**Recommendation**: FastAPI must perform **Local JWT Decoding** for authentication dependencies. This optimizes responsiveness and minimizes network overhead.

### Token Verification Logic
1. Extract token from `Authorization: Bearer <token>` header.
2. Decode JWT locally using `PyJWT` or `python-jose`:
   - Algorithm: `HS256`
   - Key: `SUPABASE_JWT_SECRET` (retrieved from the Supabase Dashboard)
   - Audience (`aud` claim): Must equal `"authenticated"`
3. If valid, check expiration (`exp` claim) against the current server time.
4. Extract user claims:
   - `sub`: The database-level User ID (UUID) of the subject.
   - `email`: User's primary email.
   - `role`: Auth role (typically `"authenticated"`, or `"cms_editor"` for administration).

### Dependency Injection Pipeline (`get_current_user`)
A FastAPI dependency retrieves and parses credentials:
- **`Security(HTTPBearer())`**: Extracted via FastAPI's security utility.
- **Token Validation**: Returns a lightweight domain user object (`UserInClaims`) containing:
  - `id`: `UUID` (from the `sub` claim)
  - `email`: `str`
  - `role`: `str`
- If signature validation fails or if the token has expired, FastAPI throws `HTTPException(status_code=401, detail="Could not validate credentials")`.

---

## 4. Supabase Integration & Database Alignment

FastAPI will interface with Supabase using two client roles depending on the endpoint type and authentication requirement.

### 4.1 Scoped Supabase Clients

#### Client A: Service Role Admin Client (`service_role`)
- **Credentials**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **Scope**: Server-level administrative operations. This key **bypasses all Row-Level Security (RLS) policies**.
- **Usage**:
  - `/auth/signup`: Required to create users if the signup is handled via the admin namespace, or if calling GoTrue authentication directly from the server.
  - `/auth/login`: Authenticating email/password using password-based grant flow.
  - `/user_profiles/{id}` (DELETE): Bypassing RLS to delete a user from `auth.users` (which triggers the cascade delete).

#### Client B: Request-Scoped User Client (RLS Delegation)
- **Credentials**: `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- **Scope**: Scoped per-request to the active user's JWT.
- **Usage**:
  - `GET /user_profiles`, `GET /user_profiles/{id}`, `PUT /user_profiles/{id}`.
- **Enforcement**:
  FastAPI instantiates the client and attaches the caller's JWT:
  ```python
  # Logical implementation pattern:
  client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
  client.postgrest.auth(user_jwt) # Attaches the user's JWT to all REST headers
  ```
  When the query is made to PostgREST, PostgreSQL receives the user's UUID in the session context (`auth.uid() = id`). PostgreSQL RLS evaluates the query natively, ensuring the user can only read or update their own profile record.

---

### 4.2 Integration with Postgres Database Triggers

Our database relies on an automated trigger function:
- **Trigger**: `on_auth_user_created`
- **Event**: `AFTER INSERT ON auth.users`
- **Function**: `public.handle_new_user()`

This trigger extracts the following fields from `auth.users.raw_user_meta_data`:
- `username` (defaults to email prefix if missing)
- `full_name` (or `name` metadata)
- `avatar_url` (or `picture` metadata)
- `onboarding_survey` (defaults to empty JSON object `{}` if missing)
- `sauce_log` (defaults to empty JSON object `{}` if missing)

To align with this trigger, `/auth/signup` must **NOT** write directly to the `public.user_profiles` table. Doing so would cause insertion conflicts (duplicate keys) because the trigger executes automatically. 
Instead, the FastAPI endpoint must pass the onboarding survey and metadata to the Supabase signup payload under the `options.data` property. This maps directly to `raw_user_meta_data` inside the database, allowing the Postgres trigger to execute atomically and safely.

```python
# Conceptual signup payload mapping:
signup_options = {
    "data": {
        "username": signup_request.username,
        "full_name": signup_request.full_name,
        "avatar_url": signup_request.avatar_url,
        "onboarding_survey": signup_request.onboarding_survey,
        "sauce_log": signup_request.sauce_log
    }
}
supabase.auth.sign_up({"email": email, "password": password, "options": signup_options})
```

---

### 4.3 Profile Deletion Cascade Strategy

The database configuration dictates:
```sql
ALTER TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
```
- **Rule**: Deleting a profile directly from `public.user_profiles` is blocked by RLS policies or does not delete the corresponding user account in the identity system (`auth.users`), creating orphan auth records.
- **Strategy**: To delete a profile, FastAPI must invoke the **Admin Auth API** to delete the user from `auth.users`.
- **Implementation**:
  1. The user requests `DELETE /user_profiles/{id}`.
  2. FastAPI validates that `{id}` matches the decoded token `sub` (user's ID), or that the user has admin credentials.
  3. FastAPI uses the **Service Role Client** to call:
     ```python
     supabase.auth.admin.delete_user(id)
     ```
  4. Supabase removes the user from `auth.users`.
  5. The PostgreSQL foreign key automatically cascades, deleting the row in `public.user_profiles`.

---

## 5. Endpoint Specifications & Mapping

Below is the design spec for the endpoints, defining security layers, payload schemas, and backend mapping logic.

### 5.1 Auth Endpoints

#### `/auth/signup`
- **Method**: `POST`
- **Authentication**: None (Public)
- **Request Body (Pydantic)**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123",
    "username": "sauceboss",
    "full_name": "Sauce Boss",
    "avatar_url": "https://example.com/avatar.jpg",
    "onboarding_survey": {
      "dietary_preferences": ["vegan"],
      "experience_level": "intermediate"
    },
    "sauce_log": {
      "saved_recipes": []
    }
  }
  ```
- **Flow**:
  1. FastAPI parses the body.
  2. FastAPI packages `username`, `full_name`, `avatar_url`, `onboarding_survey`, and `sauce_log` into the user metadata.
  3. FastAPI uses the Supabase client to call `signUp()`.
  4. The PostgreSQL trigger `handle_new_user()` fires, creating the `public.user_profiles` row.
  5. FastAPI returns the newly created user object.
- **Response**: `201 Created` with the User ID and Email.

#### `/auth/login`
- **Method**: `POST`
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
- **Flow**:
  1. FastAPI passes credentials to Supabase: `signInWithPassword()`.
  2. Supabase verifies password hash and returns access/refresh tokens.
  3. FastAPI wraps and returns the token response.
- **Response**: `200 OK`
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "refresh-token-uuid",
    "token_type": "bearer",
    "expires_in": 3600
  }
  ```

#### `/auth/user`
- **Method**: `GET`
- **Authentication**: Required (`Bearer <JWT>`)
- **Flow**:
  1. FastAPI extracts and verifies the user's JWT locally.
  2. FastAPI extracts `user_id` from the JWT claims.
  3. FastAPI queries `public.user_profiles` where `id = user_id`.
  4. Returns the profile record containing database metadata, onboarding survey, and sauce log.
- **Response**: `200 OK` (JSON matching `UserProfile` schema).

---

### 5.2 User Profile Endpoints

#### `/user_profiles`
- **Method**: `GET`
- **Authentication**: Required (`Bearer <JWT>`)
- **Parameters**:
  - `limit` (Query, default: 10)
  - `offset` (Query, default: 0)
- **Flow**:
  1. Validate JWT.
  2. Create a request-scoped Supabase client authenticated with the user's JWT.
  3. Execute `SELECT * FROM public.user_profiles LIMIT limit OFFSET offset`.
  4. **Security outcome**: Due to database RLS, standard authenticated users will receive an array containing *only* their own profile record. CMS editors or administrators receive a populated array depending on custom policy roles.
- **Response**: `200 OK` (Array of profiles).

#### `/user_profiles`
- **Method**: `POST`
- **Authentication**: Required (`Bearer <JWT>`)
- **Request Body**: `UserProfile` schema.
- **Flow**:
  1. Validate JWT.
  2. **Check**: Verify if a profile already exists for the user ID. Since profiles are automatically created on signup via trigger, manual POST requests to this route are typically treated as update fallbacks.
  3. Forward query with user's JWT context. If user attempts to create a profile where `id != auth.uid()`, the database RLS throws a check violation.
- **Response**: `201 Created` or `409 Conflict`.

#### `/user_profiles/{id}`
- **Method**: `GET`
- **Authentication**: Required (`Bearer <JWT>`)
- **Parameters**: `id` (Path, UUID)
- **Flow**:
  1. Validate JWT.
  2. Forward query `SELECT * FROM public.user_profiles WHERE id = {id}` using the user-scoped client.
  3. If the profile matches the user's ID, it returns the profile. If it belongs to another user, RLS filters the record out, and FastAPI returns `404 Not Found` (preventing metadata leakage).
- **Response**: `200 OK` or `404 Not Found`.

#### `/user_profiles/{id}`
- **Method**: `PUT` (or `PATCH`)
- **Authentication**: Required (`Bearer <JWT>`)
- **Parameters**: `id` (Path, UUID)
- **Request Body**: `UserProfile` schema update model.
- **Flow**:
  1. Validate JWT. Verify that the path `id` matches the token `sub` claim (or the user role is authorized to edit other profiles, e.g., service role / admin).
  2. Forward the update query `UPDATE public.user_profiles SET ... WHERE id = {id}` using the user-scoped client.
  3. The database updates `updated_at` via triggers and alters survey/log data.
- **Response**: `200 OK` or `403 Forbidden` / `404 Not Found`.

#### `/user_profiles/{id}`
- **Method**: `DELETE`
- **Authentication**: Required (`Bearer <JWT>`)
- **Parameters**: `id` (Path, UUID)
- **Flow**:
  1. Validate JWT. Confirm that the target `{id}` matches the token `sub` (or is admin).
  2. Instantiate the **Service Role Client**.
  3. Call the GoTrue Admin API: `delete_user(id)`.
  4. The identity record is removed, and the `public.user_profiles` record is deleted automatically by the cascade database configuration.
- **Response**: `204 No Content`.
