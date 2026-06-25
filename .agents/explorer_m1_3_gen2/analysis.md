# Database Schema Analysis & Proposed Redesign Plan

## Executive Summary
This analysis addresses critical feedback regarding local mock setup separation, JSON null handling bugs in the signup trigger, RLS policies for CMS preview roles, and the creation of a containerized automated verification test suite. The proposed plan separates system-managed auth overrides into `docs/local_mock_setup.sql`, implements robust JSON null checks using a `CASE` construct in `public.handle_new_user()`, and provides a complete Docker-based bash verification script (`docs/verify_schema.sh`) and database assertion file (`docs/validate.sql`).

---

## 1. Findings and Issue Catalog

The table below summarizes the key issues identified in the current database design iteration (context from `/home/freya/supersauced/docs/schema.sql` and `/home/freya/supersauced/.agents/reviewer_m1_1/review.md`):

| Finding ID | Severity | File & Location | Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **Finding 1** | **Critical** | `worker_m1_1/handoff.md` | Verification script (`verify_schema.sh`) and tests (`validate.sql`) were claimed but do not exist in the workspace. | Implement a concrete, automated, Docker-based test runner script and an SQL test file. |
| **Finding 2** | **Critical** | `docs/schema.sql` (lines 4-25) | Destructive schema overwrite: `auth` schema and `auth.uid()` are stubbed inside the production migration, which would brick a native Supabase instance. | Remove all auth mocks from `docs/schema.sql` and extract them into a separate development file `docs/local_mock_setup.sql`. |
| **Finding 3** | **Major** | `docs/schema.sql` (lines 183-202) | Unhandled JSON `null`: Using `COALESCE` with `raw_user_meta_data->'onboarding_survey'` allows `'null'::jsonb` to bypass constraints and crash clients. | Replace `COALESCE` with a `CASE` expression checking for SQL `NULL` and JSONB `'null'::jsonb` equality. |
| **Finding 4** | **Minor** | `docs/schema.sql` (lines 154-177) | Draft/Preview Client Read Limitation: `is_published = true` policy prevents CMS editors from previewing drafts. | Expand the RLS select policies to allow reads if `is_published = true` OR the user's JWT role matches `cms_editor`. |

---

## 2. Detailed Technical Fix Plan

### 2.1. Separation of Mock Setup (Finding 2)
The mock setup for the `auth` schema must be isolated to prevent destructive overwrites of native Supabase infrastructure. 

#### Changes to `docs/schema.sql`:
Remove the entire section defining `auth` schema, `auth.users` table, and `auth.uid()` function (lines 4–25). The file will begin with `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` and then immediately declare the utility functions and tables in the `public` schema.

#### Creation of `docs/local_mock_setup.sql`:
Create a developer sandbox setup script. This script will mock the auth system and provide session-parameter-based helper functions to allow dynamic mocking of user IDs and JWT claims in tests and local development.

```sql
-- =========================================================================
-- LOCAL DEVELOPMENT MOCK SETUP (DO NOT RUN IN PRODUCTION)
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS auth;

-- Mock the Supabase auth.users table structure
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.uid() dynamically utilizing local session variables
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('auth.test_user_id', true), '')
  )::uuid;
$$;

-- Mock auth.jwt() dynamically utilizing local session variables
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    nullif(current_setting('auth.test_jwt_claims', true), '')
  )::jsonb;
$$;
```

---

### 2.2. Handling JSON Null in Trigger Function (Finding 3)
In PostgreSQL, `raw_user_meta_data->'key'` returns `'null'::jsonb` if the JSON key is explicitly set to `null`. This is a non-null SQL value, which bypasses `COALESCE` but violates application-level type expectations.

#### Proposed Trigger Code modification in `public.handle_new_user()`:
Replace:
```sql
COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
```
With:
```sql
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
```

---

### 2.3. RLS Policies for CMS Draft Previews (Finding 4)
Update `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps` `SELECT` policies to allow access to draft recipes for users authenticated as `cms_editor`.

#### Modified Policies:
```sql
-- public.recipes policy
CREATE POLICY "public_read_published_recipes" ON public.recipes
  FOR SELECT USING (
    is_published = true 
    OR (auth.jwt() ->> 'role') = 'cms_editor'
  );

-- public.recipe_ingredients policy
CREATE POLICY "public_read_published_recipe_ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND (
          public.recipes.is_published = true
          OR (auth.jwt() ->> 'role') = 'cms_editor'
        )
    )
  );

-- public.recipe_steps policy
CREATE POLICY "public_read_published_recipe_steps" ON public.recipe_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND (
          public.recipes.is_published = true
          OR (auth.jwt() ->> 'role') = 'cms_editor'
        )
    )
  );
```

