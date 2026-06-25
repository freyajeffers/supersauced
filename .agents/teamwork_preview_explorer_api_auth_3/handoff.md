# Handoff Report: FastAPI Auth & User Profile Requirements Analysis

## 1. Observation

During the read-only investigation, the following files and contents were directly observed:
- **`docs/api_spec.md` (Lines 48–76)**: Defines the user profile endpoint `/user_profiles` mapping directly to the PostgREST API with CRUD routes. It highlights:
  > "user_profiles: Access is restricted. A user can only select, insert, or update their own profile (`auth.uid() = id`)."
  And the profile payload schema containing `onboarding_survey` and `sauce_log` JSONB structures.
- **`docs/api_spec.yaml` (Lines 8–103)**: Specifies OpenAPI paths for `/user_profiles` and `/user_profiles/{id}`, designating that they require `BearerAuth` (JWT) security.
- **`docs/auth_integration.md` (Lines 665–774)**: Outlines the profile creation trigger mechanics, highlighting that onboarding survey parameters are passed from the client in the signup metadata dictionary (`raw_user_meta_data`). It defines:
  - The migration for `public.user_profiles` column extensions (`onboarding_survey` and `sauce_log` columns).
  - The secure database trigger function `public.handle_new_user()` bound to `AFTER INSERT ON auth.users`, which handles metadata extraction, safe defaults (`'{}'::jsonb`), and username collision resolution.
- **`backend_guide/database/README.md` (Lines 84–101)**: Highlights the Row-Level Security (RLS) policies mapping for `user_profiles` where selection, insertion, and updating are restricted to the profile owner:
  > `Restricted to profile owner (auth.uid() = id).`
- **Filesystem Scan**: A search of the `/home/freya/supersauced` directory returned zero Python files (`.py`) or package configurations (`requirements.txt`, `pyproject.toml`), indicating that the FastAPI application is being designed from scratch.

---

## 2. Logic Chain

1. **Local Authentication Verification**:
   - Since Supabase Auth uses JWTs signed with `HS256` using a shared project-specific secret, and remote API calls to `auth.get_user` add 50–150ms of network latency per request, it is logically inferred that local JWT verification within a FastAPI dependency (`get_current_user`) is necessary to optimize performance.
2. **RLS and Client Scoping**:
   - Because the database schema enforces strict RLS policies on `user_profiles` (based on `auth.uid()`), instantiating a delegated user-scoped Supabase client per request (authenticating with the client's Bearer JWT using `.postgrest.auth(token)`) guarantees that security logic remains centralized in PostgreSQL and prevents FastAPI from accidentally violating row-level boundaries.
3. **Signup Onboarding Delegation**:
   - Because the `handle_new_user()` trigger handles metadata extraction and validation on the database level (`raw_user_meta_data`), the FastAPI `/auth/signup` endpoint should simply forward username and survey answers in the GoTrue signup options (`options.data`) payload instead of manually inserting a record into `user_profiles` itself. This prevents duplicate logic and guarantees database consistency.

---

## 3. Caveats

- **No Existing Code**: As there is no existing Python FastAPI codebase, we assume a greenfield project structure. The design is layout-compliant with standard FastAPI patterns.
- **JWT Secret Availability**: The strategy assumes that the FastAPI application has access to the Supabase `JWT_SECRET` in its environment to perform cryptographic local signature verification. If the secret is not available, remote token validation must be fallback-implemented.
- **No Implementation Mode**: The recommendations focus purely on architecture and flow design; no actual code files have been created or modified in the codebase.

---

## 4. Conclusion

We recommend a clean FastAPI directory structure separating routes, schemas, and services. JWT authentication should be handled using local HMAC-SHA256 decoding within a security dependency. The Supabase integration should primarily utilize user-scoped delegated clients to preserve database-level RLS boundaries. Onboarding signup data should be mapped directly to GoTrue options, leveraging the pre-configured `handle_new_user()` database trigger.

These design recommendations have been detailed and saved to `/home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_3/analysis.md`.

---

## 5. Verification Method

To verify the deliverables:
1. Inspect `/home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_3/analysis.md` using `view_file` to confirm that all three requested strategies (directory structure, JWT authentication, and Supabase integration) are fully detailed and match the requirements.
2. Confirm that no implementation code has been added to `/home/freya/supersauced` (only markdown documents are written in the agent folder).
3. Validate that the recommendations align with the database triggers and schema observed in `docs/auth_integration.md` and `backend_guide/database/README.md`.
