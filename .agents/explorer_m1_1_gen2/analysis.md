# Analysis & Fix Strategy - Database Schema & Verification (Milestone 1)

## 1. Executive Summary
This analysis addresses the critical database schema and security issues identified in previous reviews, specifically focusing on the separation of development mock setups, handling JSON null values in user profile triggers, and creating a reliable, containerized verification suite. Our proposed strategy guarantees production-safe deployments while providing a robust, repeatable test environment for local development.

---

## 2. Issue Analysis & Resolution Strategy

### Issue 1: Destructive System Overwrite (Separation of Mock Setup)
- **Problem**: Current implementation of `/home/freya/supersauced/docs/schema.sql` includes declarations for the `auth` schema, `auth.users` table, and a stub for `auth.uid()`. Executing this file in a production Supabase instance would overwrite native schemas and system-managed functions, bricking the authentication and row-level security mechanisms.
- **Resolution**:
  - Extract the mock setup blocks entirely from `docs/schema.sql`.
  - Create a new file `docs/local_mock_setup.sql` to house the mock schemas and functions.
  - Implement a highly realistic mock for `auth.uid()` and `auth.jwt()` in the local setup utilizing PostgreSQL session settings (`request.jwt.claims`), mimicking native Supabase behaviors.

### Issue 2: Unhandled JSON Nulls in Signup Trigger
- **Problem**: The trigger function `public.handle_new_user()` uses `COALESCE` to default values when they are missing. However, if `raw_user_meta_data` contains a key with a literal JSON `null` (e.g. `'{"onboarding_survey": null}'::jsonb`), PostgreSQL evaluates this as a non-SQL-NULL JSONB value. The `COALESCE` is bypassed, inserting `'null'::jsonb` into a `NOT NULL` column. This triggers runtime client parser crashes when reading profiles.
- **Resolution**:
  - Update `public.handle_new_user()` to explicitly check if the extracted JSON values are SQL `NULL` or JSON `'null'::jsonb`, defaulting them to `'{}'::jsonb` in either case.
  - Provide a clean SQL conditional expression (`CASE`) for the fields in the insertion trigger.

### Issue 3: Missing Verification Scripts
- **Problem**: The previous iteration claimed verification files (`verify_schema.sh` and `validate.sql`) were executed, but they did not exist in the workspace.
- **Resolution**:
  - Define a concrete, automated verification script `docs/verify_schema.sh` which runs a lightweight PostgreSQL docker container (`postgres:16-alpine`), loads the schema and mock files, and executes a test suite.
  - Define a detailed test script `docs/validate.sql` containing assertions (using PL/pgSQL `DO` blocks) to verify relational integrity, cascading deletes, JSON null trigger behaviors, and RLS policies under impersonated user roles.

### Additional Improvement 1: Deferrable Step Number Unique Constraint (Reviewer 2 Finding 2)
- **Problem**: `public.recipe_steps` contains a unique constraint on `(recipe_id, step_number)`. During step re-ordering transactions (e.g. swapping steps 1 and 2), temporary duplicate step numbers cause a unique constraint violation.
- **Resolution**: Update the unique constraint on `recipe_steps` to be `DEFERRABLE INITIALLY DEFERRED`. This allows updates to temporarily duplicate step numbers within a transaction, as long as uniqueness is satisfied before committing.

### Additional Improvement 2: Draft/Preview Client Read Limitation (Reviewer 1 Finding 4)
- **Problem**: The current SELECT policies on recipes, ingredients, and steps block reading unpublished (draft) recipes. This prevents CMS editors/content creators from previewing drafts in staging/preview environments.
- **Resolution**: Introduce dedicated SELECT policies allowing users with the JWT role `cms_editor` to query unpublished recipes and their children.

---

## 3. Redesign / Fix Specifications

### A. Proposed `docs/local_mock_setup.sql`
This file prepares the local database instance for schema compilation by stubbing the standard Supabase `auth` schema and functions.

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create mock auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Create mock auth.users table
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.uid() function mimicking Supabase's JWT claim extraction
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', null)::uuid;
$$;

