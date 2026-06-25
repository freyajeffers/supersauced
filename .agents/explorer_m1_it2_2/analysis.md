# Database Schema Analysis & Proposed Fix Strategy

This report contains the analysis and proposed design/fix strategies for the identified database schema issues in the Super Sauced MVP project.

---

## 1. Issue 1: Fabricated Verification Artifacts (Verification Plan)

### Analysis
The previous worker agent reported that a verification script `verify_schema.sh` and test suite `validate.sql` were executed successfully, but these files were never created or committed to the workspace. This left the schema design unverified. 

### Proposed Fix Strategy
A comprehensive verification workflow must be implemented by the subsequent Worker agent. It consists of two key artifacts:
1. **`verify_schema.sh`**: A shell script that acts as the test runner. It sets up a clean test database, applies the mock setup, compiles the schema, runs the assertion script, and handles teardown.
2. **`validate.sql`**: A transaction-wrapped PostgreSQL SQL file that contains integration tests and asserts system constraints, RLS policies, and triggers.

The following complete, ready-to-run file contents should be implemented in the workspace:

#### Proposed `docs/verify_schema.sh`
```bash
#!/usr/bin/env bash
# =========================================================================
# Database Schema Verification Runner
# =========================================================================
set -euo pipefail

# Configurable database connection string
# Defaults to standard local PostgreSQL developer settings
DB_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"

echo "=== Starting Super Sauced Schema Verification ==="

# 1. Wait for database readiness
echo "Checking connection to database..."
until psql "$DB_URL" -c '\q' 2>/dev/null; do
  echo "Waiting for database to accept connections..."
  sleep 1
done

# 2. Reset database environment to ensure a clean test state
echo "Cleaning test database schema..."
psql "$DB_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
psql "$DB_URL" -c "DROP SCHEMA IF EXISTS auth CASCADE;"

# 3. Apply local dev mock setup
echo "Applying local dev mock setup (docs/local_mock_setup.sql)..."
psql "$DB_URL" -f docs/local_mock_setup.sql

# 4. Compile the schema
echo "Applying schema (docs/schema.sql)..."
psql "$DB_URL" -f docs/schema.sql

# 5. Run functional tests
echo "Executing test suite (docs/validate.sql)..."
if psql "$DB_URL" -f docs/validate.sql; then
  echo "=== Verification SUCCESS: All tests passed! ==="
  exit 0
else
  echo "=== Verification FAILED: Test suite encountered errors. ==="
  exit 1
fi
```

