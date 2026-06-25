# Challenger Report: Database Schema & Access Control Verification

**Date**: 2026-06-23  
**Auditor**: Empirical Challenger (critic/specialist)  
**Status**: COMPLETE  
**Final Verdict**: **PASS WITH RECOMMENDATIONS** (The database schema behaves correctly and securely, but a critical syntax error in the test suite was resolved, and minor access control/logic improvements are recommended.)

---

## 1. Executive Summary

This report presents the adversarial review and verification of the PostgreSQL database schema (`docs/schema.sql`) for Super Sauced. Verification was conducted using the local Docker-based test harness (`docs/verify_schema.sh`), targeting a clean PostgreSQL 16 container instance. 

An initial execution revealed a **compiler/syntax error in the functional test suite** (`docs/test_schema.sql`), which has been corrected. Following this correction, both the standard test suite and an additional, custom adversarial validation suite (`docs/adversarial_tests.sql`) were executed successfully. All table constraints, row-level security (RLS) policies, and deferrable unique constraints are functional and correctly enforce the business rules under adversarial conditions.

---

## 2. Adversarial Review & Findings

### Finding 1: Unrecognized Exception Condition in Test Suite (Critical Bug in Tests)
- **Location**: `docs/test_schema.sql` (Line 423)
- **Observation**: The test suite failed to execute with the following error:
  ```
  ERROR:  unrecognized exception condition "new_row_violates_row_level_security"
  CONTEXT:  compilation of PL/pgSQL function "inline_code_block" near line 39
  ```
- **Explanation**: PL/pgSQL does not have a built-in exception condition named `new_row_violates_row_level_security`. When a Row-Level Security policy's `WITH CHECK` constraint fails in PostgreSQL, it raises SQLSTATE `42501` (`insufficient_privilege`). 
- **Remediation**: The line was modified from:
  ```sql
  EXCEPTION WHEN new_row_violates_row_level_security THEN
  ```
  to:
  ```sql
  EXCEPTION WHEN insufficient_privilege THEN
  ```
  This allowed the test suite to compile and run successfully.

### Finding 2: Missing Write Policies on Recipes, Ingredients, and Steps
- **Location**: `docs/schema.sql` (Sections 5)
- **Observation**: RLS is enabled on `recipes`, `recipe_ingredients`, and `recipe_steps`, but only `SELECT` (read) policies are defined:
  - `public_read_published_recipes` and `cms_editor_read_all_recipes` (on `recipes`)
  - `public_read_published_recipe_ingredients` and `cms_editor_read_all_recipe_ingredients` (on `recipe_ingredients`)
  - `public_read_published_recipe_steps` and `cms_editor_read_all_recipe_steps` (on `recipe_steps`)
- **Impact**: Under PostgreSQL RLS rules, since no `INSERT`, `UPDATE`, or `DELETE` policies are defined, all write operations on these tables are completely denied for all non-superuser roles (e.g., standard users and `cms_editor`). If editing is meant to be done by the client using the `cms_editor` role, these writes will fail with an RLS violation.
- **Recommendation**: If `cms_editor` needs to manage content directly, policies must be added to grant them `INSERT`, `UPDATE`, and `DELETE` access. If all writes are handled via a backend using the `service_role` (which bypasses RLS), the current configuration is secure.

### Finding 3: Over-permissive Delete/Insert on User Profiles
- **Location**: `docs/schema.sql` (Lines 128-136)
- **Observation**: The table `public.user_profiles` contains policies:
  ```sql
  CREATE POLICY "owner_insert_user_profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

  CREATE POLICY "owner_delete_user_profile" ON public.user_profiles
    FOR DELETE USING (auth.uid() = id);
  ```
- **Impact**: 
  - **Delete**: A user can manually delete their own profile record in `public.user_profiles` via client API, while leaving their authentication record in `auth.users` intact. This puts their account in an inconsistent/broken state where they are logged in but have no profile record.
  - **Insert**: User profiles are automatically created on signup via the `handle_new_user()` trigger. Allowing users to manually insert a profile directly may bypass the default initialization logic or conflict with the trigger.