-- Mock auth.jwt() function mimicking Supabase's JWT extraction
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
```

---

### B. Proposed Changes to `docs/schema.sql`

#### 1. Removal of Mock Section
Remove lines 4 to 25 entirely. Keep `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` at the top of the file.

#### 2. Update to `recipe_steps` Unique Constraint
Replace line 95:
```sql
  UNIQUE (recipe_id, step_number)
```
With:
```sql
  CONSTRAINT recipe_steps_recipe_id_step_number_key UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
```

#### 3. Update to RLS SELECT Policies (Enabling CMS Editor Draft Preview)
Append the following policies in Section 6:
```sql
-- Allow editors to view all recipes (published or draft)
CREATE POLICY "editor_read_all_recipes" ON public.recipes
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'cms_editor'
  );

-- Allow editors to view ingredients of any recipe
CREATE POLICY "editor_read_all_recipe_ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
    ) AND (auth.jwt() ->> 'role') = 'cms_editor'
  );

-- Allow editors to view steps of any recipe
CREATE POLICY "editor_read_all_recipe_steps" ON public.recipe_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
    ) AND (auth.jwt() ->> 'role') = 'cms_editor'
  );
```

#### 4. Update to `public.handle_new_user()` Trigger Function
Replace lines 183 to 202:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    onboarding_survey,
    sauce_log
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
    COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;
```
With:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    onboarding_survey,
    sauce_log
  )
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.raw_user_meta_data->'onboarding_survey' IS NULL 
           OR NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb THEN '{}'::jsonb
      ELSE NEW.raw_user_meta_data->'onboarding_survey'
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->'sauce_log' IS NULL 
           OR NEW.raw_user_meta_data->'sauce_log' = 'null'::jsonb THEN '{}'::jsonb
      ELSE NEW.raw_user_meta_data->'sauce_log'
    END
  );
  RETURN NEW;
END;
$$;
```

---

### C. Proposed `docs/verify_schema.sh`
This script uses the local `postgres:16-alpine` Docker image to compile the schema and run tests, completely clean, with no host package requirements.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
CONTAINER_NAME="supersauced_postgres_test"
POSTGRES_DB="postgres"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="test_password"
POSTGRES_IMAGE="postgres:16-alpine"

echo "=== 1. Starting temporary Postgres container ==="
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -d "$POSTGRES_IMAGE"

# Clean up container on script exit
cleanup() {
  echo "=== Cleanup: Stopping and removing Postgres container ==="
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== 2. Waiting for database to be ready ==="
until docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 0.5
done
echo "Postgres is ready."

echo "=== 3. Executing local mock setup ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < docs/local_mock_setup.sql

echo "=== 4. Executing schema migration ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < docs/schema.sql

echo "=== 5. Executing validation tests ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < docs/validate.sql

echo "=== SUCCESS: All schema verifications passed! ==="
```

---

### D. Proposed `docs/validate.sql`
This script contains programmatic SQL assertions to verify all requirements and fix validity.

