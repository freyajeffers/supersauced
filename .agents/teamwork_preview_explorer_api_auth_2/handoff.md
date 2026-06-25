# Handoff Report - FastAPI Auth & Profile Design Strategy

## 1. Observation
- **User Profile Table Setup**: Inside `/home/freya/supersauced/backend_guide/database/migrations/00002_core_schema.sql` (lines 2–12), the table setup is:
  ```sql
  CREATE TABLE IF NOT EXISTS public.user_profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE,
      full_name TEXT,
      avatar_url TEXT,
      onboarding_survey JSONB NOT NULL DEFAULT '{}'::jsonb,
      sauce_log JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **Profile Synchronizing Database Trigger**: In `/home/freya/supersauced/docs/auth_integration.md` (lines 770–773), the database trigger bind is defined as:
  ```sql
  CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  ```
- **Row Level Security Policies**: In `/home/freya/supersauced/backend_guide/database/migrations/00004_rls_policies.sql` (lines 8–16), RLS is bound as:
  ```sql
  CREATE POLICY "Allow select own profile" ON public.user_profiles
      FOR SELECT USING (auth.uid() = id);

  CREATE POLICY "Allow insert own profile" ON public.user_profiles
      FOR INSERT WITH CHECK (auth.uid() = id);

  CREATE POLICY "Allow update own profile" ON public.user_profiles
      FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  ```
- **API Spec Requirements**: In `/home/freya/supersauced/docs/api_spec.yaml` (lines 8–103) and `/home/freya/supersauced/docs/api_spec.md` (lines 48–77), the path mapping details query parameters, path variables (`{id}`), payload expectations, and BearerAuth dependencies.

---

## 2. Logic Chain
1. **Trigger Configuration & Signup Logic**:
   - The database trigger automatically creates `public.user_profiles` when a user record is generated in `auth.users` (Observation 2).
   - This trigger extracts variables from `raw_user_meta_data`.
   - **Therefore**, the FastAPI `/auth/signup` endpoint must call the Supabase signup function passing `username`, `full_name`, `avatar_url`, `onboarding_survey`, and `sauce_log` in the `options.data` payload. This guarantees that user profiles are created correctly without custom manual insert logic.
2. **Access Control & RLS Alignment**:
   - Database RLS policies restrict operations to `auth.uid() = id` (Observation 3).
   - **Therefore**, the FastAPI endpoint `/user_profiles/{id}` must verify that the requesting user's `sub` claim matches the requested `{id}` path parameter (unless bypassing for admin functions using `cms_editor` claims).
3. **Decoupled Cryptographic JWT Validation**:
   - Supabase Auth issues JWT tokens signed with a shared project-specific HS256 secret.
   - **Therefore**, FastAPI can locally parse and decode the token's claims (`sub`, `email`, `role`) via `PyJWT` or `python-jose` without making network calls to Supabase GoTrue, optimizing endpoint response times.

---

## 3. Caveats
- No code was added or altered outside the `.agents/` folder as this is a read-only investigation task.
- Assumes the Supabase instance is accessible and the user has access to `SUPABASE_JWT_SECRET` as an environment variable to support local token decoding. If the secret is unavailable, external verification (`supabase.auth.get_user(token)`) must be used as a fallback, which carries latency overhead.

---

## 4. Conclusion
The requirements for the auth and profile APIs are successfully mapped to a design strategy in `analysis.md`. The design features a modular directory structure, local HS256 JWT decoding dependencies, dual-tier Supabase client routing (anon vs. service_role), and strict payload validation using Pydantic schemas.

---

## 5. Verification Method
1. Inspect the written strategy document at: `/home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_2/analysis.md`
2. Confirm all required paths (`/auth/signup`, `/auth/login`, `/auth/user`, `/user_profiles`, `/user_profiles/{id}`) are covered with appropriate security parameters and database integration strategies.
3. Verify that no implementation code has been added to target application source folders in compliance with read-only guidelines.
