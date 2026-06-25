# Database Schema Analysis & Recommendation Report

## Summary
This report analyzes the database schema, security rules, and verification scripts for the Super Sauced MVP, and recommends a unified local/CI setup and verification strategy under `backend_guide/database/` without using implementation code.

---

## 1. Observation
We examined the database configuration files, unit tests, and validation scripts present in the repository's `docs/` directory:

*   **`docs/schema.sql` (Lines 1-194)**:
    *   **Extensions (Lines 4-7)**: Enables `pgcrypto`, `pg_trgm`, and `btree_gin`.
    *   **Core Tables (Lines 10-64)**:
        *   `public.user_profiles`: Links directly to `auth.users(id)` via an `ON DELETE CASCADE` primary key (Line 11). Contains JSONB columns for `onboarding_survey` and `sauce_log` defaulting to `'{}'::jsonb`.
        *   `public.recipes`: Contains nutritional details, publication state, tags, and CHECK constraints (e.g., difficulty between 1 and 3, cook time >= 0, etc.).
        *   `public.recipe_ingredients`: Uses `NUMERIC(10,1)` for `quantity` (Line 47) and has `ON DELETE CASCADE` reference to recipes.
        *   `public.recipe_steps`: Unique constraint on `(recipe_id, step_number)` specified as `DEFERRABLE INITIALLY DEFERRED` (Line 63) to allow dynamic step rearrangement.
    *   **Indexes (Lines 67-72)**: GIN indexes applied to array columns `recipes.cube_tags` and `recipes.dietary_tags` for fast querying, and full-text search indexes on recipes and user profiles.
    *   **Row-Level Security (RLS) (Lines 75-112)**: Enabled on all tables. Profiles are restricted to owners (`auth.uid() = id`). Recipes and their components are viewable by public (`is_published = true`) or authenticated users with the `cms_editor` role claim.
    *   **Triggers & Functions (Lines 115-194)**: Trigger `on_auth_user_created` calls `handle_new_user()` to populate profiles from auth metadata, and update triggers maintain `updated_at` timestamps.

*   **`docs/local_mock_setup.sql` (Lines 1-63)**:
    *   Creates mock `auth` schema (Line 6) and mock `auth.users` table (Lines 23-29) to mirror Supabase auth environment locally.
    *   Defines mock functions `auth.uid()` (Lines 32-41) and `auth.jwt()` (Lines 44-53). These functions leverage local Postgres session variables (`test.auth_uid` and `request.jwt.claims`) to allow impersonating users and roles during local SQL test suites.
    *   Creates database roles (`anon`, `authenticated`, `service_role`) and sets up default schema privileges (Lines 9-20 and 56-62).

*   **`docs/test_schema.sql` (Lines 1-384)**:
    *   Wraps the entire test execution in a transaction block ending with a `ROLLBACK;` (Lines 6 and 381) to prevent test pollution.
    *   Performs functional unit tests: structure presence, `handle_new_user()` metadata trigger scenarios, cascade delete checks, numeric decimal rounding assertions, RLS policy impersonation (via `set_config` and `SET LOCAL ROLE`), GIN index presence checks, and deferrable unique constraint verification for step number swaps.

*   **`docs/adversarial_tests.sql` (Lines 1-360)**:
    *   Contains security-focused tests verifying that unauthorized users cannot select, insert, update, or delete profiles or draft recipe elements under anonymous or authenticated roles, and tests strict check constraints.

*   **`docs/challenger_stress_tests.sql` (Lines 1-379) and `docs/stress_tests.sql` (Lines 1-388)**:
    *   Validates bulk operations (inserting 500/1000 users, deleting recipes with 500/1000 ingredients and steps) under strict timeout/duration thresholds (e.g., trigger duration < 2 seconds) and verifies deferrable vs non-deferrable constraint behaviors.

*   **`docs/verify_schema.sh` (Lines 1-51)**:
    *   A shell script automating local database verification. It launches a standard Docker container (`postgres:16`), waits for it to become ready, sequentially runs mock setup, schema definition, and the functional, adversarial, and stress validation suites, and then stops and removes the container.

---

## 2. Logic Chain
To establish an optimal database setup and verification strategy under `backend_guide/database/`, we follow these logical steps:

