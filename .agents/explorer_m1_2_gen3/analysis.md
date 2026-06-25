# Database Schema Redesign & Fix Plan (Milestone 1)

## Summary of Findings

Following the previous review cycle, several critical issues were identified:
1. **Destructive Mock Setup**: Mocking the `auth` schema and `auth.uid()` directly in `docs/schema.sql` poses a major security and operational risk. Running it on production Supabase would overwrite the system-managed `auth` schema and brick authentication.
2. **Unhandled JSON Nulls**: The `public.handle_new_user()` trigger function uses `COALESCE` on `NEW.raw_user_meta_data->'onboarding_survey'`. If the user has a literal JSON `null` (e.g., `{"onboarding_survey": null}`), PostgreSQL inserts `'null'::jsonb` rather than the default `'{}'::jsonb`, violating the logical constraint and causing client-side crashes.
3. **Draft/Preview Read Limitation**: RLS restricts all read access on `recipes`, `recipe_ingredients`, and `recipe_steps` to `is_published = true`. This prevents content editors from previewing drafts in the application using standard authenticated credentials.
4. **Missing Verification Artifacts**: The previous iteration lacked a functional verification script (`verify_schema.sh`) and integration tests (`validate.sql`). 

---

## Fix Strategy & Proposed Redesign

We propose the following plan to implement the schema and test framework cleanly:

### 1. Separate Mocks to `docs/local_mock_setup.sql`
All mock tables, schemas, and helper functions (such as `auth.uid()`, `auth.jwt()`, and standard Supabase roles) will be separated from `docs/schema.sql` and placed in a dedicated local setup script. This script will only run in local test and dev environments.

### 2. Update `docs/schema.sql`
The primary schema will be streamlined to execute safely on production. It will:
- Begin directly with the creation of the `public` schema components.
- Implement robust JSON null checks in `public.handle_new_user()`.
- Update RLS policies to check for the `cms_editor` role from JWT claims.

### 3. Establish Verification Framework
We will implement two new files in the `docs/` directory:
- `docs/validate.sql`: A pure SQL integration test suite using PL/pgSQL assertions.
- `docs/verify_schema.sh`: A shell script that spins up a PostgreSQL 16 Docker container, applies the mock setup, migrates the schema, and executes the validation tests under transaction rollback.

---

## Proposed Implementations

### A. `docs/local_mock_setup.sql`
This script configures a standard Supabase-like environment locally for schema compiling and RLS testing:

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- MOCK SETUP FOR AUTH SCHEMA & AUTH.USERS TABLE (LOCAL/TEST ONLY)
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS auth;

-- Create default Supabase mock roles if they do not exist
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
END $$;

-- Mock auth.users table structure as it exists in Supabase
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock the auth.uid() function to support dynamic session variables for testing
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
    current_setting('test.mock_uid', true)
  )::uuid;
$$;

-- Mock the auth.jwt() function to support dynamic session variables for testing RLS custom claims
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Grant schema usage to mimic Supabase permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Set default privileges for tables created in the future
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
```

### B. Updated `docs/schema.sql` (Key Modifications)

#### 1) The Trigger Function with Robust JSON Null Handling
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onboarding_survey JSONB;
  v_sauce_log JSONB;
BEGIN
  -- Extract and default onboarding_survey (checks for SQL NULL and JSON null)
  IF NEW.raw_user_meta_data IS NULL OR 
     NEW.raw_user_meta_data->'onboarding_survey' IS NULL OR 
     NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb THEN
    v_onboarding_survey := '{}'::jsonb;
  ELSE
    v_onboarding_survey := NEW.raw_user_meta_data->'onboarding_survey';
  END IF;

  -- Extract and default sauce_log (checks for SQL NULL and JSON null)
  IF NEW.raw_user_meta_data IS NULL OR 
     NEW.raw_user_meta_data->'sauce_log' IS NULL OR 
     NEW.raw_user_meta_data->'sauce_log' = 'null'::jsonb THEN
    v_sauce_log := '{}'::jsonb;
  ELSE
    v_sauce_log := NEW.raw_user_meta_data->'sauce_log';
  END IF;

  INSERT INTO public.user_profiles (
    id,
    onboarding_survey,
    sauce_log
  )
  VALUES (
    NEW.id,
    v_onboarding_survey,
    v_sauce_log
  );
  RETURN NEW;
END;
$$;
```

