# Database Schema Redesign and Fix Plan

## 1. Executive Summary

This report presents the findings and a complete fix strategy to resolve issues found in the database schema implementation for the Super Sauced B2C mobile app. The previous review flagged critical integrity violations (lack of actual verification artifacts), critical security/destructive risks (overwriting production `auth.users` and `auth.uid()`), functional bugs in JSON null handling in the signup trigger, and client draft/preview read limitations.

The proposed strategy guarantees production-safe migrations, resolves JSON null crashes, enables CMS editors to view drafts, and introduces a fully automated, local Docker-based test suite that executes plain SQL assertions using transaction-controlled PL/pgSQL checks.

---

## 2. Problem Breakdown & Solution Design

### Issue 1: Destructive Overwrite of `auth` Schema (Mock Setup Separation)
*   **Problem**: `docs/schema.sql` currently contains `CREATE SCHEMA IF NOT EXISTS auth;`, the `auth.users` table, and a mock `auth.uid()` function returning `null`. In production Supabase, `auth` is system-managed. Executing this file in production would override the native `auth.uid()` helper, breaking all client authentication and RLS security across the database.
*   **Solution**: Extract the mock setup into `docs/local_mock_setup.sql`. The main `docs/schema.sql` will contain only the actual schema (tables, triggers, policies, indexes) and will refer to `auth.users` and `auth.uid()`. This file will execute cleanly in production since Supabase provides these definitions naturally.
*   **Enhancement**: In `docs/local_mock_setup.sql`, design `auth.uid()` and `auth.jwt()` to return values from session parameters:
    ```sql
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT coalesce(current_setting('auth.mock_user_id', true), null)::UUID;
    $$;
    ```
    This allows local tests to simulate different users by executing:
    ```sql
    SET auth.mock_user_id = 'some-uuid';
    ```

### Issue 2: Unhandled JSON Nulls in `public.handle_new_user()` Trigger
*   **Problem**: In `handle_new_user()`, the expression `COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb)` evaluates to `null`::jsonb (JSON null) when `onboarding_survey` is explicitly set to JSON null. Because JSON null is a valid value, the `NOT NULL` constraint is satisfied, but clients will crash expecting a JSON object.
*   **Solution**: Use a SQL `CASE` statement inside the trigger insertion to check if the extracted JSON is SQL NULL or JSON `null` ('null'::jsonb), defaulting to `'{}'::jsonb` if either condition is met.
    ```sql
    CASE 
      WHEN NEW.raw_user_meta_data->'onboarding_survey' IS NULL 
           OR NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb THEN '{}'::jsonb
      ELSE NEW.raw_user_meta_data->'onboarding_survey'
    END
    ```

### Issue 3: Draft/Preview Client Read Limitation
*   **Problem**: RLS policies for `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps` restrict selection to `is_published = true`. This prevents content authors/editors using staging apps from previewing unpublished/draft recipes.
*   **Solution**: Introduce permissive RLS policies allowing read access to unpublished recipes/steps/ingredients if the user possesses the `cms_editor` role:
    ```sql
    CREATE POLICY "cms_editor_read_all_recipes" ON public.recipes
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
    
    CREATE POLICY "cms_editor_read_all_recipe_ingredients" ON public.recipe_ingredients
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');

    CREATE POLICY "cms_editor_read_all_recipe_steps" ON public.recipe_steps
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
    ```

### Issue 4: Verification Artifacts (Verify Script & SQL Asserts)
*   **Problem**: The previous worker reported successful tests, but the files did not exist on disk.
*   **Solution**: Put the actual testing files inside the project under `docs/` (`docs/verify_schema.sh` and `docs/validate.sql`). 
*   **Execution Strategy**: Since `psql` is not installed on the host but `docker` is available, the shell script will spin up a transient Docker container running PostgreSQL 16, pipe the setup, schema, and validation suite into it, and return the exit code of `psql` to caller.

---

## 3. Implementation Details

Here is the exact structure and content of the files to be created/modified by the Worker.

### 3.1 `docs/local_mock_setup.sql` (NEW FILE)
This file establishes a mock Supabase environment for local validation and development. It must never be run on production Supabase.

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create mock auth schema and users table
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.uid() to support dynamic session-based test configuration
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('auth.mock_user_id', true), ''),
    null
  )::UUID;
$$;

