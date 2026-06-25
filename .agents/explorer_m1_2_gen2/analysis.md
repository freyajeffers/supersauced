# Database Schema & Verification Redesign Strategy

This document details the analysis and redesign strategy for the Super Sauced database schema (Milestone 1) based on the feedback from the previous iteration. It proposes a safe, robust database setup suitable for local development and production, handles edge cases in user triggers, and establishes a genuine, reproducible verification process.

---

## 1. Executive Summary

A review of the previous database schema implementation revealed three critical issues:
1. **Destructive System Overwrite**: The mock setup for the `auth` schema and `auth.uid()` was embedded directly within `docs/schema.sql`, which would overwrite Supabase's native auth functions in production, disabling RLS.
2. **Unhandled JSON Nulls**: The `public.handle_new_user()` trigger function did not distinguish between SQL `NULL` and JSON `null` (`'null'::jsonb`), leading to potential insertion of JSON `null` values into `user_profiles.onboarding_survey` and `user_profiles.sauce_log`, causing client-side application crashes.
3. **Fabricated Verification**: The previous handoff claimed that verification scripts (`verify_schema.sh` and `validate.sql`) were executed successfully, but these files did not exist in the workspace.

This analysis provides a comprehensive, actionable fix strategy that:
- Splits mock setup into a developer-only script (`docs/local_mock_setup.sql`).
- Adds robustness to the `public.handle_new_user()` trigger using conditional `CASE` statements to handle JSON nulls.
- Introduces an RLS policy to support CMS draft recipe previews for administrators.
- Defines a robust, automated verification structure with concrete implementations of `tests/verify_schema.sh` and `tests/test_schema.sql` using Docker and transactional SQL assertions.

---

## 2. Root Cause Analysis & Redesign Strategy

### 2.1 Separation of Mock Setup
- **Issue**: In Supabase, the `auth` schema and helper functions like `auth.uid()` are managed by the Supabase infrastructure. Redefining them in the main migration script (`docs/schema.sql`) destroys the system-level functions when executed on a real Supabase database.
- **Redesign**: 
  - Remove all references to `CREATE SCHEMA IF NOT EXISTS auth`, `CREATE TABLE auth.users`, and `CREATE OR REPLACE FUNCTION auth.uid()` from `docs/schema.sql`.
  - Create a new file `docs/local_mock_setup.sql` containing these definitions. This file will only be run in local verification environments (e.g., Docker, local Postgres) prior to applying `docs/schema.sql`.
  - To enable RLS testing in the local environment, the mock `auth.uid()` will check for a custom local session configuration `auth.mock_user_id` before falling back to `request.jwt.claim.sub`.
  - The mock setup will also create the standard Supabase roles (`anon`, `authenticated`, `service_role`) and grant basic schemas/table permissions to emulate the Supabase environment locally.

### 2.2 Handling JSON Nulls in Trigger
- **Issue**: PostgreSQL JSONB operators treat database (SQL) `NULL` differently from JSON `null` (`'null'::jsonb`). When extracting a nested field using the `->` operator on a JSONB value, if the key has an explicit JSON null value, the result is the JSONB value `'null'::jsonb`. The `COALESCE` function treats `'null'::jsonb` as a valid non-null object, bypassing the default fallback and inserting `'null'::jsonb` into columns that expect objects.
- **Redesign**:
  - Update the trigger function `public.handle_new_user()` to use a conditional `CASE` expression.
  - The condition will explicitly check if the metadata field is SQL `NULL` OR equivalent to `'null'::jsonb`. If either condition is met, it will default to an empty JSONB object `'{}'::jsonb`.

### 2.3 RLS Policy for Draft/Preview Access
- **Issue**: Standard users must only see published recipes (`is_published = true`). However, content editors/creators need to see draft recipes in preview/staging environments using client-side tokens.
- **Redesign**:
  - Add secondary SELECT policies to `recipes`, `recipe_ingredients`, and `recipe_steps` allowing access if the user's JWT role matches `'cms_editor'` or `'service_role'`.
  - Since PostgreSQL combines multiple SELECT policies on a table using `OR`, this cleanly grants access to draft recipes for editors without modifying public read behavior.

---

## 3. Proposed Schema Modifications

### 3.1 New File: `docs/local_mock_setup.sql`
This file mocks the Supabase environment locally. It must be run BEFORE `docs/schema.sql` in test/dev environments, but NEVER in production.

```sql
-- =========================================================================
-- MOCK SETUP FOR AUTH SCHEMA & ROLES (LOCAL DEV & TEST ONLY)
-- =========================================================================

-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth.users mock table
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock Supabase roles if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END;
$$;

-- Grant schemas/table permissions to emulate Supabase environment
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- Mock the auth.uid() function with local test hook support
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID,
    NULLIF(current_setting('auth.mock_user_id', true), '')::UUID
  );
$$;

-- Mock the auth.jwt() function to inspect roles
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB,
    jsonb_build_object('role', current_setting('auth.mock_role', true))
  );
$$;
```

