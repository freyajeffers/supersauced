# Analysis Report — Database Schema Design & Fix Strategy

## Executive Summary
This report analyzes the database schema (`/home/freya/supersauced/docs/schema.sql`) and the findings from the previous reviewer (`/home/freya/supersauced/.agents/reviewer_m1_1/review.md`). It provides a comprehensive, read-only design and fix strategy to address critical issues including fabricated verification scripts, security/destructiveness risks with mock functions, unhandled JSON nulls in triggers, and Row-Level Security (RLS) limitations for CMS content editors.

---

## Detailed Findings & Recommendations

### 1. Fabricated Verification Artifacts
- **Observation**: The previous agent's handoff claimed the existence of `/home/freya/supersauced/.agents/worker_m1_1/verify_schema.sh` and `validate.sql`. However, these files were completely absent on disk, violating integrity guidelines.
- **Impact**: Undermined project validation reliability and auditability.
- **Recommendation**:
  - Implement a real, self-contained shell script `verify_schema.sh` and a PostgreSQL test script `validate.sql`.
  - These scripts will run in a sandbox database environment (local PostgreSQL or containerized database) to verify schema compilation, trigger behavior, RLS policies, and key constraints.
  - Detail the structures and contents of these verification files (see the *Verification Plan* section).

### 2. Mock Setup Inside `schema.sql` (Security Risk)
- **Observation**: The schema file `/home/freya/supersauced/docs/schema.sql` (lines 7-24) contains:
  - `CREATE SCHEMA IF NOT EXISTS auth;`
  - `CREATE TABLE IF NOT EXISTS auth.users (...);`
  - `CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID ...`
- **Impact**: Running this script on a live/managed Supabase instance will overwrite the system-managed `auth.uid()` function and potentially modify the `auth.users` table, which would completely brick authentication and RLS validation across the entire application.
- **Recommendation**:
  - Remove all mock setup code from `schema.sql`.
  - Place all local testing mocks (schemas, tables, functions) into a dedicated development script: `/home/freya/supersauced/docs/local_mock_setup.sql`.
  - This script must only be run during local testing/CI and never deployed to production Supabase instances.
  - The core migration/schema file `schema.sql` will assume that `auth.users` and the `auth` schema functions are already provided by the environment.

### 3. Unhandled JSON Nulls in Signup Trigger
- **Observation**: In `schema.sql` (lines 197-198), the trigger function `public.handle_new_user()` initializes `onboarding_survey` and `sauce_log` using `COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb)`.
- **Impact**: If a user is registered with metadata like `{"onboarding_survey": null}`, the arrow operator `->` retrieves JSON `null` (`'null'::jsonb`). Since `'null'::jsonb` is a non-null SQL value, `COALESCE` does not fall back to `'{}'::jsonb`. The literal `'null'::jsonb` gets written into the column, violating the structural expectation of a JSON object and causing client-side deserialization/runtime crashes.
- **Recommendation**:
  - Utilize `NULLIF` combined with `COALESCE` to convert JSON `null` values into SQL `NULL`, which will then successfully fall back to the default empty object `'{}'::jsonb`.
  - Modify the value assignments in the trigger function as follows:
    ```sql
    COALESCE(NULLIF(NEW.raw_user_meta_data->'onboarding_survey', 'null'::jsonb), '{}'::jsonb)
    COALESCE(NULLIF(NEW.raw_user_meta_data->'sauce_log', 'null'::jsonb), '{}'::jsonb)
    ```

### 4. RLS Draft/Preview Read Limitations
- **Observation**: The current SELECT policies on `recipes`, `recipe_ingredients`, and `recipe_steps` restrict read queries to `is_published = true`.
- **Impact**: Content editors and preview environments using client credentials cannot access drafts or previews of unpublished recipes.
- **Recommendation**:
  - Add modular policies that allow read access if the requester has the `cms_editor` role.
  - Check the role via the standard Supabase JWT claim helper: `auth.jwt() ->> 'role' = 'cms_editor'`.
  - Define separate, clean RLS policies for maximum performance and readability:
    - **`public.recipes`**:
      ```sql
      CREATE POLICY "cms_editor_read_all_recipes" ON public.recipes
        FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
      ```
    - **`public.recipe_ingredients`**:
      ```sql
      CREATE POLICY "cms_editor_read_all_recipe_ingredients" ON public.recipe_ingredients
        FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
      ```
    - **`public.recipe_steps`**:
      ```sql
      CREATE POLICY "cms_editor_read_all_recipe_steps" ON public.recipe_steps
        FOR SELECT USING (auth.jwt() ->> 'role' = 'cms_editor');
      ```
  - Stub the `auth.jwt()` helper in `local_mock_setup.sql` to support local policy compilation and testing:
    ```sql
    CREATE OR REPLACE FUNCTION auth.jwt()
    RETURNS JSONB
    LANGUAGE sql
    STABLE
    AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    ```

