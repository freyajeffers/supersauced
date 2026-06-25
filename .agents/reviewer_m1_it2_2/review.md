# Database Schema Review Report

## Review Summary

**Verdict**: **APPROVE**

The database schema definition in `docs/schema.sql` and the corresponding mock setup in `docs/local_mock_setup.sql` conform to all robustness, security, and functional requirements. Mocks are cleanly isolated from the production schema, Row Level Security (RLS) is correctly enabled and configured, cascading constraints are appropriately defined, decimal precision is accurate, and the automated user signup trigger handles edge cases of null or missing metadata gracefully.

---

## Findings

### [Minor] Finding 1: Lack of Mutation Policies on Recipes and Ingredients
- **What**: There are no `INSERT`, `UPDATE`, or `DELETE` RLS policies defined for `recipes`, `recipe_ingredients`, or `recipe_steps` in `docs/schema.sql`.
- **Where**: `docs/schema.sql` (Section 5, lines 115-169)
- **Why**: By default, enabling RLS without defining write policies blocks all write operations for non-privileged roles (like `anon` and `authenticated`). This means writes can only be performed by the database owner or the `service_role` (which bypasses RLS).
- **Suggestion**: This is safe and standard practice if mutations are strictly handled via administrative/service-role microservices or a backend portal. If client-side mutations (by editors) are planned in the future, explicit write policies must be added.

---

## Verified Claims

- **Auth Schema Mock Isolation** → verified via file inspections of `docs/schema.sql` and `docs/local_mock_setup.sql` → **PASS**
  - Production file `docs/schema.sql` contains no `CREATE SCHEMA auth` or role/function stubs.
  - Mock file `docs/local_mock_setup.sql` contains all necessary stubs (`auth.users`, `auth.uid()`, `auth.jwt()`, and default Supabase roles).
- **RLS Enablement** → verified via inspection of `docs/schema.sql` lines 119-122 → **PASS**
  - All four tables (`user_profiles`, `recipes`, `recipe_ingredients`, `recipe_steps`) have RLS explicitly enabled via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- **RLS Policy Correctness** → verified via execution of `docs/test_schema.sql` (Test 5 & 6) and query inspection → **PASS**
  - `user_profiles` restricts read/write to `auth.uid() = id`.
  - Recipes, ingredients, and steps are public-readable if `is_published = true`.
  - Users with `cms_editor` role (extracted from `auth.jwt() ->> 'role'`) can read unpublished/draft records.
- **Relational Cascades** → verified via execution of `docs/test_schema.sql` (Test 3) and DDL inspection → **PASS**
  - Foreign keys from `user_profiles` to `auth.users` and from ingredients/steps to `recipes` all specify `ON DELETE CASCADE`.
- **Decimal Precision for Ingredients Quantity** → verified via execution of `docs/test_schema.sql` (Test 4) and DDL inspection → **PASS**
  - `recipe_ingredients.quantity` is defined as `NUMERIC(10,1)`, and correctly rounds values (e.g. `1.25` is rounded to `1.3`).
- **GIN Indexes on Tag Arrays** → verified via execution of `docs/test_schema.sql` (Test 7) and DDL inspection → **PASS**
  - `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` are defined `USING GIN`.
- **Auth Signup Trigger Robustness** → verified via execution of `docs/test_schema.sql` (Test 2) and function inspection → **PASS**
  - `public.handle_new_user()` successfully defaults to `'{}'::jsonb` when `raw_user_meta_data` is NULL, has missing keys, or contains JSON null values.
- **Verification Script Execution** → verified via running `docs/verify_schema.sh` → **PASS**
  - Ran the containerized PostgreSQL schema test suite successfully, passing all 8 validation test blocks.

---

## Coverage Gaps

- **Write Operations Policies** — risk level: **LOW** — recommendation: **accept risk**
  - Read-only policies for recipes are fully validated. Write operations are restricted to admin/service-role contexts, which matches security best practices.

---

## Unverified Items

None. All items were successfully verified using the SQL test suite and manual verification.

---
---

## Challenge Summary

**Overall risk assessment**: **LOW**

The database schema design is secure, robust, and correctly uses PostgreSQL-native capabilities. The use of `SECURITY DEFINER` and search_path specification in `handle_new_user()` guards against search_path hijacking, and the deferrable unique constraint on `recipe_steps` simplifies step re-ordering.

---

## Challenges

### [Low] Challenge 1: `raw_user_meta_data` Format Anomalies
- **Assumption challenged**: That `NEW.raw_user_meta_data` will always be a JSONB object or NULL.
- **Attack scenario**: If external providers insert an invalid JSON type (e.g. a JSON array `[1, 2, 3]` or a scalar string `"hello"`) into `raw_user_meta_data`, executing the JSON path arrow operator `->` could theoretically cause issues.
- **Blast radius**: If the trigger throws an exception, user sign-up in Supabase Auth will fail.
- **Mitigation**: In PostgreSQL, referencing a non-existent key with `->` on a non-object JSONB (like an array or string) does not raise an exception; it simply returns `NULL`. The `COALESCE` handles this by defaulting to `'{}'::jsonb`. Thus, the current implementation is already fully protected.

### [Low] Challenge 2: Deferrable Constraint Performance Check
- **Assumption challenged**: The unique constraint on step numbers (`unique_recipe_step`) is deferred until transaction commit. Under high write volume or large batch inserts, deferred constraint validation might consume additional transaction memory.
- **Attack scenario**: A batch import of thousands of recipe steps inside a single transaction.
- **Blast radius**: Marginally higher memory utilization in PostgreSQL session memory during the transaction.
- **Mitigation**: Keep step-updates chunked by recipe, which is standard because steps are bounded per recipe (usually < 50 steps per recipe).

---

## Stress Test Results

- **JSON Null injection in user signup** → trigger processes successfully without raising exceptions → **PASS**
- **Missing onboarding keys in metadata** → trigger defaults to empty JSON object `{}` → **PASS**
- **Trigger security context** → trigger runs as `SECURITY DEFINER` with search path explicitly set to `public`, preventing injection via search_path manipulation → **PASS**
- **Temporarily duplicate step numbers during reorder transaction** → deferrable constraint deferred validation succeeds and only validates on commit → **PASS**

---

## Unchallenged Areas

None. All areas of the schema were analyzed and stress-tested.