### 3.2 Modified File: `docs/schema.sql` (Trigger & RLS Policies Update)
- **Removal**: Delete lines 4 through 24 (the mock schema/table/function setup).
- **Modification of `public.handle_new_user()`**:
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
        WHEN NEW.raw_user_meta_data IS NULL 
             OR NEW.raw_user_meta_data->'onboarding_survey' IS NULL 
             OR NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb THEN '{}'::jsonb
        ELSE NEW.raw_user_meta_data->'onboarding_survey'
      END,
      CASE 
        WHEN NEW.raw_user_meta_data IS NULL 
             OR NEW.raw_user_meta_data->'sauce_log' IS NULL 
             OR NEW.raw_user_meta_data->'sauce_log' = 'null'::jsonb THEN '{}'::jsonb
        ELSE NEW.raw_user_meta_data->'sauce_log'
      END
    );
    RETURN NEW;
  END;
  $$;
  ```
- **New RLS policies for CMS Editor Preview**:
  ```sql
  -- public.recipes additional policy
  CREATE POLICY "editor_read_all_recipes" ON public.recipes
    FOR SELECT TO authenticated, service_role
    USING (auth.jwt() ->> 'role' = 'cms_editor');

  -- public.recipe_ingredients additional policy
  CREATE POLICY "editor_read_all_recipe_ingredients" ON public.recipe_ingredients
    FOR SELECT TO authenticated, service_role
    USING (auth.jwt() ->> 'role' = 'cms_editor');

  -- public.recipe_steps additional policy
  CREATE POLICY "editor_read_all_recipe_steps" ON public.recipe_steps
    FOR SELECT TO authenticated, service_role
    USING (auth.jwt() ->> 'role' = 'cms_editor');
  ```

---

## 4. Verification Strategy & Script Architecture

To comply with layout guidelines, verification files must not reside in the `.agents/` metadata directories. We will place them in a dedicated `tests/` directory at the project root.

- `/home/freya/supersauced/tests/verify_schema.sh`
- `/home/freya/supersauced/tests/test_schema.sql`

### 4.1 Verification Script: `tests/verify_schema.sh`
This script runs a temporary Docker PostgreSQL instance, loads the schemas in sequence, executes the tests, and shuts down the container.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Directory context
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_NAME="supersauced_test"
DB_USER="postgres"
DB_PASSWORD="password"
DB_PORT="54321"
CONTAINER_NAME="supersauced_postgres_test"

echo "=== Starting PostgreSQL 16 test container ==="
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  docker rm -f "${CONTAINER_NAME}"
fi

docker run --name "${CONTAINER_NAME}" \
  -e POSTGRES_DB="${DB_NAME}" \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
  -p "${DB_PORT}:5432" \
  -d postgres:16-alpine

# Function to clean up on exit
cleanup() {
  echo "=== Cleaning up Postgres container ==="
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== Waiting for Postgres to be ready ==="
for i in {1..30}; do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
  echo "Error: Postgres container failed to start."
  exit 1
fi

echo "=== Applying local mock setup ==="
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < "${PROJECT_ROOT}/docs/local_mock_setup.sql"

echo "=== Applying main database schema ==="
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < "${PROJECT_ROOT}/docs/schema.sql"

echo "=== Executing database schema test suite ==="
docker exec -i "${CONTAINER_NAME}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" < "${PROJECT_ROOT}/tests/test_schema.sql"

echo "=== SUCCESS: Database schema verification completed successfully! ==="
```

### 4.2 Test Suite: `tests/test_schema.sql`
This file contains SQL assertions that run inside a transaction block and throw exceptions if a constraint, trigger, or RLS policy is violated.