-- Mock auth.jwt() to support role-based RLS evaluation
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::JSONB;
$$;
```

### 3.2 `docs/schema.sql` (MODIFICATION SPEC)

The following edits must be made to `docs/schema.sql`:

1.  **Remove lines 4 to 25** (the old inline mock schema, table, and function).
2.  **Ensure RLS policies for cms_editor are appended**:
    ```sql
    -- public.recipes additional cms_editor read policy
    CREATE POLICY "cms_editor_read_all_recipes" ON public.recipes
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');

    -- public.recipe_ingredients additional cms_editor read policy
    CREATE POLICY "cms_editor_read_all_recipe_ingredients" ON public.recipe_ingredients
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');

    -- public.recipe_steps additional cms_editor read policy
    CREATE POLICY "cms_editor_read_all_recipe_steps" ON public.recipe_steps
      FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
    ```
3.  **Update `public.handle_new_user()` trigger function**:
    Replace the old inserts:
    ```sql
    COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
    COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
    ```
    with:
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

### 3.3 `docs/validate.sql` (NEW FILE)
This file performs transaction-isolated PL/pgSQL functional and constraint assertions.

```sql
-- Begin a test transaction
BEGIN;

-- =========================================================================
-- TEST 1: Schema Structure Verification
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    RAISE EXCEPTION 'Table user_profiles is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes') THEN
    RAISE EXCEPTION 'Table recipes is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_ingredients') THEN
    RAISE EXCEPTION 'Table recipe_ingredients is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_steps') THEN
    RAISE EXCEPTION 'Table recipe_steps is missing';
  END IF;
END $$;

-- =========================================================================
-- TEST 2: Index Verification (GIN arrays)
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_index i ON c.oid = i.indexrelid
    JOIN pg_am am ON c.relam = am.oid
    WHERE c.relname = 'idx_recipes_cube_tags' AND am.amname = 'gin'
  ) THEN
    RAISE EXCEPTION 'GIN Index idx_recipes_cube_tags is missing or incorrect';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_index i ON c.oid = i.indexrelid
    JOIN pg_am am ON c.relam = am.oid
    WHERE c.relname = 'idx_recipes_dietary_tags' AND am.amname = 'gin'
  ) THEN
    RAISE EXCEPTION 'GIN Index idx_recipes_dietary_tags is missing or incorrect';
  END IF;
END $$;

-- =========================================================================
-- TEST 3: Trigger & Null/JSON-Null Handling
-- =========================================================================
DO $$
DECLARE
  v_user_sql_null UUID := gen_random_uuid();
  v_user_json_null UUID := gen_random_uuid();
  v_user_valid UUID := gen_random_uuid();
  v_survey JSONB;
  v_log JSONB;
BEGIN
  -- Test 3a: SQL NULL metadata default behavior
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user_sql_null, 'sql_null@example.com', NULL);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log FROM public.user_profiles WHERE id = v_user_sql_null;
  IF v_survey <> '{}'::jsonb OR v_log <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed SQL NULL defaults: Survey: %, Log: %', v_survey, v_log;
  END IF;

  -- Test 3b: JSON null values handling
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user_json_null, 'json_null@example.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log FROM public.user_profiles WHERE id = v_user_json_null;
  IF v_survey = 'null'::jsonb OR v_log = 'null'::jsonb THEN
    RAISE EXCEPTION 'Failed JSON null handler: values are written as raw JSON null';
  END IF;
  IF v_survey <> '{}'::jsonb OR v_log <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed JSON null defaults: Survey: %, Log: %', v_survey, v_log;
  END IF;

  -- Test 3c: Valid values preservation
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user_valid, 'valid@example.com', '{"onboarding_survey": {"spicy": true}, "sauce_log": {"habanero": 3}}'::jsonb);
  
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log FROM public.user_profiles WHERE id = v_user_valid;
  IF v_survey ->> 'spicy' <> 'true' OR v_log ->> 'habanero' <> '3' THEN
    RAISE EXCEPTION 'Failed custom metadata preservation: Survey: %, Log: %', v_survey, v_log;
  END IF;
END $$;

-- =========================================================================
-- TEST 4: Cascade Deletion Integrity
-- =========================================================================
DO $$
DECLARE
  v_recipe_id UUID;
BEGIN
  INSERT INTO public.recipes (title, slug, description, servings_default, cook_time_minutes, difficulty, is_published)
  VALUES ('Test Hot Sauce Recipe', 'test-hot-sauce', 'Spicy recipe', 2, 15, 1, true)
  RETURNING id INTO v_recipe_id;
  
  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 3.5, 'tsp', 'Cayenne Pepper', 1);
  
  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES (v_recipe_id, 1, 'Shake well and pour');
  
  -- Verify they exist
  IF NOT EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id) THEN
    RAISE EXCEPTION 'Ingredient insertion failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = v_recipe_id) THEN
    RAISE EXCEPTION 'Step insertion failed';
  END IF;
  
  -- Delete parent recipe
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  
  -- Verify cascades
  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id) THEN
    RAISE EXCEPTION 'Cascade delete failed: ingredient still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = v_recipe_id) THEN
    RAISE EXCEPTION 'Cascade delete failed: step still exists';
  END IF;