- **Recommendation**: Remove the `owner_insert_user_profile` and `owner_delete_user_profile` policies. Profile insertion and deletion should be handled exclusively by the database triggers (which use `SECURITY DEFINER` and thus bypass RLS).

---

## 3. Verification Details & Test Coverage

The adversarial suite `docs/adversarial_tests.sql` was written and run inside the container to test the following:

### A. Access Control (RLS) on User Profiles
- **Objective**: Ensure User A cannot read, update, delete, or insert User B's profile.
- **Test Scenarios**:
  - `SELECT` on User B's profile as User A: Returned 0 rows (**PASS**).
  - `UPDATE` on User B's profile as User A: Affected 0 rows (**PASS**).
  - `DELETE` on User B's profile as User A: Affected 0 rows (**PASS**).
  - `INSERT` on User B's profile as User A: Threw `insufficient_privilege` (**PASS**).

### B. Access Control (RLS) on Draft Recipes, Ingredients, and Steps
- **Objective**: Ensure only the `cms_editor` role can read draft recipe data.
- **Test Scenarios**:
  - As `anon` role: Cannot see draft recipe/ingredients/steps (**PASS**).
  - As `authenticated` role with claims `{"role": "user"}`: Cannot see draft recipe/ingredients/steps (**PASS**).
  - As `authenticated` role with claims `{"role": "editor"}` (non-cms): Cannot see draft recipe/ingredients/steps (**PASS**).
  - As `authenticated` role with claims `{"role": "cms_editor"}`: CAN see draft recipe/ingredients/steps (**PASS**).
  - Write attempts (INSERT) by `anon`, `user`, and `cms_editor`: Successfully blocked by RLS default deny (**PASS**).

### C. Database Integrity & Constraints
- **Objective**: Verify that table constraints block invalid inputs.
- **Test Scenarios**:
  - `servings_default` set to `0` or `-3`: Blocked by `check_violation` (**PASS**).
  - `cook_time_minutes` set to `-1`: Blocked by `check_violation` (**PASS**).
  - `difficulty` set to `0` or `4` or `NULL`: Blocked by `check_violation` / `not_null_violation` (**PASS**).
  - `calories_per_serving` / `protein_g` / `fat_g` / `carbs_g` set to `-1`: Blocked by `check_violation` (**PASS**).
  - `recipe_ingredients.quantity` set to `-0.5`: Blocked by `check_violation` (**PASS**).
  - `recipe_ingredients.position` set to `-1`: Blocked by `check_violation` (**PASS**).
  - `recipe_steps.step_number` set to `0` or `-1`: Blocked by `check_violation` (**PASS**).
  - `recipe_steps.timer_seconds` set to `-10`: Blocked by `check_violation` (**PASS**).
  - Required fields set to `NULL` (e.g. recipe title, slug, step description): Blocked by `not_null_violation` (**PASS**).
  - Non-existent foreign key references: Blocked by `foreign_key_violation` (**PASS**).
  - Deleting a recipe deletes its ingredients/steps: Verified cascade deletion (**PASS**).

### D. Deferrable Unique Constraints
- **Objective**: Verify that recipe steps can have their positions swapped without violating the unique constraint immediately.
- **Test Scenarios**:
  - Swapping step numbers (e.g., Step 1 -> Step 2, Step 2 -> Step 1) inside a transaction: Allowed by deferring the constraint (**PASS**).
  - Causing duplicate step numbers and forcing checking immediately (`SET CONSTRAINTS ALL IMMEDIATE`): Correctly raised `unique_violation` (**PASS**).

---

## 4. How to Reproduce

Run the main verification script:
```bash
./docs/verify_schema.sh
```
This script runs the local mock setup, imports the schema, runs the functional tests (which now include our bug fix), and runs the adversarial test suite. All tests will output confirmation of passage.