#### 2) RLS Policies Supporting Preview for Content Editors (`cms_editor`)
```sql
-- public.recipes policy
CREATE POLICY "public_read_published_recipes" ON public.recipes
  FOR SELECT USING (
    is_published = true 
    OR (auth.jwt() ->> 'role' = 'cms_editor')
  );

-- public.recipe_ingredients policy
CREATE POLICY "public_read_published_recipe_ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role' = 'cms_editor'))
    )
  );

-- public.recipe_steps policy
CREATE POLICY "public_read_published_recipe_steps" ON public.recipe_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role' = 'cms_editor'))
    )
  );
```

---

## Verification Plan

### C. `docs/verify_schema.sh`
This script uses a short-lived Docker container to migrate and test the schema cleanly.

```bash
#!/usr/bin/env bash
# verify_schema.sh
# Local schema validation script using Dockerized PostgreSQL 16.
# Exits with 0 if all tests pass, and non-zero otherwise.

set -euo pipefail

DB_CONTAINER_NAME="supersauced-postgres-test"
DB_USER="postgres"
DB_NAME="testdb"
DB_PASSWORD="postgres"

echo "=== 1. Starting temporary PostgreSQL 16 container ==="
if docker ps -a --format '{{.Names}}' | grep -Eq "^${DB_CONTAINER_NAME}$"; then
  echo "Stopping and removing existing container..."
  docker stop "${DB_CONTAINER_NAME}" &>/dev/null || true
  docker rm "${DB_CONTAINER_NAME}" &>/dev/null || true
fi

docker run --name "${DB_CONTAINER_NAME}" \
  -e POSTGRES_DB="${DB_NAME}" \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
  -p 5432:5432 \
  -d postgres:16-alpine

# Function to clean up on exit
cleanup() {
  echo "=== Cleanup: Stopping and removing test container ==="
  docker stop "${DB_CONTAINER_NAME}" &>/dev/null || true
  docker rm "${DB_CONTAINER_NAME}" &>/dev/null || true
}
trap cleanup EXIT

echo "=== 2. Waiting for database to be ready ==="
until docker exec "${DB_CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" &>/dev/null; do
  echo "Waiting..."
  sleep 1
done
echo "PostgreSQL is ready!"

echo "=== 3. Applying local mock setup ==="
docker exec -i "${DB_CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < docs/local_mock_setup.sql

echo "=== 4. Applying database schema ==="
docker exec -i "${DB_CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < docs/schema.sql

echo "=== 5. Running validation test suite ==="
docker exec -i "${DB_CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 < docs/validate.sql

echo "=== SUCCESS: All schema validations and tests passed! ==="
```

### D. `docs/validate.sql`
Integrates pure-SQL tests to verify schema integrity and functional requirements.

