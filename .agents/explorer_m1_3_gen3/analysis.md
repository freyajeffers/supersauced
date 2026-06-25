# Database Schema Analysis & Redesign Plan

## Executive Summary
This analysis addresses the critical database schema issues identified in previous review iterations. We propose a robust, clean redesign plan to:
1. Prevent destructive overwrites of native Supabase auth schemas by separating local mocks.
2. Fix client-crashing JSON null propagation in the automated sign-up trigger.
3. Ensure automated, reproducible local verification using Docker and a strict assertion-based test suite.
4. Enhance the database usability by making recipe step re-ordering deferrable.

---

## 1. Separation of Mock Setup (Security & Integrity)
### The Problem
The current implementation of `docs/schema.sql` contains statements to create the `auth` schema, the `auth.users` table, and the `auth.uid()` function. 
In Supabase, the `auth` schema is system-managed. Executing `docs/schema.sql` on a production or staging environment would attempt to overwrite the native `auth.uid()` helper and `auth.users` table, which would immediately brick Row Level Security (RLS) policies and authentication validation across the entire database.

### The Fix
1. **Remove** all mock definitions (`CREATE SCHEMA IF NOT EXISTS auth;`, `CREATE TABLE IF NOT EXISTS auth.users (...)`, and `CREATE OR REPLACE FUNCTION auth.uid() ...`) from the primary migration file `docs/schema.sql`.
2. **Move** these mock definitions to a new dedicated file: `docs/local_mock_setup.sql`.
3. **Usage Flow**:
   - **Production/Staging**: Run only `docs/schema.sql`. The database already has the native `auth` schema and system functions pre-configured.
   - **Local Development / CI**: Run `docs/local_mock_setup.sql` first to stub the Supabase authentication dependencies, followed by `docs/schema.sql`.

---

## 2. Handling JSON Null in Trigger Function (Functional Correctness)
### The Problem
The trigger function `public.handle_new_user()` currently extracts onboarding and inventory preferences from `NEW.raw_user_meta_data` using `COALESCE`:
```sql
COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb)
```
If a user is signed up with an explicit JSON null value like `{"onboarding_survey": null}`, PostgreSQL's `->` operator extracts `'null'::jsonb` (which is a valid JSON value representing literal null, distinct from SQL `NULL`). 
As a result:
- `COALESCE` does not default it to `'{}'::jsonb`.
- The literal JSON `'null'::jsonb` is successfully inserted into the `onboarding_survey` column (satisfying the `NOT NULL` SQL constraint).
- The client application crashes when parsing the user profile, expecting a JSON object but receiving a literal `null`.

### The Fix
We introduce a robust translation using PostgreSQL's `NULLIF` combined with `COALESCE`:
```sql
COALESCE(NULLIF(NEW.raw_user_meta_data->'onboarding_survey', 'null'::jsonb), '{}'::jsonb)
```
- If the key is missing or metadata is SQL `NULL` -> returns SQL `NULL` -> coalesces to `'{}'::jsonb`.
- If the key contains JSON `null` (`'null'::jsonb`) -> `NULLIF` converts it to SQL `NULL` -> coalesces to `'{}'::jsonb`.
- If the key contains a valid JSON object -> `NULLIF` leaves it intact -> writes to column.

This single-line expression is extremely clean and eliminates PL/pgSQL verbosity while maintaining type safety.

---

## 3. Verification Script & Test Suite (Automation & Quality Gate)
To avoid fabricated verification logs and enforce strict validation, we define an automated testing setup:

### Script: `docs/verify_schema.sh`
A bash script that spins up a clean PostgreSQL 16 container, builds the schema, and executes tests.
Key features:
- **Zero-Dependency Host**: Uses docker to avoid requiring local `psql` installation.
- **Trap Cleanup**: Automatically stops and cleans up the Docker container on script termination or failure.
- **Strict Error Handling**: Passes `-v ON_ERROR_STOP=1` to `psql` so that any SQL error or failed test assertion immediately aborts the shell script with a non-zero exit code.

### Test Suite: `docs/test_schema.sql`
A suite of PL/pgSQL assertion tests that run inside the container. Since standard PostgreSQL lacks a built-in assertion framework, we construct assertions using `DO` blocks and `RAISE EXCEPTION`:
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE ...) THEN
    RAISE EXCEPTION 'Assertion failed: ...';
  END IF;
END;
$$;
```
This tests:
1. **Trigger Defaulting**: Verifies SQL `NULL` and JSON `null` inputs properly fall back to empty objects.
2. **Cascading Deletes**: Assures user deletion cascades to profiles, and recipe deletion cascades to ingredients and steps.
3. **RLS Policies**: Impersonates a non-superuser role (`authenticated_user`) and verifies that:
   - Users can read/write their own profile but are blocked from accessing other profiles.
   - Users/Anonymous queries can select published recipes but get 0 rows for unpublished draft recipes.
4. **GIN Indexes**: Queries `pg_indexes` to verify that `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` are active and utilize GIN.
5. **Deferrable Constraints**: Verifies that re-ordering recipe steps inside a transaction works correctly.

---

## 4. Deferrable Step Number Unique Constraint
To support smooth content editing in the CMS (e.g., swapping Step 1 and Step 2 in a transaction), the unique constraint `UNIQUE (recipe_id, step_number)` on `public.recipe_steps` must be declared as:
```sql
CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
```
This prevents temporary constraint violations from failing step re-ordering transactions mid-execution, deferring verification until the transaction commits.

---

## Proposed Artifacts Location & Structure
These proposed files are prepared in the Explorer's folder and ready for the Worker to copy to their targets:
1. **`proposed_schema.sql`** -> Target: `/home/freya/supersauced/docs/schema.sql`
2. **`proposed_local_mock_setup.sql`** -> Target: `/home/freya/supersauced/docs/local_mock_setup.sql`
3. **`proposed_test_schema.sql`** -> Target: `/home/freya/supersauced/docs/test_schema.sql`
4. **`proposed_verify_schema.sh`** -> Target: `/home/freya/supersauced/docs/verify_schema.sh`