```sql
-- Ensure script aborts on first error
\set ON_ERROR_STOP on

-- Clean up any default setups
TRUNCATE auth.users CASCADE;
TRUNCATE public.recipes CASCADE;

-- =========================================================================
-- TEST 1: User Signup Trigger with Null & JSON Null Handling
-- =========================================================================
-- A. Normal user sign-up
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'user_ok@example.com',
  '{"onboarding_survey": {"diet": "keto"}, "sauce_log": {"habanero": 5}}'::jsonb
);

-- B. User with SQL NULL metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'user_sql_null@example.com',
  NULL
);

-- C. User with JSON null literal metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'user_json_null@example.com',
  '{"onboarding_survey": null, "sauce_log": null}'::jsonb
);

-- D. Verification assertions
DO $$
DECLARE
  r1 RECORD;
  r2 RECORD;
  r3 RECORD;
BEGIN
  -- Verify Normal user
  SELECT onboarding_survey, sauce_log INTO r1 FROM public.user_profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  IF (r1.onboarding_survey->>'diet' != 'keto') THEN
    RAISE EXCEPTION 'Test 1A failed: onboarding_survey not populated';
  END IF;

  -- Verify SQL NULL default
  SELECT onboarding_survey, sauce_log INTO r2 FROM public.user_profiles WHERE id = '22222222-2222-2222-2222-222222222222';
  IF r2.onboarding_survey IS NULL OR r2.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1B failed: onboarding_survey not defaulted to {} on SQL NULL';
  END IF;

  -- Verify JSON null default (Fix Verification)
  SELECT onboarding_survey, sauce_log INTO r3 FROM public.user_profiles WHERE id = '33333333-3333-3333-3333-333333333333';
  IF r3.onboarding_survey = 'null'::jsonb THEN
    RAISE EXCEPTION 'Test 1C failed: onboarding_survey contains JSON null literal!';
  END IF;
  IF r3.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1C failed: onboarding_survey not defaulted to {} on JSON null';
  END IF;
  IF r3.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1C failed: sauce_log not defaulted to {} on JSON null';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 2: Cascading Deletes
-- =========================================================================
DO $$
DECLARE
  v_profile_exists BOOLEAN;
BEGIN
  -- Delete user from auth
  DELETE FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111';
  
  -- Check user_profiles
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = '11111111-1111-1111-1111-111111111111') INTO v_profile_exists;
  IF v_profile_exists THEN
    RAISE EXCEPTION 'Test 2 failed: user_profiles row not deleted on auth.users delete';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 3: Deferrable Constraint on Recipe Steps
-- =========================================================================
-- Insert Recipe and steps
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('77777777-7777-7777-7777-777777777777', 'Test Recipe', 'test-recipe', 1, true);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES 
  ('77777777-7777-7777-7777-777777777777', 1, 'First step'),
  ('77777777-7777-7777-7777-777777777777', 2, 'Second step');

-- Perform step swap in transaction using deferred constraint check
BEGIN;
SET CONSTRAINTS ALL DEFERRED;

UPDATE public.recipe_steps SET step_number = 3 WHERE step_number = 1 AND recipe_id = '77777777-7777-7777-7777-777777777777';
UPDATE public.recipe_steps SET step_number = 1 WHERE step_number = 2 AND recipe_id = '77777777-7777-7777-7777-777777777777';
UPDATE public.recipe_steps SET step_number = 2 WHERE step_number = 3 AND recipe_id = '77777777-7777-7777-7777-777777777777';

COMMIT;

-- =========================================================================
-- TEST 4: Row Level Security (RLS) Verification
-- =========================================================================
-- Setup Draft Recipe
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('88888888-8888-8888-8888-888888888888', 'Draft Recipe', 'draft-recipe', 1, false);

-- Set up roles for testing
DROP ROLE IF EXISTS web_anon;
CREATE ROLE web_anon;
GRANT SELECT ON public.recipes TO web_anon;
GRANT SELECT ON public.user_profiles TO web_anon;

-- Switch to RLS Role
SET ROLE web_anon;

-- A. Anonymous user should see published recipe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE id = '77777777-7777-7777-7777-777777777777') THEN
    RAISE EXCEPTION 'RLS Test A failed: published recipe not visible to public';
  END IF;
END;
$$;

-- B. Anonymous user should NOT see draft recipe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recipes WHERE id = '88888888-8888-8888-8888-888888888888') THEN
    RAISE EXCEPTION 'RLS Test B failed: draft recipe is visible to public!';
  END IF;
END;
$$;

-- C. Anonymous user should NOT see user profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles) THEN
    RAISE EXCEPTION 'RLS Test C failed: user profile visible to public!';
  END IF;
END;
$$;

-- Reset and test Owner RLS
RESET ROLE;
SET request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET ROLE web_anon;

-- D. Owner user should see their own profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'RLS Test D failed: owner cannot see own profile';
  END IF;
END;
$$;

-- E. Owner user should NOT see other profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '33333333-3333-3333-3333-333333333333') THEN
    RAISE EXCEPTION 'RLS Test E failed: owner can see another profile!';
  END IF;
END;
$$;

-- Reset and test CMS Editor RLS (Preview Verification)
RESET ROLE;
SET request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "cms_editor"}';
SET ROLE web_anon;

-- F. CMS Editor should see the Draft Recipe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE id = '88888888-8888-8888-8888-888888888888') THEN
    RAISE EXCEPTION 'RLS Test F failed: CMS Editor cannot see draft recipe';
  END IF;
END;
$$;

-- Cleanup Test environment
RESET ROLE;
DROP ROLE IF EXISTS web_anon;
```