---

## Proposed File Refactorings

### 1. Stripping Mocks from `schema.sql` (Proposed Changes)
Remove lines 5 to 24 from `/home/freya/supersauced/docs/schema.sql`.

### 2. Proposed `/home/freya/supersauced/docs/local_mock_setup.sql`
```sql
-- =========================================================================
-- LOCAL DEVELOPMENT MOCK SETUP FOR SUPABASE ENVIRONMENT
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.uid() using a session variable for testing
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.auth_uid', true), '')::uuid;
$$;

-- Mock auth.jwt() using session claims for testing
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
```

---

## Verification Plan

A robust verification framework must be implemented in the agent directory to allow a worker/verifier to confirm correct implementation without manually running database commands.

### File 1: `verify_schema.sh`
This script coordinates setting up a test database schema, applying the mock configuration, executing testing queries, and validating exit codes.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Configuration - Fallback to default postgres connection variables
DB_NAME=${PGDATABASE:-postgres}
DB_USER=${PGUSER:-postgres}
DB_PORT=${PGPORT:-5432}
DB_HOST=${PGHOST:-localhost}

echo "Starting database schema verification..."

# Helper function to run sql files
run_sql_file() {
  local file=$1
  echo "Applying: $file"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"
}

# 2. Run clean/setup script first (local mocks)
run_sql_file "/home/freya/supersauced/docs/local_mock_setup.sql"

# 3. Compile core schema.sql
run_sql_file "/home/freya/supersauced/docs/schema.sql"

# 4. Execute validation suite
echo "Running validation tests..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "validate.sql"; then
  echo "Verification successfully passed!"
  exit 0
else
  echo "Verification FAILED!"
  exit 1
fi
```

### File 2: `validate.sql`
This file executes programmatic checks within transactions, throwing SQL exceptions if assertions fail.

```sql
BEGIN;

-- Setup Test Roles and Grant Privileges
DROP ROLE IF EXISTS app_test_user;
CREATE ROLE app_test_user;
GRANT SELECT ON public.recipes TO app_test_user;
GRANT SELECT ON public.recipe_ingredients TO app_test_user;
GRANT SELECT ON public.recipe_steps TO app_test_user;
GRANT SELECT ON public.user_profiles TO app_test_user;

-- Clear any pre-existing records from test runs
TRUNCATE auth.users CASCADE;
TRUNCATE public.recipes CASCADE;

-- =========================================================================
-- TEST 1: User Signup Trigger & JSON Null Checks
-- =========================================================================

-- Case A: Missing meta-data entirely (NULL)
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('10000000-0000-0000-0000-000000000001', 'user_null@example.com', NULL);