```sql
BEGIN;

-- 1. Setup mock permissions and roles inside transaction
-- Grant actual select and edit permissions on schema public to test roles
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- =========================================================================
-- TEST 1: User Profile Trigger with NULL metadata
-- =========================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'null_meta@example.com', NULL);

DO $$
DECLARE
  v_survey JSONB;
  v_log JSONB;
BEGIN
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_survey IS NULL OR v_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1 Failed: onboarding_survey is not defaulted to {} for NULL metadata';
  END IF;
  IF v_log IS NULL OR v_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1 Failed: sauce_log is not defaulted to {} for NULL metadata';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 2: User Profile Trigger with JSON null values
-- =========================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000002', 'json_null@example.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);

DO $$
DECLARE
  v_survey JSONB;
  v_log JSONB;
BEGIN
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002';

  IF v_survey IS NULL OR v_survey = 'null'::jsonb OR v_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 2 Failed: onboarding_survey is JSON null or not empty object: %', v_survey;
  END IF;
  IF v_log IS NULL OR v_log = 'null'::jsonb OR v_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 2 Failed: sauce_log is JSON null or not empty object: %', v_log;
  END IF;
END;
$$;

-- =========================================================================
-- TEST 3: User Profile Trigger with Valid Values
-- =========================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000003', 'valid@example.com', '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"cube_sku_1": 2}}'::jsonb);

DO $$
DECLARE
  v_survey JSONB;
  v_log JSONB;
BEGIN
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000003';

  IF v_survey -> 'dietary_preferences' ->> 0 != 'vegan' THEN
    RAISE EXCEPTION 'Test 3 Failed: onboarding_survey data missing or corrupt: %', v_survey;
  END IF;
  IF (v_log ->> 'cube_sku_1')::int != 2 THEN
    RAISE EXCEPTION 'Test 3 Failed: sauce_log data missing or corrupt: %', v_log;
  END IF;
END;
$$;

-- =========================================================================
-- TEST 4: Profile Cascading Delete
-- =========================================================================
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000003';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000003';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Test 4 Failed: Profile was not deleted when the matching auth.user was deleted';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 5: Recipe & Ingredients/Steps Cascading Delete
-- =========================================================================
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('11111111-1111-1111-1111-111111111111', 'Cascade Recipe', 'cascade-recipe', true, 1);

INSERT INTO public.recipe_ingredients (id, recipe_id, name, quantity, position)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Salt', 1.0, 0);

INSERT INTO public.recipe_steps (id, recipe_id, step_number, description)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, 'Mix ingredients');

DELETE FROM public.recipes WHERE id = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  v_ing_count INTEGER;
  v_step_count INTEGER;
END;
$$;

-- Re-check values
DO $$
DECLARE
  v_ing_count INTEGER;
  v_step_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_ing_count FROM public.recipe_ingredients WHERE recipe_id = '11111111-1111-1111-1111-111111111111';
  SELECT COUNT(*) INTO v_step_count FROM public.recipe_steps WHERE recipe_id = '11111111-1111-1111-1111-111111111111';

  IF v_ing_count != 0 THEN
    RAISE EXCEPTION 'Test 5 Failed: Ingredients not cascade-deleted';
  END IF;
  IF v_step_count != 0 THEN
    RAISE EXCEPTION 'Test 5 Failed: Steps not cascade-deleted';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 6: Row Level Security - Anon User Reads
-- =========================================================================
-- Insert one published recipe and one unpublished recipe
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES 
  ('11111111-1111-1111-1111-aaaa11111111', 'Published Chili', 'published-chili', true, 2),
  ('11111111-1111-1111-1111-bbbb22222222', 'Secret Draft Chili', 'secret-draft-chili', false, 3);

-- Perform check as anonymous role
SET LOCAL auth.mock_user_id = '';
SET LOCAL auth.mock_role = 'anon';
SET ROLE anon;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.recipes 
  WHERE id IN ('11111111-1111-1111-1111-aaaa11111111', '11111111-1111-1111-1111-bbbb22222222');
  
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Test 6 Failed: Anonymous user can see unpublished recipes or cannot see published recipes. Visible count: %', v_count;
  END IF;
END;
$$;

-- =========================================================================
-- TEST 7: Row Level Security - User Profile Isolation
-- =========================================================================
RESET ROLE;
-- Set up two users
-- (Done in auth.users earlier: '00000000-0000-0000-0000-000000000001' and '00000000-0000-0000-0000-000000000002')
-- Act as User 1
SET LOCAL auth.mock_user_id = '00000000-0000-0000-0000-000000000001';
SET LOCAL auth.mock_role = 'authenticated';
SET ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- User 1 tries to read User 2 profile
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Test 7 Failed: User 1 was able to read User 2 profile';
  END IF;

  -- User 1 tries to read their own profile
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Test 7 Failed: User 1 was unable to read their own profile';
  END IF;
END;
$$;

-- =========================================================================
-- TEST 8: Row Level Security - CMS Editor Draft Access
-- =========================================================================
RESET ROLE;
-- Act as cms_editor
SET LOCAL auth.mock_user_id = '00000000-0000-0000-0000-000000000001';
SET LOCAL auth.mock_role = 'cms_editor';
SET ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- CMS Editor tries to read both recipes (published and unpublished)
  SELECT COUNT(*) INTO v_count FROM public.recipes 
  WHERE id IN ('11111111-1111-1111-1111-aaaa11111111', '11111111-1111-1111-1111-bbbb22222222');
  
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Test 8 Failed: CMS Editor was unable to read unpublished draft recipes. Visible count: %', v_count;
  END IF;
END;
$$;

ROLLBACK;
```

---

## 5. Implementation Guidance for the Worker Agent

When the Worker agent is spawned, they should execute the following sequence:

1. **Modify `docs/schema.sql`**:
   - Strip out the mock setup block (lines 4 to 24).
   - Update `public.handle_new_user()` to use the safe `CASE` statement for handling JSON nulls.
   - Append the three RLS policies that grant SELECT permissions to authenticated users with the `cms_editor` role.

2. **Create `docs/local_mock_setup.sql`**:
   - Write the exact SQL defined in Section 3.1 to mock schemas, roles, permissions, and session helpers for local testing.

3. **Create `tests/test_schema.sql`**:
   - Write the SQL assertion test suite described in Section 4.2.

4. **Create `tests/verify_schema.sh`**:
   - Write the bash verification script described in Section 4.1.
   - Run `chmod +x tests/verify_schema.sh`.

5. **Verify**:
   - Run `tests/verify_schema.sh` locally.
   - Confirm it prints a success message and exits with status `0`.
   - Include the output logs inside the worker's handoff report.
