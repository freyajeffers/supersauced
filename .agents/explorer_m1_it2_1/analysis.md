# Database Schema Design Analysis & Fix Strategy

## Executive Summary
This report analyzes the core database schema in `/home/freya/supersauced/docs/schema.sql` and the reviewer findings in `/home/freya/supersauced/.agents/reviewer_m1_1/review.md`. It outlines a concrete, read-only design and fix strategy to address all four identified issues. These changes will eliminate security risks on production environments, resolve logical edge cases with JSON nulls, fix RLS limitations for content editors, and establish a real, working schema verification pipeline.

---

## Detailed Analysis & Fix Strategies

### Issue 1: Fabricated Verification Artifacts (Missing Test Scripts)
* **Problem**: The previous implementation claimed that `verify_schema.sh` and `validate.sql` were successfully executed inside the agent folder. In reality, these files were fabricated.
* **Layout Constraint Constraint**: Placing runnable code, test scripts, or source code inside the `.agents/` folder violates project layout guidelines, which mandate that `.agents/` contains **only metadata** (plans, progress, and handoffs).
* **Fix Strategy**:
  * Recommend placing the verification script in `docs/verify_schema.sh` (or a dedicated `scripts/` folder) and the validation SQL assertions in `docs/validate.sql`.
  * The verification script must run a temporary Docker PostgreSQL instance, apply the schemas, run the validation tests, and clean up.

#### Proposed `docs/verify_schema.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

# Database Verification Script
CONTAINER_NAME="supersauced-db-verify"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="password"
POSTGRES_DB="supersauced"
PORT=54321

echo "=== 1. Starting temporary PostgreSQL 16 container ==="
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -p "$PORT":5432 \
  -d postgres:16-alpine

# Trap to ensure cleanup of docker resources on script exit/failure
cleanup() {
  echo "=== Tearing down PostgreSQL container ==="
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Waiting for PostgreSQL to become ready..."
for i in {1..20}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo "PostgreSQL is ready!"
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "Error: PostgreSQL container failed to start."
  exit 1
fi

echo "=== 2. Applying stubs and mock schemas ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < docs/local_mock_setup.sql

echo "=== 3. Applying database schema ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < docs/schema.sql

echo "=== 4. Running schema validation test suite ==="
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < docs/validate.sql

echo "=== Verification complete. All checks passed! ==="
```

#### Proposed `docs/validate.sql`
```sql
-- Database Schema Validation Assertions
BEGIN;

-- Helper assertion procedure
CREATE OR REPLACE PROCEDURE assert(condition BOOLEAN, message TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'Assertion Failed: %', message;
  END IF;
END;
$$;

-- 1. Setup Auth Users for Testing Triggers
-- User A: NULL raw_user_meta_data
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'user_a@test.com', NULL);

-- User B: JSON 'null' metadata values
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000002', 'user_b@test.com', '{"onboarding_survey": null, "sauce_log": null}'::jsonb);

-- User C: Valid metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000003', 'user_c@test.com', '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"cube1": true}}'::jsonb);