-- Case B: JSON Nulls ('null'::jsonb) inside meta-data keys
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('10000000-0000-0000-0000-000000000002', 'user_json_null@example.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);

-- Case C: Valid data provided
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('10000000-0000-0000-0000-000000000003', 'user_valid@example.com', '{"onboarding_survey": {"survey_done": true}, "sauce_log": {"favorite": "spicy"}}'::jsonb);

-- Assertions for Test 1
DO $$
DECLARE
  v_survey_null jsonb;
  v_survey_json_null jsonb;
  v_survey_valid jsonb;
BEGIN
  SELECT onboarding_survey INTO v_survey_null FROM public.user_profiles WHERE id = '10000000-0000-0000-0000-000000000001';
  SELECT onboarding_survey INTO v_survey_json_null FROM public.user_profiles WHERE id = '10000000-0000-0000-0000-000000000002';
  SELECT onboarding_survey INTO v_survey_valid FROM public.user_profiles WHERE id = '10000000-0000-0000-0000-000000000003';

  IF v_survey_null IS NULL OR v_survey_null <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: NULL metadata failed to fallback to empty object';
  END IF;

  IF v_survey_json_null IS NULL OR v_survey_json_null = 'null'::jsonb OR v_survey_json_null <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: JSON null metadata failed to fallback to empty object';
  END IF;

  IF v_survey_valid ->> 'survey_done' <> 'true' THEN
    RAISE EXCEPTION 'Assertion failed: Valid metadata was not correctly written';
  END IF;
END $$;


-- =========================================================================
-- TEST 2: Cascading Deletes
-- =========================================================================
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('20000000-0000-0000-0000-000000000001', 'Test Recipe', 'test-recipe', 1, true);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('20000000-0000-0000-0000-000000000001', 1.0, 'tsp', 'Test Ingredient', 1);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES ('20000000-0000-0000-0000-000000000001', 1, 'Test Step');

-- Perform Cascade Action
DELETE FROM public.recipes WHERE id = '20000000-0000-0000-0000-000000000001';

-- Assertions for Test 2
DO $$
DECLARE
  v_ing_count integer;
  v_step_count integer;
BEGIN
  SELECT count(*) INTO v_ing_count FROM public.recipe_ingredients WHERE recipe_id = '20000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_step_count FROM public.recipe_steps WHERE recipe_id = '20000000-0000-0000-0000-000000000001';

  IF v_ing_count <> 0 OR v_step_count <> 0 THEN
    RAISE EXCEPTION 'Assertion failed: ON DELETE CASCADE did not purge recipe sub-tables';
  END IF;
END $$;


-- =========================================================================
-- TEST 3: Ingredient Quantity Precision
-- =========================================================================
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('30000000-0000-0000-0000-000000000001', 'Precision Recipe', 'precision-recipe', 1, true);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('30000000-0000-0000-0000-000000000001', 1.25, 'cup', 'Precision Ing', 1);

-- Assertions for Test 3
DO $$
DECLARE
  v_quantity numeric(10,1);
BEGIN
  SELECT quantity INTO v_quantity FROM public.recipe_ingredients WHERE recipe_id = '30000000-0000-0000-0000-000000000001';

  -- numeric(10,1) should round 1.25 to 1.3
  IF v_quantity <> 1.3 THEN
    RAISE EXCEPTION 'Assertion failed: Numeric precision rounding did not match expected 1.3, got %', v_quantity;
  END IF;
END $$;


-- =========================================================================
-- TEST 4: Row Level Security (RLS) policies
-- =========================================================================

-- Insert test recipes: 1 published, 1 unpublished draft
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES 
  ('40000000-0000-0000-0000-000000000001', 'Published Recipe', 'pub-recipe', 1, true),
  ('40000000-0000-0000-0000-000000000002', 'Draft Recipe', 'draft-recipe', 1, false);

-- Insert ingredients for both
INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES 
  ('40000000-0000-0000-0000-000000000001', 2.0, 'pcs', 'Pub Ingredient', 1),
  ('40000000-0000-0000-0000-000000000002', 3.0, 'pcs', 'Draft Ingredient', 1);

-- Enforce RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 4.A: Standard Anonymous / Non-CMS-Editor reads
RESET ROLE;
SET test.auth_uid = '10000000-0000-0000-0000-000000000001';
SET request.jwt.claims = '{"role": "authenticated"}';
SET ROLE app_test_user;

DO $$
DECLARE
  v_rec_count integer;
  v_ing_count integer;
BEGIN
  SELECT count(*) INTO v_rec_count FROM public.recipes;
  SELECT count(*) INTO v_ing_count FROM public.recipe_ingredients;

  IF v_rec_count <> 1 THEN
    RAISE EXCEPTION 'Assertion failed: Public client should only read 1 published recipe, saw %', v_rec_count;
  END IF;

  IF v_ing_count <> 1 THEN
    RAISE EXCEPTION 'Assertion failed: Public client should only read 1 published recipe ingredient, saw %', v_ing_count;
  END IF;
END $$;

-- 4.B: CMS Editor reads (role = cms_editor)
RESET ROLE;
SET test.auth_uid = '10000000-0000-0000-0000-000000000001';
SET request.jwt.claims = '{"role": "cms_editor"}';
SET ROLE app_test_user;

DO $$
DECLARE
  v_rec_count integer;
  v_ing_count integer;
BEGIN
  SELECT count(*) INTO v_rec_count FROM public.recipes;
  SELECT count(*) INTO v_ing_count FROM public.recipe_ingredients;

  IF v_rec_count <> 2 THEN
    RAISE EXCEPTION 'Assertion failed: CMS Editor should read both draft and published recipes (expected 2), saw %', v_rec_count;
  END IF;

  IF v_ing_count <> 2 THEN
    RAISE EXCEPTION 'Assertion failed: CMS Editor should read both draft and published recipe ingredients (expected 2), saw %', v_ing_count;
  END IF;
END $$;

-- Clean Up
RESET ROLE;
DROP ROLE app_test_user;
ROLLBACK;
```
