## 2026-06-23T23:01:23Z

You are a worker agent. Your working directory is `/home/freya/supersauced/.agents/worker_m1_2`.
Your parent is `/home/freya/supersauced/.agents/sub_orch_m1_db_schema`.

You must implement the updated Supabase/PostgreSQL 16+ relational database schema, RLS policies, triggers, and GIN indexes, as well as the separate mock setup and automated verification scripts.

Key instructions:
1. Write the production database schema to `/home/freya/supersauced/docs/schema.sql`. Make sure it has NO stubs/mocks of the `auth` schema or `auth.users` or `auth.uid()`, to avoid destructive overwrites on production Supabase.
2. Write the mock schema for local testing to `/home/freya/supersauced/docs/local_mock_setup.sql`. This file must define `auth` schema, `auth.users` table, `auth.uid()`, and `auth.jwt()`. Detail:
   - `auth.uid()` should return a mock value retrieved from session parameters (`current_setting('auth.mock_user_id', true)`).
   - `auth.jwt()` should return a mock claims JSONB from session parameters (`current_setting('request.jwt.claims', true)`).
3. Implement `public.handle_new_user()` trigger function:
   - Check if `NEW.raw_user_meta_data->'onboarding_survey'` (or `sauce_log`) is SQL NULL or JSON `null` ('null'::jsonb), and default it to `'{}'::jsonb` using CASE statement.
4. Implement RLS policies on `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps` allowing public read when `is_published = true`.
5. Appending permissive RLS policies for CMS editors:
   - `cms_editor_read_all_recipes`, `cms_editor_read_all_recipe_ingredients`, `cms_editor_read_all_recipe_steps` allowing SELECT if `auth.jwt() ->> 'role' = 'cms_editor'`.
6. Write the functional verification test suite to `/home/freya/supersauced/docs/validate.sql` containing transaction-isolated PL/pgSQL assertions. Test:
   - Schema structure.
   - Index verification (presence of GIN indexes).
   - Trigger and Null/JSON-Null handling.
   - Cascade deletion integrity.
   - Row Level Security (RLS) policies for user profiles and cms_editor role.
7. Write `/home/freya/supersauced/docs/verify_schema.sh` which:
   - Starts a clean docker container running `postgres:16`.
   - Waits for postgres to be ready.
   - Loads `local_mock_setup.sql` then `schema.sql` then `validate.sql`.
   - Cleans up the container.
   - Chmod +x the script.
8. Run `bash docs/verify_schema.sh` to run the tests and ensure they pass. Capture the stdout/stderr and include it in your handoff.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute, verify, write `/home/freya/supersauced/.agents/worker_m1_2/handoff.md`, and send a completion message to your parent.