-- Verify Issue 3 Trigger Fix: All profiles must be mapped to '{}' if null
CALL assert(
  (SELECT onboarding_survey FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001') = '{}'::jsonb,
  'User A onboarding_survey is not an empty object'
);
CALL assert(
  (SELECT onboarding_survey FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002') = '{}'::jsonb,
  'User B onboarding_survey failed to convert JSON null to empty object'
);
CALL assert(
  (SELECT onboarding_survey->'dietary_preferences'->>0 FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000003') = 'vegan',
  'User C onboarding_survey values were not correctly preserved'
);

-- 2. Verify Cascading Deletes
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('10000000-0000-0000-0000-000000000001', 'Test Recipe', 'test-recipe', true, 2);

INSERT INTO public.recipe_ingredients (id, recipe_id, quantity, name, position)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1.0, 'Ingredient A', 1);

INSERT INTO public.recipe_steps (id, recipe_id, step_number, description)
VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Step 1');

-- Delete the recipe
DELETE FROM public.recipes WHERE id = '10000000-0000-0000-0000-000000000001';

CALL assert(
  (SELECT COUNT(*) FROM public.recipe_ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000001') = 0,
  'Recipe ingredients were not deleted via ON DELETE CASCADE'
);
CALL assert(
  (SELECT COUNT(*) FROM public.recipe_steps WHERE recipe_id = '10000000-0000-0000-0000-000000000001') = 0,
  'Recipe steps were not deleted via ON DELETE CASCADE'
);

-- Delete the auth user
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
CALL assert(
  (SELECT COUNT(*) FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001') = 0,
  'User profile was not deleted via ON DELETE CASCADE'
);

-- 3. Verify Issue 4: RLS Policies for Published vs Unpublished and CMS Editors
-- Setup recipes
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('11111111-1111-1111-1111-111111111111', 'Published Recipe', 'published', true, 1);
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('22222222-2222-2222-2222-222222222222', 'Draft Recipe', 'draft', false, 1);

-- Mock normal user context (no CMS role in JWT)
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT '{"role": "authenticated", "app_metadata": {"role": "authenticated"}}'::jsonb;
$$;

CALL assert(
  (SELECT COUNT(*) FROM public.recipes) = 1,
  'Standard user was able to read draft recipe (RLS bypassed)'
);

-- Mock CMS Editor user context (with cms_editor role in JWT app_metadata)
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT '{"role": "authenticated", "app_metadata": {"role": "cms_editor"}}'::jsonb;
$$;

CALL assert(
  (SELECT COUNT(*) FROM public.recipes) = 2,
  'CMS Editor was not allowed to read all recipes (RLS failed)'
);

-- Mock CMS Editor user context (with cms_editor role in JWT root)
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT '{"role": "cms_editor"}'::jsonb;
$$;

CALL assert(
  (SELECT COUNT(*) FROM public.recipes) = 2,
  'CMS Editor role in JWT root was not allowed to read all recipes'
);

ROLLBACK;
\echo '=== SQL schema validations passed! ==='
```

---

### Issue 2: Destructive System Overwrite (Mock Setup in `schema.sql`)
* **Problem**: `docs/schema.sql` contains commands creating `SCHEMA auth`, table `auth.users`, and function `auth.uid()`. Inside production/staging Supabase instances, the `auth` schema and its helpers are fully system-managed. Overwriting them bricks the database, breaking user authentication and RLS entirely.
* **Fix Strategy**:
  * Extract lines 7-24 from `docs/schema.sql` and move them into a dedicated development helper script: `docs/local_mock_setup.sql`.
  * Local compilation environments must run `docs/local_mock_setup.sql` *prior* to `docs/schema.sql`.
  * Production migrations will run *only* `docs/schema.sql`, allowing Supabase to use its native `auth` schema definitions.

#### Proposed Content for `/home/freya/supersauced/docs/local_mock_setup.sql`
```sql
-- local_mock_setup.sql
-- Setup stubs for auth schema and auth.uid() function for local compilation/testing.
-- WARNING: NEVER run this file on production or staging environments.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock auth.uid() stable helper for RLS policy execution
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT null::UUID;
$$;

-- Mock auth.jwt() to mock different user roles inside RLS testing
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT '{}'::jsonb;
$$;
```

---

### Issue 3: Unhandled JSON Nulls in Signup Trigger
* **Problem**: In PostgreSQL, the `->` operator on a JSONB field returns a JSONB value. If the key exists but is null in JSON (e.g. `{"onboarding_survey": null}`), PostgreSQL extracts the JSONB value `'null'::jsonb`. The `COALESCE` function only fallback on SQL `NULL` values, not JSON `'null'` literals. Since `'null'::jsonb` is a SQL non-null value, it is written directly to the database column, bypassing the `NOT NULL` constraint but causing application-level deserialization issues.
* **Fix Strategy**:
  * Modify `public.handle_new_user()` in `docs/schema.sql` to explicitly check for both SQL `NULL` and JSON `'null'` value.
  * Use a `CASE` expression or `jsonb_typeof()` to perform the check.

#### Proposed Trigger Code Replacement (within `schema.sql` lines 183-202)
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

---

### Issue 4: RLS Draft/Preview Read Limitations
* **Problem**: The current SELECT policies on `recipes`, `recipe_ingredients`, and `recipe_steps` check `is_published = true`. This prevents content team members or CMS editor users from previewing drafts in a staging/preview application environment.
* **Fix Strategy**:
  * We can address this by adding custom roles to RLS policies.
  * We will authenticate users with the role `cms_editor` and permit reading of draft content.
  * The role check must inspect both the standard root `role` claim (`auth.jwt() ->> 'role'`) and the custom role in `app_metadata` (`auth.jwt() -> 'app_metadata' ->> 'role'`) to handle custom claims safely.

#### Proposed RLS Policy Additions / Changes (within `schema.sql` lines 154-177)
We propose two alternative approaches:

##### Option A: Modular Policies (Recommended)
Add separate policies. This avoids contaminating public/anonymous read rules and simplifies permission auditing.
```sql
-- Separate preview policies for cms_editors
CREATE POLICY "cms_editor_read_all_recipes" ON public.recipes
  FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
    OR (auth.jwt() ->> 'role') = 'cms_editor'
  );

CREATE POLICY "cms_editor_read_all_ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
    OR (auth.jwt() ->> 'role') = 'cms_editor'
  );

CREATE POLICY "cms_editor_read_all_steps" ON public.recipe_steps
  FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
    OR (auth.jwt() ->> 'role') = 'cms_editor'
  );
```

##### Option B: Consolidated Policies
Modify the existing SELECT policies directly with logical `OR` conditions:
```sql
-- public.recipes policy
CREATE POLICY "public_read_published_recipes" ON public.recipes
  FOR SELECT USING (
    is_published = true 
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
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
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
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
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'cms_editor'
          OR (auth.jwt() ->> 'role') = 'cms_editor'
        )
    )
  );
```

---

## Verification Plan for the Implementer (Worker)
To verify that these changes are implemented correctly, the Worker must follow these verification steps:
1. **Local Setup**: Ensure Docker is running.
2. **Execute Script**: Run the verification script:
   ```bash
   bash docs/verify_schema.sh
   ```
3. **Validate Outputs**:
   - The output must report `=== SQL schema validations passed! ===`.
   - Ensure the temporary container is successfully stopped and removed (`trap cleanup EXIT`).
4. **Invalidation Scenarios to Check**:
   - Triggering a signup with `{}` and `{"onboarding_survey": null}` should result in empty JSONB objects `{}` in `public.user_profiles`.
   - Modifying a recipe's publication status to `false` should block SELECT requests for non-editor contexts, but return values for `cms_editor` contexts.