END $$;

-- =========================================================================
-- TEST 5: Row Level Security (RLS) - Profiles & CMS Roles
-- =========================================================================
DO $$
DECLARE
  v_user_a UUID := gen_random_uuid();
  v_user_b UUID := gen_random_uuid();
  v_pub_recipe_id UUID;
  v_draft_recipe_id UUID;
  v_count INTEGER;
BEGIN
  -- Setup test data
  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'usera@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_user_b, 'userb@example.com');
  
  INSERT INTO public.recipes (title, slug, is_published, difficulty)
  VALUES ('Published Recipe', 'pub-r', true, 1)
  RETURNING id INTO v_pub_recipe_id;
  
  INSERT INTO public.recipes (title, slug, is_published, difficulty)
  VALUES ('Draft Recipe', 'draft-r', false, 1)
  RETURNING id INTO v_draft_recipe_id;

  -- Test 5a: User Profiles RLS (User A perspective)
  PERFORM set_config('auth.mock_user_id', v_user_a::text, true);
  
  SELECT count(*) INTO v_count FROM public.user_profiles WHERE id = v_user_a;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS fail: User A cannot read own profile';
  END IF;
  
  SELECT count(*) INTO v_count FROM public.user_profiles WHERE id = v_user_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS violation: User A can read User B profile';
  END IF;
  
  UPDATE public.user_profiles SET onboarding_survey = '{"compromised": true}'::jsonb WHERE id = v_user_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS violation: User A updated User B profile';
  END IF;
  
  -- Test 5b: General Public Recipe Access RLS (Anonymous perspective)
  PERFORM set_config('auth.mock_user_id', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  
  SELECT count(*) INTO v_count FROM public.recipes WHERE id = v_pub_recipe_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS fail: Public cannot read published recipe';
  END IF;
  
  SELECT count(*) INTO v_count FROM public.recipes WHERE id = v_draft_recipe_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS violation: Public can read draft recipe';
  END IF;

  -- Test 5c: CMS Editor Recipe Access RLS (Role check)
  PERFORM set_config('request.jwt.claims', '{"role": "cms_editor"}', true);
  
  SELECT count(*) INTO v_count FROM public.recipes WHERE id = v_draft_recipe_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS fail: cms_editor cannot read draft recipe';
  END IF;
  
  -- Reset configurations
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Rollback transaction to leave database clean
ROLLBACK;
```

### 3.4 `docs/verify_schema.sh` (NEW FILE)
This executable bash script manages a containerized Postgres instance, loads scripts in order, runs the assertions, captures the result, and cleans up.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Define variables
CONTAINER_NAME="supersauced-db-verifier-$(date +%s)"
PG_IMAGE="postgres:16"

echo "========================================="
echo "Starting Database Schema Verification"
echo "========================================="

# 1. Start clean postgres instance
echo "Starting container: $CONTAINER_NAME..."
docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres -d "$PG_IMAGE" > /dev/null

# Hook for automatic cleanup on exit (normal exit or error)
cleanup() {
  echo "Stopping and removing container $CONTAINER_NAME..."
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 2. Wait until postgres is ready inside container
echo "Waiting for database to accept connections..."
until docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done
echo "Database is ready."

# 3. Load files sequentially
echo "Loading auth schema mocks (docs/local_mock_setup.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/local_mock_setup.sql

echo "Loading database schema (docs/schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/schema.sql

echo "Executing functional validation suite (docs/validate.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/validate.sql

echo "========================================="
echo "SUCCESS: Database Schema Verification Passed"
echo "========================================="
```

---

## 4. Execution Roadmap for Worker

The worker should follow these steps:

1.  **Create local mock setup**: Write the contents of Section 3.1 to `docs/local_mock_setup.sql`.
2.  **Edit main schema**: Modify `docs/schema.sql` by:
    *   Removing the destructive mock schema block.
    *   Updating `public.handle_new_user()` trigger function to use `CASE` statements checking JSON null.
    *   Appending the three RLS policies for `cms_editor` read bypass.
3.  **Create test suite**: Write the assertions from Section 3.3 to `docs/validate.sql`.
4.  **Create wrapper script**: Write the bash wrapper script from Section 3.4 to `docs/verify_schema.sh` and make it executable:
    ```bash
    chmod +x docs/verify_schema.sh
    ```
5.  **Execute & Verify**: Run `docs/verify_schema.sh` and capture log output to verify success.