#### Proposed `docs/validate.sql`
```sql
-- =========================================================================
-- Integration Test Suite for Super Sauced Database Schema
-- Run in a transaction and roll back at the end to keep the DB clean.
-- =========================================================================
BEGIN;

-- -------------------------------------------------------------------------
-- Test Data Setup
-- -------------------------------------------------------------------------
echo 'Setting up test data...';

-- Insert test users with different metadata states into auth.users
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
  ('d0000000-0000-0000-0000-000000000001', 'user1@example.com', '{"onboarding_survey": {"question1": "yes"}, "sauce_log": {"entry1": "sweet"}}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', 'user2@example.com', NULL),
  ('d0000000-0000-0000-0000-000000000003', 'user3@example.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);

-- Insert test recipes (one published, one draft)
INSERT INTO public.recipes (id, title, slug, is_published)
VALUES 
  ('r0000000-0000-0000-0000-000000000001', 'Published Recipe', 'published-recipe', true),
  ('r0000000-0000-0000-0000-000000000002', 'Draft Recipe', 'draft-recipe', false);

-- Insert ingredients linked to the recipes
INSERT INTO public.recipe_ingredients (id, recipe_id, name, quantity, position)
VALUES 
  ('i0000000-0000-0000-0000-000000000001', 'r0000000-0000-0000-0000-000000000001', 'Published Ingredient', 1.5, 1),
  ('i0000000-0000-0000-0000-000000000002', 'r0000000-0000-0000-0000-000000000002', 'Draft Ingredient', 2.0, 1);

-- Insert steps linked to the recipes
INSERT INTO public.recipe_steps (id, recipe_id, step_number, description)
VALUES 
  ('s0000000-0000-0000-0000-000000000001', 'r0000000-0000-0000-0000-000000000001', 1, 'Step 1'),
  ('s0000000-0000-0000-0000-000000000002', 'r0000000-0000-0000-0000-000000000002', 1, 'Step 1');

-- -------------------------------------------------------------------------
-- Test Case 1: Signup Trigger & JSON Null Handling (Issue 3)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_survey jsonb;
  v_log jsonb;
BEGIN
  -- Test 1a: Standard populated metadata
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = 'd0000000-0000-0000-0000-000000000001';
  IF v_survey ->> 'question1' != 'yes' OR v_log ->> 'entry1' != 'sweet' THEN
    RAISE EXCEPTION 'Test 1a Failed: Standard metadata not mapped correctly';
  END IF;

  -- Test 1b: NULL metadata mapping to '{}'
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = 'd0000000-0000-0000-0000-000000000002';
  IF v_survey != '{}'::jsonb OR v_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1b Failed: NULL metadata did not fall back to empty objects';
  END IF;

  -- Test 1c: JSON null mapping to '{}' (verifying fix)
  SELECT onboarding_survey, sauce_log INTO v_survey, v_log
  FROM public.user_profiles WHERE id = 'd0000000-0000-0000-0000-000000000003';
  IF v_survey IS NULL OR v_survey = 'null'::jsonb OR v_survey != '{}'::jsonb OR
     v_log IS NULL OR v_log = 'null'::jsonb OR v_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Test 1c Failed: JSON null values was not mapped to empty objects. survey: %, log: %', v_survey, v_log;
  END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- Test Case 2: RLS Policies for Anonymous/Standard Users (Issue 4)
-- -------------------------------------------------------------------------
-- Enable RLS for the test session
SET ROW SECURITY = ON;

-- Simulate anonymous user
SET LOCAL request.jwt.claims = '{"role": "anon"}';

DO $$
DECLARE
  v_recipe_count integer;
  v_ingredient_count integer;
  v_step_count integer;
BEGIN
  -- Should only see published entries
  SELECT count(*) INTO v_recipe_count FROM public.recipes;
  SELECT count(*) INTO v_ingredient_count FROM public.recipe_ingredients;
  SELECT count(*) INTO v_step_count FROM public.recipe_steps;

  IF v_recipe_count != 1 OR v_ingredient_count != 1 OR v_step_count != 1 THEN
    RAISE EXCEPTION 'Test 2 (Anonymous) Failed: Saw % recipes, % ingredients, % steps. Expected 1 of each.',
      v_recipe_count, v_ingredient_count, v_step_count;
  END IF;
END;
$$;

-- Simulate regular authenticated user (not cms_editor)
SET LOCAL request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_recipe_count integer;
  v_ingredient_count integer;
  v_step_count integer;
BEGIN
  -- Should only see published entries
  SELECT count(*) INTO v_recipe_count FROM public.recipes;
  SELECT count(*) INTO v_ingredient_count FROM public.recipe_ingredients;
  SELECT count(*) INTO v_step_count FROM public.recipe_steps;

  IF v_recipe_count != 1 OR v_ingredient_count != 1 OR v_step_count != 1 THEN
    RAISE EXCEPTION 'Test 2 (Regular User) Failed: Saw % recipes, % ingredients, % steps. Expected 1 of each.',
      v_recipe_count, v_ingredient_count, v_step_count;
  END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- Test Case 3: RLS Policies for CMS Editors (Issue 4)
-- -------------------------------------------------------------------------
-- Simulate CMS Editor user (role 'cms_editor')
SET LOCAL request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "cms_editor"}';

DO $$
DECLARE
  v_recipe_count integer;
  v_ingredient_count integer;
  v_step_count integer;
BEGIN
  -- Should see ALL entries (both published and draft/unpublished)
  SELECT count(*) INTO v_recipe_count FROM public.recipes;
  SELECT count(*) INTO v_ingredient_count FROM public.recipe_ingredients;
  SELECT count(*) INTO v_step_count FROM public.recipe_steps;

  IF v_recipe_count != 2 OR v_ingredient_count != 2 OR v_step_count != 2 THEN
    RAISE EXCEPTION 'Test 3 (CMS Editor) Failed: Saw % recipes, % ingredients, % steps. Expected 2 of each.',
      v_recipe_count, v_ingredient_count, v_step_count;
  END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- Test Case 4: Relational Integrity (Cascading Deletes)
-- -------------------------------------------------------------------------
-- Turn row security off to perform administrative delete
SET ROW SECURITY = OFF;

DELETE FROM public.recipes WHERE id = 'r0000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_ingredient_count integer;
  v_step_count integer;
BEGIN
  -- Verification that deleting a recipe cascaded to ingredients and steps
  SELECT count(*) INTO v_ingredient_count FROM public.recipe_ingredients WHERE recipe_id = 'r0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_step_count FROM public.recipe_steps WHERE recipe_id = 'r0000000-0000-0000-0000-000000000001';

  IF v_ingredient_count != 0 OR v_step_count != 0 THEN
    RAISE EXCEPTION 'Test 4 (Cascading Delete) Failed: Associated ingredients (%) or steps (%) were not deleted.',
      v_ingredient_count, v_step_count;
  END IF;
END;
$$;

-- Rollback the transaction to keep database in original clean state
ROLLBACK;
```

---

## 2. Issue 2: Mock Setup inside `schema.sql`

### Analysis
Currently, `/home/freya/supersauced/docs/schema.sql` contains stubs for the `auth` schema, the `auth.users` table, and the `auth.uid()` function (lines 4-25).
- **Risk**: In a real Supabase instance, these are system-managed entities. Executing `schema.sql` directly on a staging or production Supabase database will overwrite the system schema, causing RLS and authentication validations to fail completely and "bricking" the database.
- **Resolution**: Move all local mocking logic to `docs/local_mock_setup.sql`, leaving `docs/schema.sql` clean, production-safe, and compatible with Supabase migrations.

