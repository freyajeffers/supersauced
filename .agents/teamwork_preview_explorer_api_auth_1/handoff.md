# Handoff Report — FastAPI Auth & User Profile Design

## 1. Observation
During our read-only investigation, the following files and code patterns were observed:
- **`backend_guide/database/migrations/00002_core_schema.sql`** (line 3):
  ```sql
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
  ```
  This establishes a direct foreign key relationship between the user profiles and Supabase's authentication users.
- **`backend_guide/database/migrations/00004_rls_policies.sql`** (lines 8-15):
  ```sql
  CREATE POLICY "Allow select own profile" ON public.user_profiles
      FOR SELECT USING (auth.uid() = id);

  CREATE POLICY "Allow insert own profile" ON public.user_profiles
      FOR INSERT WITH CHECK (auth.uid() = id);

  CREATE POLICY "Allow update own profile" ON public.user_profiles
      FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  ```
  This restricts row-level access (read, write, update) in the database specifically to the owner (`auth.uid() = id`).
- **`backend_guide/database/migrations/00005_triggers.sql`** / **`docs/auth_integration.md`** (lines 697-774):
  Defines `public.handle_new_user()`, a database trigger function bound to `AFTER INSERT ON auth.users`. It extracts `username`, `full_name`, `avatar_url`, `onboarding_survey`, and `sauce_log` from the user's `raw_user_meta_data` field and inserts them into `public.user_profiles`.
- **`docs/api_spec.yaml`** (lines 8-103):
  Specifies the endpoints for `/user_profiles` (GET, POST) and `/user_profiles/{id}` (GET, PUT, DELETE), with request/response schemas.

---

## 2. Logic Chain
We constructed our recommendations based on the following logic chain:
1. **Trigger Conflict Prevention**:
   - *Observation*: The Postgres trigger `handle_new_user()` executes on insert to `auth.users` and automatically writes to `public.user_profiles` using data from `raw_user_meta_data`.
   - *Reasoning*: If `/auth/signup` in FastAPI writes directly to `public.user_profiles` while signing up a user, a key conflict will arise (two insertions for the same UUID).
   - *Conclusion*: FastAPI must forward the onboarding preferences (`onboarding_survey`, `sauce_log`, etc.) as user metadata (`options.data`) when calling Supabase's sign-up auth function, letting the database trigger handle the creation.
2. **Access Control Delegation (RLS)**:
   - *Observation*: Row-Level Security policies on `user_profiles` restrict access to the record where `auth.uid() = id`.
   - *Reasoning*: Writing authorization checks in Python FastAPI for all profile routes duplicates access control logic and introduces security maintenance risks.
   - *Conclusion*: FastAPI should execute data queries against Supabase by passing the user's JWT token (User-scoped Client), allowing PostgreSQL RLS to handle access control natively.
3. **Local JWT Decoding**:
   - *Observation*: Supabase-issued tokens are standard HS256 JWTs signed with `SUPABASE_JWT_SECRET`.
   - *Reasoning*: Sending a network request to Supabase to validate tokens on every route takes 20ms - 150ms and impacts rate limits. Local decoding takes < 1ms and runs locally.
   - *Conclusion*: FastAPI must decode JWTs locally using the shared secret key to populate the authentication context.
4. **Profile Deletion Strategy**:
   - *Observation*: `user_profiles` has an `ON DELETE CASCADE` foreign key reference to `auth.users(id)`.
   - *Reasoning*: Deleting a profile database row directly does not remove the corresponding credentials in `auth.users`, leaving orphan auth accounts.
   - *Conclusion*: Profile deletion must be executed by calling the Supabase GoTrue Admin API to delete the user record, letting PostgreSQL automatically cascade delete the profile record.

---

## 3. Caveats
- **Local vs Remote Identity Updates**: Local JWT validation checks signature, audience, and expiry, but it does not check if a user has been banned or deleted in real time until the JWT expires (or is checked against database records). If real-time suspension checks are critical, a brief database check on `public.user_profiles` can be added to the FastAPI dependency.
- **Service Role Management**: The Admin client bypasses RLS. Care must be taken to restrict the use of the Service Role client to `/auth/signup`, `/auth/login`, and `/user_profiles/{id}` (DELETE) routes.
- **Implementation Scope**: No Python code has been written to the workspace; this is a pure design strategy.

---

## 4. Conclusion
We recommend implementing a modular FastAPI directory structure with a local JWT authentication mechanism using PyJWT. For user profile management, we recommend forwarding the user's JWT to Supabase to leverage PostgreSQL RLS policies. Deletions must target the GoTrue auth layer to trigger cascading deletes. Signups must write metadata to `raw_user_meta_data` to coordinate with the database triggers.

---

## 5. Verification Method
1. **Inspect Analysis Report**: Verify that the analysis and recommendations file exists at `/home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_1/analysis.md` and contains the details matching the request.
2. **Verify Database Integrity**: Execute the database verification shell script:
   ```bash
   ./backend_guide/database/scripts/verify_schema.sh
   ```
   This ensures the migrations run correctly and the trigger/RLS behavior matches the assertions in the functional and adversarial tests.
