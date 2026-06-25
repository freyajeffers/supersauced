# Handoff Report

## 1. Observation
We directly observed the following from the codebase, reviewer findings, and local environment:
1.  **Destructive System Overwrite (Finding 2)**: In `/home/freya/supersauced/docs/schema.sql` (lines 7-24):
    ```sql
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (...);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID ...
    ```
    This inline mock setup conflicts with Supabase's native auth schema and would overwrite system-managed functions in production.
2.  **JSON Null Bug in Trigger (Finding 3)**: In `/home/freya/supersauced/docs/schema.sql` (lines 197-198):
    ```sql
    COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
    COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
    ```
    When `onboarding_survey` has a JSON value of `null`, the `->` operator returns `'null'::jsonb` (JSON null) which is not SQL NULL. This bypasses `COALESCE` and writes JSON null into the column, causing client deserialization errors.
3.  **Client Draft/Preview Limitation (Finding 4)**: The RLS policies for public tables in `docs/schema.sql` restrict read access to `is_published = true`, preventing editors from reading drafts.
4.  **Verification Artifacts Absence (Finding 1)**: `/home/freya/supersauced/.agents/reviewer_m1_1/review.md` (lines 11-16) flags that verification script `/home/freya/supersauced/.agents/worker_m1_1/verify_schema.sh` and test suite `validate.sql` mentioned in the previous handoff report did not actually exist.
5.  **Local Tools Check**: Running `which docker psql pg_isready` showed `/usr/bin/docker` is present on the host, but `psql` and `pg_isready` are not.

---

## 2. Logic Chain
1.  **Mock Separation**: Because Supabase handles the `auth` schema and `auth.uid()` function in staging/production (Observation 1), keeping these mock statements inside `docs/schema.sql` is a destructive action. Extracting them to a separate `docs/local_mock_setup.sql` ensures that production deployments remain intact, while local development can still replicate the schemas in order.
2.  **Trigger Handling**: Because `NEW.raw_user_meta_data->'onboarding_survey'` evaluates to `'null'::jsonb` when the user metadata is JSON null (Observation 2), a `CASE` statement is required to explicitly trap both SQL NULL and JSON `'null'::jsonb` and default them to `'{}'::jsonb`.
3.  **RLS Policies**: Adding separate policies that check if `auth.jwt() ->> 'role' = 'cms_editor'` will permissive-OR with the published constraint, allowing authenticated editors to bypass the `is_published = true` filter without breaking read-only access for other users (Observation 3).
4.  **Tests Location**: Since `.agents/` folders must contain only metadata (Rule: Layout Compliance), the test scripts must reside in a standard project location like `docs/` (`docs/verify_schema.sh` and `docs/validate.sql`) (Observation 4).
5.  **Containerized Testing**: Because `psql` is unavailable on the host but `docker` is (Observation 5), the bash script must start a temporary PostgreSQL 16 container, wait for it using `docker exec ... pg_isready`, pipe the SQL files sequentially via `docker exec -i ... psql -v ON_ERROR_STOP=1`, and return the exit code of `psql`.

---

## 3. Caveats
- It is assumed that the `cms_editor` role identifier matches the JWT claims returned from the Directus-to-Supabase authentication payload.
- Since we are a read-only explorer, we have not executed these scripts. They have been fully detailed in `analysis.md` for the Worker.

---

## 4. Conclusion
The database schema can be cleanly fixed and validated without disrupting production environments by:
1. Moving the auth mock setup to `docs/local_mock_setup.sql`.
2. Redefining the user profiles trigger with explicit `CASE` expressions.
3. Adding permissive `cms_editor` read policies.
4. Setting up a containerized PostgreSQL test run in `docs/verify_schema.sh` that evaluates functional SQL assertions in `docs/validate.sql`.

---

## 5. Verification Method
To verify this redesign proposal:
1. Inspect the proposed design in `/home/freya/supersauced/.agents/explorer_m1_1_gen3/analysis.md`.
2. Confirm the presence of mock session settings `auth.mock_user_id` and `request.jwt.claims` in `docs/local_mock_setup.sql` for test simulation.
3. Confirm that running `bash docs/verify_schema.sh` once implemented will cleanly compile and pass all tests without leaving orphaned docker containers.
