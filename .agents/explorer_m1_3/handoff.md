# Handoff Report — explorer_m1_3

## 1. Observation
- **Scope Requirements**: `/home/freya/supersauced/.agents/sub_orch_m1_db_schema/SCOPE.md` specifies constraints for tables, cascade deletions, indexes, RLS, and triggers:
  > - Tables: `public.user_profiles`, `public.recipes`, `public.recipe_ingredients`, `public.recipe_steps`.
  > - `public.recipes`: GIN indexes on array fields: `cube_tags` (text[]) and `dietary_tags` (text[]).
  > - `public.recipe_ingredients`: Quantity stored using `NUMERIC(10,1)` precision.
  > - `public.recipes` ↔ `public.recipe_ingredients` / `public.recipe_steps`: Foreign keys on `recipe_id` referencing `recipes.id` with `ON DELETE CASCADE`.
  > - `auth.users` ↔ `public.user_profiles`: `FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE`. On `INSERT` to `auth.users`, a database trigger calls a function `public.handle_new_user()`.
  > - Row Level Security (RLS) on all tables (prevent users from accessing other profiles, public read for recipes/steps/ingredients, admin/service_role bypasses for CMS operations).
- **Existing Codebase Guidelines**: `/home/freya/supersauced/instructions.md` lines 124-177 detail a draft schema template:
  > `CREATE TABLE public.user_profiles ( id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email TEXT UNIQUE NOT NULL, dietary_preferences TEXT[] DEFAULT '{}', ... )`
  > `quantity NUMERIC(10,1) NOT NULL, -- Prevents floating-point math errors`

## 2. Logic Chain
1. **Schema & Precision**: Based on the instructions.md template and SCOPE.md requirements, a relational schema is mapped for the four core tables: `user_profiles`, `recipes`, `recipe_ingredients`, and `recipe_steps`. The `NUMERIC(10,1)` type for `recipe_ingredients.quantity` ensures precise math, preventing rounding errors (e.g. 0.300000004) during serving-size scaling in the UI.
2. **Cascading Deletes**: To maintain data integrity when content is managed via Directus CMS, parent-child references must contain `ON DELETE CASCADE`. This is mapped for `recipe_ingredients(recipe_id) -> recipes(id)`, `recipe_steps(recipe_id) -> recipes(id)`, and `user_profiles(id) -> auth.users(id)`.
3. **Indexing Strategy**: GIN indexes on `recipes.cube_tags` and `recipes.dietary_tags` are required for fast set intersection filtering (Speed to Meal). Additionally, B-Tree indexes on foreign keys (`recipe_id` in ingredients and steps) are designed because PostgreSQL does not automatically index foreign keys; without these, joins and cascading deletes would trigger slow sequential scans.
4. **Trigger Design**: The sign-up automation needs to extract onboarding preferences from `auth.users.raw_user_meta_data`. To execute correctly, the trigger function must run with `SECURITY DEFINER` (running as `postgres`) to bypass RLS restrictions during sign-up, use `SET search_path = public, pg_temp` to prevent search path hijacking, and use exception handling (`EXCEPTION WHEN OTHERS`) to fall back gracefully to a basic profile insertion if client metadata is malformed.
5. **RLS Security**: Row Level Security is configured with `USING (auth.uid() = id)` for user profiles to isolate access. For recipes, steps, and ingredients, a SELECT policy checks `is_published = true` (using a subquery lookup for ingredients/steps) to enable public read-only access. Write actions (INSERT/UPDATE/DELETE) on recipes/steps/ingredients do not have policies, denying access by default to public users while allowing superusers and the `service_role` (CMS) to bypass RLS and perform modifications.

## 3. Caveats
- Directus CMS operations bypass RLS by connecting directly to the database via `postgres`/`service_role` credentials. If the CMS interacts via the PostgREST API with non-superuser roles, custom write policies for those specific roles would be necessary.
- We assume `auth.users.raw_user_meta_data` is where the frontend stores sign-up onboarding preferences (`dietary_preferences`, `discovery_channel`, `onboarding_survey`, `sauce_log`). If these are stored elsewhere, the client signup code or the trigger logic must adjust.

## 4. Conclusion
The proposed design is robust, secure, and meets all criteria. Implementing it in `/home/freya/supersauced/docs/schema.sql` will establish the complete database backend for Milestone 1.

## 5. Verification Method
- **Verification Commands**: Once implemented, the schema can be verified using local PostgreSQL command-line tools:
  - Run syntax and structure check: `psql -f /home/freya/supersauced/docs/schema.sql` (if local test DB is available).
  - Verify tables, triggers, and indexes are created successfully.
  - Verify policy checks by inserting dummy profiles and asserting that queries under different roles (anon, authenticated with matching/mismatching IDs) execute correctly.
- **Files to Inspect**: `/home/freya/supersauced/docs/schema.sql` (once written by the Worker).