```sql
-- docs/validate.sql
-- Integration test validation suite for the database schema.

\echo '=== Running Validation Tests ==='

-- Use a transaction so that everything rolls back or fails if there is any issue
BEGIN;

-- Test 1: Verify schema tables exist
DO $$
BEGIN
  ASSERT (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles')), 'public.user_profiles table is missing';
  ASSERT (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes')), 'public.recipes table is missing';
  ASSERT (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_ingredients')), 'public.recipe_ingredients table is missing';
  ASSERT (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_steps')), 'public.recipe_steps table is missing';
END $$;

-- Test 2: Trigger public.handle_new_user() under various raw_user_meta_data conditions
DO $$
DECLARE
  v_user_1_id UUID := gen_random_uuid();
  v_user_2_id UUID := gen_random_uuid();
  v_user_3_id UUID := gen_random_uuid();
  v_user_4_id UUID := gen_random_uuid();
  v_profile RECORD;
BEGIN
  -- Scenario A: Complete metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_1_id,
    'user1@test.com',
    '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"sku_1": 3}}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_1_id;
  ASSERT v_profile.onboarding_survey = '{"dietary_preferences": ["vegan"]}'::jsonb, 'Failed Scenario A (onboarding_survey)';
  ASSERT v_profile.sauce_log = '{"sku_1": 3}'::jsonb, 'Failed Scenario A (sauce_log)';

  -- Scenario B: JSON null values
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_2_id,
    'user2@test.com',
    '{"onboarding_survey": null, "sauce_log": null}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_2_id;
  ASSERT v_profile.onboarding_survey = '{}'::jsonb, 'Failed Scenario B (onboarding_survey did not default)';
  ASSERT v_profile.sauce_log = '{}'::jsonb, 'Failed Scenario B (sauce_log did not default)';

  -- Scenario C: Missing metadata keys
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_3_id,
    'user3@test.com',
    '{"other_keys": "value"}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_3_id;
  ASSERT v_profile.onboarding_survey = '{}'::jsonb, 'Failed Scenario C (onboarding_survey did not default)';
  ASSERT v_profile.sauce_log = '{}'::jsonb, 'Failed Scenario C (sauce_log did not default)';

  -- Scenario D: Entirely NULL metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_4_id,
    'user4@test.com',
    NULL
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_4_id;
  ASSERT v_profile.onboarding_survey = '{}'::jsonb, 'Failed Scenario D (onboarding_survey did not default)';
  ASSERT v_profile.sauce_log = '{}'::jsonb, 'Failed Scenario D (sauce_log did not default)';

END $$;

-- Test 3: Relational integrity and ON DELETE CASCADE
DO $$
DECLARE
  v_user_id UUID;
  v_recipe_id UUID;
  v_count INTEGER;
BEGIN
  -- A. User delete cascade
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  DELETE FROM auth.users WHERE id = v_user_id;
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_id;
  ASSERT v_count = 0, 'User profile not deleted when user was deleted';

  -- B. Recipe delete cascade
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Test Recipe', 'test-recipe', 2, true)
  RETURNING id INTO v_recipe_id;

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 1.5, 'cups', 'Flour', 1);

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES (v_recipe_id, 1, 'Mix ingredients');

  DELETE FROM public.recipes WHERE id = v_recipe_id;

  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  ASSERT v_count = 0, 'Recipe ingredients not cascade-deleted';

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  ASSERT v_count = 0, 'Recipe steps not cascade-deleted';

END $$;

-- Test 4: Numeric precision on recipe ingredients
DO $$
DECLARE
  v_recipe_id UUID;
  v_quantity NUMERIC(10,1);
BEGIN
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Test Recipe Precision', 'test-recipe-precision', 1, true)
  RETURNING id INTO v_recipe_id;

  -- 0.3 cup
  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 0.3, 'cups', 'Sugar', 1);

  SELECT quantity INTO v_quantity FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  ASSERT v_quantity = 0.3, 'Decimal precision value mismatch';
END $$;

-- Test 5: RLS Policies for Anonymous, Authenticated, and CMS Editor
DO $$
DECLARE
  v_recipe_pub_id UUID;
  v_recipe_draft_id UUID;
  v_count INTEGER;
BEGIN
  -- Insert one published and one draft recipe for testing
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Pub Recipe', 'pub-recipe', 2, true)
  RETURNING id INTO v_recipe_pub_id;

  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Draft Recipe', 'draft-recipe', 2, false)
  RETURNING id INTO v_recipe_draft_id;

  -- Scenario A: Test as 'anon' user (can only see published)
  SET LOCAL ROLE anon;
  
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  ASSERT v_count = 1, 'Anon user cannot read published recipe';

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  ASSERT v_count = 0, 'Anon user could read draft recipe';
  RESET ROLE;

  -- Scenario B: Test as 'authenticated' user (can only see published)
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}';

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  ASSERT v_count = 1, 'Authenticated user cannot read published recipe';

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  ASSERT v_count = 0, 'Authenticated user could read draft recipe';
  RESET ROLE;
  RESET request.jwt.claims;

  -- Scenario C: Test as 'cms_editor' (can see both draft and published)
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "cms_editor"}';

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  ASSERT v_count = 1, 'CMS Editor cannot read published recipe';

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  ASSERT v_count = 1, 'CMS Editor cannot read draft recipe (RLS block)';
  RESET ROLE;
  RESET request.jwt.claims;

END $$;

ROLLBACK;
\echo '=== All Tests Passed Successfully ==='
```
