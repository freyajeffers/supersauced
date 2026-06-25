# Database Schema Review Report

## Review Summary

**Verdict**: **APPROVE**

The database schema (`docs/schema.sql`) and local development mock setup (`docs/local_mock_setup.sql`) have been reviewed for correctness, robustness, and conformance to the project guidelines. The verification script (`docs/verify_schema.sh`) was executed successfully, and all functional test cases passed.

---

## Verified Claims

- **Auth Schema Isolation** → verified via visual inspection of `docs/schema.sql` and `docs/local_mock_setup.sql` → **PASS**
  - Mocks/stubs of `auth`, `auth.users`, `auth.uid()`, and `auth.jwt()` are completely absent from the production `schema.sql` and isolated in `local_mock_setup.sql`.
- **RLS Enablement** → verified via checking RLS statements in `docs/schema.sql` → **PASS**
  - Row Level Security (RLS) is explicitly enabled on all 4 tables: `user_profiles`, `recipes`, `recipe_ingredients`, and `recipe_steps`.
- **RLS Policies Correctness** → verified via executing `docs/test_schema.sql` (Test 5 and Test 6) and inspection → **PASS**
  - `user_profiles` access is strictly limited to the owner (`auth.uid() = id`).
  - Recipes, ingredients, and steps are public-readable if `is_published = true`.
  - CMS editors (with `role = 'cms_editor'` in JWT) are granted policies to read draft/unpublished recipes, ingredients, and steps.
- **Relational Cascades** → verified via inspecting constraint definitions and `test_schema.sql` (Test 3) → **PASS**
  - `ON DELETE CASCADE` is properly applied to foreign keys on `user_profiles.id`, `recipe_ingredients.recipe_id`, and `recipe_steps.recipe_id`.
- **Decimal Precision for Quantity** → verified via checking column type and `test_schema.sql` (Test 4) → **PASS**
  - `recipe_ingredients.quantity` uses `NUMERIC(10,1)` type which rounds/scales correctly.
- **GIN Indexes on Tag Arrays** → verified via checking index definition and `test_schema.sql` (Test 7) → **PASS**
  - GIN indexes (`idx_recipes_cube_tags` and `idx_recipes_dietary_tags`) are successfully created on array columns.
- **Trigger Robustness** → verified via testing various metadata inputs in `test_schema.sql` (Test 2) → **PASS**
  - `public.handle_new_user()` uses `NULLIF` and `COALESCE` to robustly handle JSON nulls (`'null'::jsonb`), missing metadata keys, and entirely NULL metadata.
- **Verification Script Success** → verified via running `bash docs/verify_schema.sh` → **PASS**
  - The script spins up a PostgreSQL container, loads mocks/schemas, executes the test suite, and completes successfully.

---

## Findings

### [Minor] Finding 1: Unused `validate.sql` File

- **What**: There is an extra file `docs/validate.sql` in the docs directory which appears to be a replica or older version of `docs/test_schema.sql` (with some differences in adversarial tests).
- **Where**: `docs/validate.sql`
- **Why**: It is not used or executed by `docs/verify_schema.sh`, which instead executes `docs/test_schema.sql`.
- **Suggestion**: Consider removing `docs/validate.sql` to avoid developer confusion or documentation drift, or merging any useful adversarial test cases into `docs/test_schema.sql`.

---

## Coverage Gaps

- **Write Policies for Recipes & Ingredients** — risk level: **LOW** — recommendation: **accept risk**
  - There are currently no RLS policies defined in `schema.sql` allowing write operations (INSERT, UPDATE, DELETE) on recipes, ingredients, or steps for roles other than the `service_role` (which bypasses RLS). This is secure by default (implicit deny), and should be revisited when editor backend APIs or frontend-facing editor flows are implemented.

---

## Unverified Items

None. All elements of the database schema and its verification have been successfully tested.

---

# Adversarial Challenge Report

**Overall risk assessment**: **LOW**

### [Low] Challenge 1: Trigger Behavior under Non-Object Metadata

- **Assumption challenged**: The trigger function `handle_new_user()` assumes `NEW.raw_user_meta_data` is a JSON object.
- **Attack scenario**: A user registers with raw metadata that is a JSON array or a JSON scalar (e.g. `"[1, 2]"` or `"\"hello\""`).
- **Blast radius**: If the `->` operator threw an exception on non-object JSON values, user signup would fail entirely.
- **Mitigation**: Verified via independent SQL tests that PostgreSQL's `->` operator on non-object JSONB values returns SQL NULL rather than raising an exception. The trigger's `COALESCE` handles this by falling back to `'{}'::jsonb` cleanly.

### [Low] Challenge 2: Deferrable Constraint Swapping

- **Assumption challenged**: Swapping step numbers (e.g. Step 1 <-> Step 2) is a common editor requirement and will work within a single transaction without causing unique constraint violations.
- **Attack scenario**: Swapping steps by executing individual UPDATE statements.
- **Blast radius**: A standard UNIQUE constraint would fail mid-transaction on the first UPDATE because it temporarily duplicates a step number.
- **Mitigation**: The schema specifies `CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED`. This defers uniqueness checking until `COMMIT`. This has been successfully tested in `test_schema.sql` (Test 8) and behaves correctly.