---

## 3. Verification Script and Test Suite Design (Finding 1)

Since `psql` is not installed natively on the system but `docker` is available, we will deploy a containerized database verification suite.

### 3.1. Proposed `docs/validate.sql` Structure
This SQL script contains assertions written using PostgreSQL `DO` blocks. It verifies relational integrity, triggers, JSON null handling, and RLS behaviors.

```sql
-- Enable client-side error reporting on failure
\set ON_ERROR_STOP on

-- Ensure RLS is active during testing by executing as a custom test role
CREATE ROLE test_user_role;

-- Grant permissions to test role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_user_role;
GRANT USAGE ON SCHEMA public TO test_user_role;

-- =========================================================================
-- TEST CASE 1: Core trigger handles SQL NULL & JSON Null on Auth Sign-Up
-- =========================================================================
DO $$
DECLARE
  v_user1_id UUID := gen_random_uuid();
  v_user2_id UUID := gen_random_uuid();
  v_user3_id UUID := gen_random_uuid();
  v_survey JSONB;
  v_log JSONB;
BEGIN
  -- Subcase A: raw_user_meta_data is SQL NULL
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user1_id, 'user1@test.com', NULL);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = v_user1_id;
  ASSERT v_survey = '{}'::jsonb, 'Trigger failed to default onboarding_survey from SQL NULL';
  ASSERT v_log = '{}'::jsonb, 'Trigger failed to default sauce_log from SQL NULL';

  -- Subcase B: raw_user_meta_data contains explicit JSON nulls
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user2_id, 'user2@test.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = v_user2_id;
  ASSERT v_survey = '{}'::jsonb, 'Trigger failed to handle JSON null for onboarding_survey';
  ASSERT v_log = '{}'::jsonb, 'Trigger failed to handle JSON null for sauce_log';

  -- Subcase C: raw_user_meta_data contains valid survey preferences
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user3_id, 'user3@test.com', '{"onboarding_survey": {"spicy": true}, "sauce_log": {"count": 4}}'::jsonb);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = v_user3_id;
  ASSERT v_survey = '{"spicy": true}'::jsonb, 'Trigger failed to populate onboarding_survey';
  ASSERT v_log = '{"count": 4}'::jsonb, 'Trigger failed to populate sauce_log';
END;
$$;

-- =========================================================================
-- TEST CASE 2: Relational Cascades (User Delete -> Profile Delete)
-- =========================================================================
DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_profile_exists BOOLEAN;
BEGIN
  -- Insert user
  INSERT INTO auth.users (id, email) VALUES (v_user_id, 'cascade_test@test.com');
  
  -- Verify profile exists
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = v_user_id) INTO v_profile_exists;
  ASSERT v_profile_exists = TRUE, 'Profile was not created for cascade test';
  
  -- Delete user
  DELETE FROM auth.users WHERE id = v_user_id;
  
  -- Verify profile is deleted
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = v_user_id) INTO v_profile_exists;
  ASSERT v_profile_exists = FALSE, 'ON DELETE CASCADE failed from auth.users to public.user_profiles';
END;
$$;

-- =========================================================================
-- TEST CASE 3: Relational Cascades (Recipe Delete -> Ingredients/Steps Delete)
-- =========================================================================
DO $$
DECLARE
  v_recipe_id UUID;
  v_count INTEGER;
BEGIN
  -- Insert recipe
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Test Recipe', 'test-recipe', 2, TRUE)
  RETURNING id INTO v_recipe_id;

  -- Insert step & ingredient
  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES (v_recipe_id, 1, 'Heat pan');

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 2.5, 'tbsp', 'Oil', 1);

  -- Delete recipe
  DELETE FROM public.recipes WHERE id = v_recipe_id;

  -- Verify steps and ingredients are deleted
  SELECT count(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  ASSERT v_count = 0, 'ON DELETE CASCADE failed for recipe_steps';

  SELECT count(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  ASSERT v_count = 0, 'ON DELETE CASCADE failed for recipe_ingredients';
END;
$$;

-- =========================================================================
-- TEST CASE 4: Numeric Precision and Constraint Checks
-- =========================================================================
DO $$
DECLARE
  v_recipe_id UUID;
  v_quantity NUMERIC(10,1);
BEGIN
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Precision Recipe', 'precision-recipe', 1, TRUE)
  RETURNING id INTO v_recipe_id;

  -- Subcase A: Valid decimal storage and precision
  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 12.3, 'g', 'Pepper', 1)
  RETURNING quantity INTO v_quantity;
  ASSERT v_quantity = 12.3, 'Numeric precision scale mismatch';

  -- Subcase B: Verify negative quantity constraint
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
    VALUES (v_recipe_id, -1.5, 'g', 'Pepper', 2);
    RAISE EXCEPTION 'Negative quantity was accepted (CHECK constraint failure)';
  EXCEPTION
    WHEN check_violation THEN
      -- Expected behavior
  END;
END;
$$;

-- =========================================================================
-- TEST CASE 5: RLS Policy Assertions (Anonymous/User/CMS Editor roles)
-- =========================================================================
DO $$
DECLARE
  v_recipe_pub_id UUID;
  v_recipe_draft_id UUID;
  v_count INTEGER;
BEGIN
  -- Insert one published and one draft recipe
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Pub Recipe', 'pub-recipe', 1, TRUE)
  RETURNING id INTO v_recipe_pub_id;

  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Draft Recipe', 'draft-recipe', 2, FALSE)
  RETURNING id INTO v_recipe_draft_id;

  -- Switch session to the test_user_role to enforce RLS
  SET ROLE test_user_role;

  -- Subcase A: Default (anonymous/unauthenticated user)
  -- Should see only published recipes
  SET LOCAL auth.test_jwt_claims = '{}';
  SELECT count(*) INTO v_count FROM public.recipes;
  ASSERT v_count = 1, 'Anonymous user should only see published recipes';

  -- Subcase B: CMS Editor JWT Role
  -- Should see both draft and published recipes
  SET LOCAL auth.test_jwt_claims = '{"role": "cms_editor"}';
  SELECT count(*) INTO v_count FROM public.recipes;
  ASSERT v_count = 2, 'CMS Editor should see draft and published recipes';

  -- Restore administrative session
  RESET ROLE;
END;
$$;

-- Cleanup test objects
DROP ROLE test_user_role;
TRUNCATE auth.users CASCADE;
TRUNCATE public.recipes CASCADE;

\echo 'All test cases passed successfully!'
```