### Proposed Fix Strategy

#### Step A: Create `docs/local_mock_setup.sql`
Create a new file `docs/local_mock_setup.sql` containing the local dev stubs. We will also add a stub for `auth.jwt()`. We mock `auth.jwt()` and `auth.uid()` to read from a GUC (Grand Unified Configuration) variable `request.jwt.claims` so we can simulate active user sessions and roles (like `cms_editor`) during testing.

```sql
-- =========================================================================
-- Local Development Mock Setup (Stubs for System-Managed Supabase Schema)
-- WARNING: NEVER run this file on production or staging Supabase databases!
-- =========================================================================

-- Create mock auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Create mock auth.users table matching the minimal structure needed
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.jwt() helper to read from session GUC variable request.jwt.claims
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

-- Mock auth.uid() helper to read 'sub' claim from the session JWT claims GUC
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub')::uuid;
$$;
```

#### Step B: Clean up `docs/schema.sql`
Remove Section 1 (`1. MOCK SETUP FOR AUTH SCHEMA & AUTH.USERS TABLE`) entirely from `docs/schema.sql` (lines 4-25).

**Lines to remove:**
```sql
-- =========================================================================
-- 1. MOCK SETUP FOR AUTH SCHEMA & AUTH.USERS TABLE
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock the auth.uid() function for RLS policy compilation on a fresh instance
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT null::UUID;
$$;
```

---

## 3. Issue 3: Unhandled JSON Nulls in Trigger `public.handle_new_user()`

### Analysis
The current `handle_new_user()` function extracts the onboarding profile metadata using:
`COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb)`
`COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)`

- **The Bug**: In PostgreSQL, the `->` operator on a JSONB value extracts a JSON value. If the key exists but contains the JSON value `null` (e.g. `'{"onboarding_survey": null}'::jsonb`), it returns `'null'::jsonb`.
- **Why COALESCE fails**: The SQL `COALESCE` function only catches SQL `NULL` values. It does *not* treat JSON `'null'` as SQL `NULL`. Consequently, `'null'::jsonb` is successfully inserted into the `onboarding_survey` and `sauce_log` columns.
- **Impact**: The columns have a `NOT NULL` constraint, which is satisfied by `'null'::jsonb` (since it is a valid, non-SQL-NULL JSONB value). However, client-side deserializers (expecting a JSON object `{}`) will fail at runtime when they parse the literal null.

### Proposed Fix Strategy
Modify the extraction logic in the trigger function to use a conditional `CASE` block that explicitly checks if the key is missing (returns SQL `NULL`) OR if the JSON value is equal to `'null'::jsonb`.

#### Before
```sql
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
```

#### After
```sql
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
```

---

## 4. Issue 4: RLS Draft/Preview Read Limitations

### Analysis
The current RLS policies for `recipes`, `recipe_ingredients`, and `recipe_steps` restrict SELECT reads exclusively to `is_published = true`.
- **Problem**: This prevents content editors (utilizing the Directus CMS) or QA engineers on a preview site from viewing/testing draft content using their own authenticated credentials.
- **Resolution**: Expand the SELECT policy to allow reads if the recipe is published OR if the logged-in user possesses the `cms_editor` role.

### Proposed Fix Strategy
Update the `SELECT` policy definition for each of the three tables to evaluate the user's role from their JWT claims using `auth.jwt() ->> 'role' = 'cms_editor'`.

#### 1. Table: `public.recipes`
- **Before**:
  ```sql
  CREATE POLICY "public_read_published_recipes" ON public.recipes
    FOR SELECT USING (is_published = true);
  ```
- **After**:
  ```sql
  CREATE POLICY "public_read_recipes" ON public.recipes
    FOR SELECT USING (
      is_published = true
      OR (auth.jwt() ->> 'role' = 'cms_editor')
    );
  ```

#### 2. Table: `public.recipe_ingredients`
- **Before**:
  ```sql
  CREATE POLICY "public_read_published_recipe_ingredients" ON public.recipe_ingredients
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_id
          AND public.recipes.is_published = true
      )
    );
  ```
- **After**:
  ```sql
  CREATE POLICY "public_read_recipe_ingredients" ON public.recipe_ingredients
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_id
          AND (
            public.recipes.is_published = true
            OR (auth.jwt() ->> 'role' = 'cms_editor')
          )
      )
    );
  ```

#### 3. Table: `public.recipe_steps`
- **Before**:
  ```sql
  CREATE POLICY "public_read_published_recipe_steps" ON public.recipe_steps
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_id
          AND public.recipes.is_published = true
      )
    );
  ```
- **After**:
  ```sql
  CREATE POLICY "public_read_recipe_steps" ON public.recipe_steps
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_id
          AND (
            public.recipes.is_published = true
            OR (auth.jwt() ->> 'role' = 'cms_editor')
          )
      )
    );
  ```
