# Handoff Report — Database Schema Analysis

## 1. Observation
I directly observed the following files and content configurations:
- **Reviewer Findings**: `/home/freya/supersauced/.agents/reviewer_m1_1/review.md` line 12: `"The verification logs provided in the handoff report are fabricated or not supported by actual files on disk."`
- **Mock Setup inside `schema.sql`**: `/home/freya/supersauced/docs/schema.sql` lines 7-24:
  ```sql
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (...);
  CREATE OR REPLACE FUNCTION auth.uid() ...
  ```
- **Trigger Function JSON Null Issue**: `/home/freya/supersauced/docs/schema.sql` lines 197-198:
  ```sql
  COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb)
  COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
  ```
- **RLS Read Limitation**: `/home/freya/supersauced/docs/schema.sql` lines 154-156:
  ```sql
  CREATE POLICY "public_read_published_recipes" ON public.recipes
    FOR SELECT USING (is_published = true);
  ```

## 2. Logic Chain
- **Step 1**: The absence of `verify_schema.sh` and `validate.sql` on disk means the previous worker's assertions were unverified. Therefore, a complete verification harness containing a shell test orchestrator and an assertion-rich SQL test suite is needed to restore verification integrity.
- **Step 2**: The presence of `CREATE SCHEMA auth` and `CREATE OR REPLACE FUNCTION auth.uid()` in `schema.sql` presents a critical risk where live Supabase managed schemas could be corrupted or overwritten during migrations. Therefore, separating these stubs into a development-only file `/home/freya/supersauced/docs/local_mock_setup.sql` is necessary.
- **Step 3**: Postgres JSONB evaluation of missing values produces SQL `NULL`, but explicit JSON null attributes produce JSON `'null'::jsonb`. The `COALESCE` function in the current trigger fails to catch JSON `'null'::jsonb`. Therefore, converting JSON `'null'::jsonb` to SQL `NULL` via `NULLIF` before calling `COALESCE` is required to ensure empty objects are saved.
- **Step 4**: The `is_published = true` condition on the standard SELECT policy blocks draft previews for all users. Introducing a separate permissive policy that evaluates `auth.jwt() ->> 'role' = 'cms_editor'` allows CMS editors to bypass the filter while keeping the standard public access restricted to published recipes.

## 3. Caveats
- Directus CMS custom roles: Directus typically uses `service_role` (which bypasses RLS). This report assumes this configuration is in use. If Directus accesses the DB under custom roles without bypassing RLS, additional roles must be explicitly granted table SELECT/INSERT/UPDATE permissions.
- Local tests assume a standard PostgreSQL environment with `psql` and connection credentials configured (or using default local socket access).

## 4. Conclusion
We recommend:
1. Stripping all mock schemas, tables, and helper functions from `/home/freya/supersauced/docs/schema.sql`.
2. Placing them in a new file `/home/freya/supersauced/docs/local_mock_setup.sql`.
3. Updating the trigger function in `/home/freya/supersauced/docs/schema.sql` to use `COALESCE(NULLIF(..., 'null'::jsonb), '{}'::jsonb)`.
4. Adding separate permissive RLS policies for `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps` checking for `auth.jwt() ->> 'role' = 'cms_editor'`.
5. Deploying a testing harness consisting of `/home/freya/supersauced/.agents/explorer_m1_it2_3/verify_schema.sh` and `/home/freya/supersauced/.agents/explorer_m1_it2_3/validate.sql`.

## 5. Verification Method
To verify this plan, run the proposed `verify_schema.sh` script against a local Postgres database:
```bash
# In the agent directory /home/freya/supersauced/.agents/explorer_m1_it2_3:
chmod +x verify_schema.sh
./verify_schema.sh
```
Check if the exit code is `0`. The script is designed to raise a SQL exception if any assertion regarding metadata default fallback, RLS access control (public vs. CMS editor role), precision constraints, or cascading deletions fails.