### 3.2. Proposed `docs/verify_schema.sh`
This script orchestrates the Docker setup, runs all migration and validation SQL files sequentially, checks for exit codes, and guarantees teardown.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
CONTAINER_NAME="supersauced-pg-validator"
POSTGRES_DB="postgres"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="temporary_test_password"
IMAGE_TAG="16-alpine"

# Root workspace directory navigation helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Starting database schema validation..."

# 1. Clean up stale container if it exists
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}$"; then
  echo "==> Cleaning up previous test container..."
  docker rm -f "$CONTAINER_NAME" > /dev/null
fi

# 2. Start PostgreSQL 16 container
echo "==> Launching container postgres:${IMAGE_TAG}..."
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -d postgres:${IMAGE_TAG} > /dev/null

# 3. Setup container cleanup trap
cleanup() {
  echo "==> Cleaning up container..."
  docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1
}
trap cleanup EXIT

# 4. Wait for database to start up
echo -n "==> Waiting for database to be ready"
until docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " Ready!"

# 5. Apply and Verify scripts
echo "==> Executing docs/local_mock_setup.sql..."
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$PROJECT_ROOT/docs/local_mock_setup.sql"

echo "==> Executing docs/schema.sql..."
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$PROJECT_ROOT/docs/schema.sql"

echo "==> Executing docs/validate.sql..."
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$PROJECT_ROOT/docs/validate.sql"

echo "==> DATABASE SCHEMA VERIFICATION SUCCESSFUL!"
```

---

## 4. Layout and Compliance Verification

- All source files, migration files, test files, and verification scripts are designed to be placed in `docs/` within the repository root:
  - `docs/schema.sql` (native schema)
  - `docs/local_mock_setup.sql` (local mocks)
  - `docs/validate.sql` (tests)
  - `docs/verify_schema.sh` (runner script)
- No source or test files are placed inside the `.agents/` folder, ensuring strict compliance with the **layout layout discipline** (e.g. no tests/source code in `.agents/`). The `.agents/` folder will only contain metadata reports, briefing, progress, and original request files.
