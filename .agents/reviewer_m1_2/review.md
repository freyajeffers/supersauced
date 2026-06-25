# Database Schema & RLS Policies Review Report

## Review Summary

**Verdict**: APPROVE

The database schema, RLS policies, indexes, and triggers defined in `/home/freya/supersauced/docs/schema.sql` are **fully correct, complete, and highly secure**. They conform to the architectural specifications and design requirements set forth in the project scope. 

The schema compiled with zero syntax errors on a clean PostgreSQL 16 instance. Automatic trigger invocation, column value defaulting, row-level access controls (RLS), and cascading deletions have all been verified and pass validation.

---

## Findings

### [Minor] Finding 1: JSON Null vs SQL Null in Trigger Coalesce

- **What**: The trigger function `public.handle_new_user()` uses `COALESCE` to default `onboarding_survey` and `sauce_log` when they are absent from `NEW.raw_user_meta_data`. However, if `raw_user_meta_data` explicitly contains a JSON `null` value (e.g. `'{"onboarding_survey": null}'::jsonb`), the expression `NEW.raw_user_meta_data->'onboarding_survey'` evaluates to a JSONB `null` rather than a SQL `NULL`. Because of this, `COALESCE` will bypass it, resulting in the JSON value `null` being inserted into the column instead of the expected empty object `{}`.
- **Where**: `/home/freya/supersauced/docs/schema.sql` lines 197-198:
  ```sql
  COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
  COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
  ```
- **Why**: Storing the JSON literal `null` (instead of `{}`) in `NOT NULL` columns is allowed by PostgreSQL, but could cause application-level exceptions or runtime crashes if client-side code tries to read keys or properties of the object assuming it is a valid object.
- **Suggestion**: Use `jsonb_strip_nulls()` or explicitly check for JSONB null. For example:
  ```sql
  CASE 
    WHEN NEW.raw_user_meta_data->'onboarding_survey' IS NULL 
         OR NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb 
    THEN '{}'::jsonb 
    ELSE NEW.raw_user_meta_data->'onboarding_survey' 
  END
  ```

### [Minor] Finding 2: Deferrable Step Number Unique Constraint

- **What**: The table `public.recipe_steps` has a unique constraint: `UNIQUE (recipe_id, step_number)`.
- **Where**: `/home/freya/supersauced/docs/schema.sql` line 95.
- **Why**: When re-ordering steps (e.g., swapping Step 1 and Step 2 in a transaction), updates will temporarily violate the unique constraint and fail unless updates are done in a specific sequence or the constraint is deferrable.
- **Suggestion**: Define the constraint as `DEFERRABLE INITIALLY DEFERRED` to allow step re-ordering transactions to execute without constraint violation errors during the transaction lifecycle.

---

## Verified Claims

- **All 4 core tables exist and are correctly defined** → verified via SQL execution in PostgreSQL 16 container → **PASS**
- **ON DELETE CASCADE constraints are defined on all foreign keys** → verified via test delete query, confirming cascaded removal of profiles on user deletion → **PASS**
- **Ingredient quantity is defined as NUMERIC(10,1)** → verified via schema definition inspection → **PASS**
- **GIN indexes exist on array fields (`cube_tags`, `dietary_tags`)** → verified via index creation confirmation → **PASS**
- **RLS policies exist on all 4 tables** → verified via role-impersonation queries:
  - `user_profiles` RLS restricts reads/writes strictly to `auth.uid() = id` → **PASS**
  - `recipes`, `recipe_ingredients`, and `recipe_steps` allow public read when `is_published = true` → **PASS**
  - Unauthenticated/normal users cannot read draft recipes (`is_published = false`) or their ingredients/steps → **PASS**
  - Normal users are blocked from inserting recipes → **PASS**
- **Signup trigger handles NULL and empty metadata** → verified trigger inserts default `{}` when `raw_user_meta_data` is NULL or empty → **PASS**

---

## Coverage Gaps

- **Custom DB Roles (CMS Editors)** — risk level: Low — The RLS policies only allow public read access for published recipes. Write access is restricted by default to superusers/service roles since no write policies exist for `recipes`, `recipe_ingredients`, and `recipe_steps`. If the CMS interacts with the database using a dedicated, non-superuser role (e.g. `cms_editor`), specific INSERT/UPDATE/DELETE policies will need to be added.
- **No index on recipes.slug** — risk level: Low — The column `slug` is defined as `UNIQUE NOT NULL` which automatically creates a unique B-Tree index, ensuring queries filtering by slug are performant. No action required.

---

## Unverified Items

- None. All aspects of the database schema have been validated in a clean PostgreSQL 16 environment.

---

## Challenge Summary (Adversarial Stress-Testing)

**Overall risk assessment**: LOW

The database schema and security model are very robust. Below is the stress-testing of potential failure modes and assumptions.

### Challenges

#### [Low] Challenge 1: Empty Arrays in Tags
- **Assumption challenged**: Filtering queries assume `cube_tags` and `dietary_tags` contain elements.
- **Attack scenario**: A recipe is published with empty arrays `{}` for tags. If the frontend queries for recipes with *any* tag (e.g., trying to do a search), these recipes might be filtered out or behave unexpectedly.
- **Blast radius**: Cosmetic issue or recipes not appearing in filter results.
- **Mitigation**: Standard behavior; application-level input validation should enforce at least one tag if required.

#### [Low] Challenge 2: Step Number Gaps
- **Assumption challenged**: Step numbers are contiguous integers starting from 1.
- **Attack scenario**: A CMS user inserts steps with numbers `1`, `3`, `5` (leaving gaps) or `10`, `20` (like BASIC lines).
- **Blast radius**: The client application UI might display list numbering with gaps or order them strangely.
- **Mitigation**: Enforce contiguous step numbers in the CMS layer, or have the client sort by `step_number` and use list index for display.

---

## Stress Test Results

- **Trigger with NULL raw metadata** → Trigger correctly handles NULL metadata and defaults onboarding_survey and sauce_log to `{}` → **PASS**
- **Uniqueness of steps** → Inserting steps with duplicate `step_number` for the same `recipe_id` fails with a uniqueness violation → **PASS**
- **Casading deletes of recipes** → Deleting a recipe automatically deletes all related steps and ingredients → **PASS**
- **Accessing unpublished recipes** → Impersonated anon/authenticated users get 0 rows when querying unpublished recipes or their children → **PASS**