1.  **Requirement (Isolated Setup)**: The verification workflow relies on executing SQL tests against a running Postgres instance. The dockerized strategy in `verify_schema.sh` is highly effective because it avoids contaminating local development/production databases.
2.  **Requirement (Local Development)**: Developers need a way to run local databases that mimic Supabase. `local_mock_setup.sql` provides this mock capability without requiring the full Supabase emulator.
3.  **Requirement (Production Safety)**: Mocks must *never* run in staging or production. Mocks must be strictly segregated from the core schema definitions.
4.  **Requirement (Automation)**: Schema validation should run on every pull request to catch schema regressions, broken triggers, or weak RLS policies before code merges.
5.  **Deduction**: We must structure the database guide under `backend_guide/database/` to clearly separate:
    *   **Local setup instructions** (running mocks vs Supabase emulator).
    *   **Core database migrations** (production-ready SQL schema files).
    *   **Verification runner workflow** (isolated docker command sequences and CI integration specifications).

---

## 3. Caveats
*   **Docker Dependency**: The container-based verification strategy assumes developers and CI environments have Docker installed. If Docker is missing, local verification is more difficult.
*   **Mock Drift**: The local mocks in `local_mock_setup.sql` duplicate core features of Supabase Auth. If Supabase alters its internal structure or RLS utility functions, our mocks could drift from production reality.
*   **Performance Limits**: While `challenger_stress_tests.sql` measures bulk trigger/cascade performance within transaction blocks, these tests run inside a single connection and do not account for concurrent connection pools or database locks.

---

## 4. Conclusion & Recommended Strategy
We recommend organizing the database guide under a dedicated path: `backend_guide/database/`. This directory should serve as the definitive developer reference.

### Proposed Directory Layout
```text
backend_guide/database/
├── README.md               # Quick start guide, migration instructions, and verification runbook
├── scripts/
│   └── run_verification.sh # Orchestration script for isolated container verification tests
└── resources/              # Direct pointers to source SQL files (or symlinks if permitted)
```

### 1. Local Database Provisioning Strategy
For local development, developers have two options depending on their work scope:
1.  **Standard Option (Lightweight Docker)**:
    *   Spin up a plain PostgreSQL container.
    *   Sequentially apply `docs/local_mock_setup.sql`, followed by `docs/schema.sql`.
2.  **Supabase Emulator Option**:
    *   Use the Supabase CLI (`supabase init`, `supabase start`).
    *   Apply `docs/schema.sql` directly inside the emulator (since the emulator already provides the full `auth` schema and default roles, `docs/local_mock_setup.sql` is skipped).

### 2. Schema Verification Runbook
The verification runner should execute all tests sequentially in an isolated PostgreSQL 16 environment.
1.  **Script Ordering**:
    *   Step 1: Deploy mock framework (`local_mock_setup.sql`).
    *   Step 2: Deploy schema structures, RLS policies, and triggers (`schema.sql`).
    *   Step 3: Run functional assertions (`test_schema.sql`).
    *   Step 4: Run adversarial security assertions (`adversarial_tests.sql`).
    *   Step 5: Run challenger stress and performance assertions (`challenger_stress_tests.sql`).
2.  **Container Lifecycle**:
    *   Run PostgreSQL container on a non-standard local port (e.g. `5433`) to avoid conflicts with existing databases.
    *   Utilize a shell trap hook to guarantee cleanup of the Docker container on script success, failure, or cancellation.
    *   Return code `0` on complete success, and code `1` on any error (enforced by `ON_ERROR_STOP=1`).

### 3. Continuous Integration (CI/CD) Strategy
*   **GitHub Actions Integration**: Run the verification script automatically on all pull requests targeting the `main` or `develop` branches.
    *   Job runs on an `ubuntu-latest` runner (which has Docker pre-installed).
    *   Checks out the code and triggers the verification runner script.
    *   Blocks pull request merges if any schema constraint, RLS policy, or trigger test fails.
*   **Git Pre-commit Hook (Optional)**: Recommend adding a pre-commit hook that runs the verification script locally, preventing developers from committing invalid schemas.

---

## 5. Verification Method
To verify that this setup and verification strategy works correctly:
1.  **Local Execution**:
    Run the following command sequence in a terminal where Docker is running:
    ```bash
    bash docs/verify_schema.sh
    ```
    Confirm that the script output terminates with:
    `=== All Tests Passed Successfully ===`
    `=== All Adversarial Tests Passed Successfully ===`
    `=== Challenger Stress and Edge Case Tests Completed Successfully ===`
    `SUCCESS: Database Schema Verification Passed`
    And verify that the temporary Docker container is successfully stopped and removed.

2.  **Policy Integrity Verification**:
    To verify that security policies are strictly enforced:
    *   Run the database and manually execute RLS tests. Confirm that attempting to access user profiles or draft recipes under the `anon` or `authenticated` roles (without `cms_editor` claim) returns empty results or throws `insufficient_privilege`.
