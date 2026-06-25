# SuperSauced Backend API & Edge Functions

This folder contains the Python FastAPI backend application, edge function webhook controllers, and integration test suites for **SuperSauced**.

---

## 1. Directory Structure

```text
backend_guide/
├── requirements.txt      # Python library dependencies
├── README.md             # This document
├── app/                  # Main application source code
│   ├── __init__.py
│   ├── main.py           # FastAPI entrypoint & middleware configuration
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py       # FastAPI dependency injection (Supabase clients, JWT parsing)
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py   # Auth routes integrating with Supabase Auth
│   │       ├── user_profiles.py # Profile CRUD with RLS context & ownership checks
│   │       └── functions.py     # Python serverless Edge Functions emulation
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py     # Environment configurations validation via Pydantic
│   │   └── security.py   # Local HS256 JWT signature verification
│   └── schemas/
│       ├── __init__.py
│       ├── auth.py       # Pydantic auth validation schemas
│       └── user_profile.py # Nested Pydantic schemas for survey & inventory JSONB
└── tests/                # Test suite
    ├── __init__.py
    ├── conftest.py       # Pytest fixtures and mock client configurations
    ├── test_auth.py      # Unit tests for signup, login, and current user
    ├── test_profiles.py  # Unit tests for profile CRUD and ownership checks
    └── test_functions.py # Unit tests for webhook signatures and analytics forwarding
```

---

## 2. API Architecture & Supabase Integration

The backend is built using **FastAPI** to deliver high-performance, asynchronous endpoints while integrating directly with **Supabase** for database operations, OAuth identity registration, and serverless background logic.

### 2.1 Multi-Client Injection Strategy
Our routes utilize two distinct client scopes injected via FastAPI dependencies:
1. **User-Scoped client (`get_user_client`)**:
   Created dynamically per request using the user's incoming bearer JWT. This client inherits the database Row Level Security (RLS) constraints. When queried, PostgreSQL isolates results to the owner (`auth.uid() = id`).
2. **Service-Role client (`get_service_client`)**:
   Instantiated using the private `SUPABASE_SERVICE_ROLE_KEY`. This client bypasses RLS policies entirely. It is used strictly for administrative tasks (e.g., creating profiles on callback, executing Shopify webhook updates, or registering new users).

---

## 3. JWT Signature Verification Logic

To optimize performance and eliminate round-trips to the Supabase Auth server on every API call, token verification is handled locally inside `app/core/security.py`.

* **Algorithm**: `HS256`
* **Verification Secret**: `SUPABASE_JWT_SECRET`
* **Process**:
  1. The client sends a Bearer Token in the `Authorization` header.
  2. The backend extracts and decodes the JWT using PyJWT against `SUPABASE_JWT_SECRET`.
  3. Signature validity and token expiration (`exp` claim) are validated.
  4. The user claims `sub` (User ID), `email`, and custom roles (`role`) are returned.

---

## 4. Edge Functions Implementation

We emulate the Supabase TypeScript Edge Functions using FastAPI Python routes for cohesive integration testing:

### 4.1. Auth Callback (`/functions/auth_callback`)
* **Trigger**: Invoked when a user completes registration or third-party OAuth.
* **Logic**: Receives user metadata, uses a service-role client to insert or upsert the `public.user_profiles` CRM data, and returns the profile details.

### 4.2. Shopify Sync Webhook (`/functions/shopify_sync`)
* **Trigger**: Triggered by a Shopify webhook when an order status is set to paid.
* **Signature Verification**:
  * Calculates the HMAC-SHA256 signature of the raw request payload using `SHOPIFY_WEBHOOK_SECRET`.
  * Compares it against the `X-Shopify-Hmac-Sha256` Base64 header.
  * Rejects unsigned or fake payloads with `401 Unauthorized`.
* **Logic**: 
  * Parses purchased variants/SKUs.
  * If the user profile exists, increments the purchased counts inside `user_profiles.sauce_log.inventory` and updates timestamps.
  * If the user checked out as a guest, records the credits to `public.pending_sauce_log_credits`.

### 4.3. Analytics Forwarding (`/functions/analytics_event`)
* **Trigger**: Triggered on user interaction telemetry.
* **Logic**: Takes the payload and forwards the event concurrently to:
  * **PostHog**: Sent to `{POSTHOG_HOST}/capture/` using the api key.
  * **Firebase**: Sent to the Firebase Google Analytics REST API matching the project ID.

---

## 5. Local Setup & Testing Runbook

### 5.1 Local Installation
1. Ensure Python 3.11+ is installed.
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Define your environment variables in a `.env` file at the root:
   ```env
   SUPABASE_URL=https://your-instance.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_JWT_SECRET=your-jwt-secret-at-least-32-characters
   SHOPIFY_WEBHOOK_SECRET=your-shopify-secret
   ```

### 5.2 Running the Application
To run the server locally:
```bash
uvicorn app.main:app --reload --port 8000
```

### 5.3 Running the Test Suite
The test suite utilizes mock Supabase clients and local JWT signatures to verify correctness without needing external internet access.
Run the tests using pytest:
```bash
python -m pytest -v
```
All tests mock external API calls to Supabase, PostHog, and Firebase, guaranteeing fast, repeatable, and isolated execution.
