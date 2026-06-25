## 2026-06-24T04:02:58Z

You are teamwork_preview_worker_m2_1.
Your working directory is /home/freya/supersauced/.agents/worker_m2_1.
Your mission: Write the API Specification document in `/home/freya/supersauced/docs/api_spec.md`.

You must base your API specification on the clean database schema defined in `docs/schema.sql`. You can also reference the recommendations and examples in `/home/freya/supersauced/.agents/explorer_m2_2_retry/proposed_api_spec.md`.

Document exact JS/TS Supabase SDK code examples and matching curl/PostgREST queries for:
1. Recipes: read-only list, pagination, and multi-tag filtering on `cube_tags` and `dietary_tags` using array operators (overlaps `ov`, contains `cs`, contained-by `cd`).
2. Recipe Ingredients: loading by recipe ID, sorting by `position` ascending, and handling the `NUMERIC(10,1)` type (precision scaling on client).
3. Recipe Steps: loading by recipe ID, sorting by `step_number` ascending, and step sequence swapping utilizing the deferred unique constraint.
4. User Profiles: read own profile (using `Accept: application/vnd.pgrst.object+json` / `.single()`), update preferences (onboarding_survey JSONB), and update `sauce_log` inventory. Explain JSONB update replacement behavior and recommend client-side merging.

Make sure to explicitly define:
- HTTP headers (apikey, Authorization, Content-Type, Prefer, Accept).
- Authentication requirements (Bearer tokens, anon keys).
- Request parameters and response JSON formats.
- RLS constraints for each endpoint (including public read, owner-only read/write, and cms_editor draft preview access).

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

Write the final `docs/api_spec.md` file. Document your changes in your handoff report at `/home/freya/supersauced/.agents/worker_m2_1/handoff.md` and send a message to your parent when done.

## 2026-06-24T17:26:50Z

Implement the Python FastAPI application under backend_guide/app/ and backend_guide/tests/ to fulfill Milestone 2 (Auth and Profiles endpoints) and the Edge Functions requirement:
1. Create app/main.py setting up the FastAPI application with CORS and routing.
2. Create app/core/config.py to load and validate environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET).
3. Create app/core/security.py for local HS256 JWT signature verification and claims extraction (sub, email, role).
4. Create app/api/deps.py providing dependency injection for user-scoped Supabase client, service-role client, and CurrentUser.
5. Create app/api/v1/auth.py for endpoints (/auth/signup, /auth/login, /auth/user) integrating with Supabase Auth (forwarding metadata to options.data for trigger alignment).
6. Create app/api/v1/user_profiles.py for profile CRUD (GET /user_profiles, GET/PUT/DELETE /user_profiles/{id}) enforcing owner-only edits and delegating queries to RLS-enabled user-scoped clients.
7. Create app/api/v1/functions.py implementing Python edge functions as FastAPI routes:
   - /functions/auth_callback (updates/creates user profile)
   - /functions/shopify_sync (custom order-completed sync updating user_profiles.sauce_log variant/SKU history)
   - /functions/analytics_event (forwards events to PostHog and Firebase)
8. Create app/schemas/auth.py and app/schemas/user_profile.py for Pydantic v2 schemas validating nested structures (onboarding survey and sauce log JSONB).
9. Create requirements.txt containing: fastapi, uvicorn, supabase, PyJWT, pydantic-settings, pytest, httpx, python-dotenv, etc.
10. Create tests/ directory containing unit/integration tests for these endpoints using Pytest, mocking external API requests to Supabase and using local signed JWT tokens.
11. Update backend_guide/README.md (or create it) with comprehensive details on API architecture, auth verification logic, edge functions, deployment steps, testing runbooks, and Supabase integration points.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
