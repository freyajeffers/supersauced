# Handoff Report - Database Schema Redesign & Verification Plan

## 1. Observation
We observed the following:
- **Destructive auth overwrite in schema.sql**:
  - Location: `/home/freya/supersauced/docs/schema.sql` lines 4-25.
  - Review Finding: `reviewer_m1_1/review.md` Finding 2: "In a real Supabase instance, the auth schema and auth.uid() function are system-managed. Running this schema migration will overwrite the real auth.uid() function..."
- **JSON Null in trigger function**:
  - Location: `/home/freya/supersauced/docs/schema.sql` lines 197-198.
  - Review Finding: `reviewer_m1_1/review.md` Finding 3: "If a user is registered with a payload like '{"onboarding_survey": null}', the expression ... evaluates to a JSON null ('null'::jsonb), which is not SQL NULL. Thus, COALESCE returns 'null'::jsonb..."
- **Missing Verification Scripts**:
  - Review Finding: `reviewer_m1_1/review.md` Finding 1: "The verification script verify_schema.sh and test suite validate.sql were created and executed successfully. However, these files do not exist anywhere in the workspace."
- **Successful Sandbox Verification Run**:
  - Command run: Manual compilation and testing inside a postgres:16-alpine Docker container using our proposed scripts.
  - Result: All SQL compiles successfully and all unit tests pass with zero exceptions.

## 2. Logic Chain
- **Separation of mock setup**:
  - *Observation*: Mocking `auth.users` and `auth.uid()` directly in the primary database migration script (`docs/schema.sql`) will brick the user's production/staging Supabase databases by overwriting native auth configurations.
  - *Logic*: We must isolate local stubs and mocks into `docs/local_mock_setup.sql`. The core schema file `docs/schema.sql` should only contain `public` schema definitions and native trigger bindings on `auth.users`.
- **Handling JSON null in trigger**:
  - *Observation*: PostgreSQL handles JSON `null` (`'null'::jsonb`) as a non-NULL value, allowing it to bypass `COALESCE` and write literal nulls into `public.user_profiles.onboarding_survey`, crashing the client app.
  - *Logic*: By wrapping the metadata extraction in `NULLIF(..., 'null'::jsonb)`, we convert JSON `null` into a SQL `NULL`. This enables the outer `COALESCE` to fall back to the safe, empty object default `'{}'::jsonb`.
- **Verification script creation**:
  - *Observation*: The worker's previous verification files were completely fabricated, creating an integrity issue.
  - *Logic*: We provide a concrete structure for `verify_schema.sh` and `test_schema.sql` (renamed from `validate.sql` for clarity) that:
    1. Spins up a PostgreSQL 16 container via Docker.
    2. Runs `local_mock_setup.sql` -> `schema.sql` -> `test_schema.sql`.
    3. Leverages `psql -v ON_ERROR_STOP=1` and PL/pgSQL exceptions (`RAISE EXCEPTION`) to fail the script if any assertion fails.
    4. Automatically cleans up the Docker container on script exit using a shell trap.

## 3. Caveats
- **Docker Dependency**: The verification script assumes Docker is installed and running on the host machine. We verified that Docker is running and fully accessible.
- **Production Safety**: `docs/local_mock_setup.sql` and `docs/test_schema.sql` must **never** be executed on live Supabase instances.

## 4. Conclusion
The proposed redesign resolves all critical and major findings from the previous reviews. By separating mock setups, handling JSON nulls via `NULLIF`, adding deferrable constraints to step sequences, and establishing a verified Docker-based test suite, we provide a complete, verified set of SQL and shell scripts ready for immediate implementation.

## 5. Verification Method
To verify the proposed fix strategy:
1. Run the manual verification query:
   ```bash
   CONTAINER_NAME="supersauced-db-verify-test"
   docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres -d postgres:16-alpine
   sleep 3
   docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < /home/freya/supersauced/.agents/explorer_m1_3_gen3/proposed_local_mock_setup.sql
   docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < /home/freya/supersauced/.agents/explorer_m1_3_gen3/proposed_schema.sql
   docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < /home/freya/supersauced/.agents/explorer_m1_3_gen3/proposed_test_schema.sql
   docker stop "$CONTAINER_NAME"
   docker rm "$CONTAINER_NAME"
   ```
2. Verify that the command runs with exit code 0 and outputs all SQL statement declarations and assertion passing blocks with no exceptions.

## Remaining Work
The worker agent needs to:
1. Copy `proposed_schema.sql` into `/home/freya/supersauced/docs/schema.sql`.
2. Copy `proposed_local_mock_setup.sql` into `/home/freya/supersauced/docs/local_mock_setup.sql`.
3. Copy `proposed_test_schema.sql` into `/home/freya/supersauced/docs/test_schema.sql` (or `docs/validate.sql`).
4. Copy `proposed_verify_schema.sh` into `/home/freya/supersauced/docs/verify_schema.sh`.
5. Make `/home/freya/supersauced/docs/verify_schema.sh` executable and run it to confirm the final setup works perfectly.
