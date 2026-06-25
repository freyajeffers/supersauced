# Database Schema Analysis & Setup Strategy Report

**Date**: 2026-06-24
**Investigator**: Explorer Agent
**Milestone**: Database Schema Setup Strategy Investigation

---

## 1. Executive Summary
This report analyzes the database schema requirements, mock development configurations, and testing suites of the **SuperSauced** project. Based on this investigation, we propose a strategy to organize, deploy, and verify the PostgreSQL/Supabase database schema under `backend_guide/database/`. 

The core of our proposal is to modularize the schema definitions for developer readability, maintain a local mock architecture that emulates Supabase authentication and Row Level Security (RLS), and provide a unified dockerized validation script that executes functional, adversarial, concurrency, and stress tests. This strategy can be integrated directly into a CI/CD pipeline to ensure schema safety and query performance before production deployment.

---

## 2. Analysis of Database Schema Requirements (`docs/schema.sql`)
The database schema defines a standard PostgreSQL environment tailored for **Supabase**, employing features like JSONB metadata mapping, custom role RLS policies, and deferrable unique constraints.

### 2.1 Core Schema Elements
- **Extensions Used**:
  - `pgcrypto`: Generates UUIDs via `gen_random_uuid()`.
  - `pg_trgm`: Provides trigram matching for similarity-based searches.
  - `btree_gin`: Enables GIN indexing on scalar types alongside array data.
- **Tables**:
  1. `public.user_profiles`: Stores application-specific profile data for users. Features a primary key `id` that references Supabase's `auth.users(id)` with `ON DELETE CASCADE`. Columns include `email`, `username`, `full_name`, `avatar_url`, and two JSONB columns: `onboarding_survey` (dietary preferences, etc.) and `sauce_log` (activity log).
  2. `public.recipes`: Represents culinary recipes. Has a primary key `id` (random UUID), unique `slug`, metadata fields, constraints on difficulty (`BETWEEN 1 AND 3`), numeric constraints (cook time, calories, macros), arrays for `cube_tags` and `dietary_tags`, and an `is_published` flag.
  3. `public.recipe_ingredients`: Stores ingredients. Linked to a recipe via `recipe_id` with `ON DELETE CASCADE`. Features a `quantity` of type `numeric(10,1)` to limit decimals to a single decimal digit, and a `position` constraint to control display order.
  4. `public.recipe_steps`: Defines instructions for recipes. Linked to a recipe via `recipe_id` with `ON DELETE CASCADE`. Contains step order via `step_number` and instruction details.

### 2.2 Advanced Database Mechanics
- **Deferrable Unique Constraint**:
  The `recipe_steps` table contains a unique constraint:
  ```sql
  CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
  ```
  *Analysis*: A normal unique constraint is checked instantly after every single row update. If a user swaps two step numbers (e.g., changing Step 1 to Step 2, and Step 2 to Step 1), updating the first row temporarily creates a duplicate Step 2, which triggers a `unique_violation` error. By declaring this constraint `DEFERRABLE INITIALLY DEFERRED`, PostgreSQL defers constraint checking until the end of the transaction (`COMMIT`), allowing arbitrary re-ordering operations to execute smoothly in a single transaction block.
- **Supabase User Sync Trigger**:
  The function `handle_new_user()` is triggered `AFTER INSERT ON auth.users`. It extracts nested user metadata from the new user's `raw_user_meta_data` JSONB object, formats it (providing defaults for missing or null parameters), and inserts a matching record into `public.user_profiles`. This maintains automatic synchronization between Supabase's internal auth engine and public application tables.
- **Audit Triggers**:
  The `update_updated_at_column()` function updates the `updated_at` timestamp BEFORE UPDATE on `user_profiles` and `recipes`.

### 2.3 Row Level Security (RLS)
The database enforces strict data boundaries:
- `user_profiles` is restricted so that users can only select, insert, or update their own row (`auth.uid() = id`).
- `recipes`, `recipe_ingredients`, and `recipe_steps` are read-restricted. Anonymous (`anon`) or standard (`authenticated`) users can only view published recipes. However, users containing a JWT claim where the role is `cms_editor` can view both published and draft recipes. This custom role claim check is executed via:
  ```sql
  (auth.jwt() ->> 'role') = 'cms_editor'
  ```

---

## 3. Analysis of Local Mock Environment (`docs/local_mock_setup.sql`)
To run validations and test RLS rules locally without launching a full Supabase container stack (which requires heavy local compute and configuration), the mock file simulates Supabase’s internal architecture:

1. **Schema & Roles**:
   - Creates the `auth` schema explicitly to mirror Supabase’s system schema.
   - Defines standard Supabase roles: `anon`, `authenticated`, and `service_role`.
2. **Session Impersonation Mocking**:
   - Mocks `auth.uid()` to dynamically return a test session UID via `current_setting('test.auth_uid', true)`. If that configuration setting is empty, it falls back to parsing the JWT sub claim.
   - Mocks `auth.jwt()` to return custom claims stored in the database transaction config `request.jwt.claims`.
3. **Privileges**:
   - Simulates production permissions by granting usage on `public` and `auth` schemas to all three roles, setting default privileges for future tables (`service_role` has full write access; `authenticated` can insert/update/delete; `anon` can only select).

---

## 4. Analysis of Verification & Testing Infrastructure
The project currently defines a robust test suite divided into multiple SQL scripts, triggered sequentially by bash scripts in a Docker container.

### 4.1 Test Suites
- **Functional Validation (`test_schema.sql` / `validate.sql`)**:
  Performs sanity checks (table existence), tests the user trigger function behavior across different metadata conditions (empty, null, missing keys), confirms cascade delete actions on recipes and profiles, checks `numeric(10,1)` decimal rounding behavior, verifies GIN indexes, and tests RLS profile segregation using session impersonation.
- **Negative & Security Validation (`adversarial_tests.sql`)**:
  Performs stress tests on constraints by trying to violate difficulty bounds, step counts, quantities, timer ranges, and foreign keys. Asserts that RLS policies block unauthorized writes for `anon` and standard users, and asserts that duplicate steps throw a unique constraint error if transaction constraints are set to `IMMEDIATE` before resolve.
- **Stress & Load Validation (`stress_tests.sql` / `challenger_stress_tests.sql`)**:
  Measures duration during 500-1000 user profile inserts with deeply nested JSON structures, validates cascade deletions of heavy structures (1MB of profile metadata, or recipes with 1000 ingredients and 1000 steps), and compares the performance of deferrable vs non-deferrable constraints.
- **Concurrency Verification (`concurrent_inserts.sh`)**:
  Launches 10 background bash threads in parallel, each inserting 50 users simultaneously (500 users total) to verify database thread safety, locking behavior, and JSONB parsing stability under concurrent load.

### 4.2 Runner Scripts (`verify_schema.sh` & `run_stress_tests.sh`)
Both runner scripts implement an automated testing workflow:
1. Spin up a clean PostgreSQL instance in Docker.
2. Register an automatic `cleanup()` hook via `trap EXIT` to stop and remove the container.
3. Poll `pg_isready` until the database accepts connections.
4. Inject `local_mock_setup.sql`, `schema.sql`, and various test scripts sequentially.
5. Exit with a non-zero code if any step fails.

---

## 5. Recommended Strategy under `backend_guide/database/`
We recommend organizing these assets into a structured, self-contained sub-directory under `backend_guide/database/` to guide developers, implement automated checks, and maintain clean database structures.

### 5.1 Proposed Directory Structure
The files should be laid out as follows:
```
backend_guide/database/
├── README.md                     # Setup guide, explanation of architecture, and test runner instructions
├── schema.sql                    # Production schema (copied from docs/schema.sql)
├── local_mock_setup.sql          # Supabase environment mock (copied from docs/local_mock_setup.sql)
├── scripts/
│   ├── run_tests.sh              # Master verification script (combines functional, adversarial, and stress runs)
│   └── concurrent_inserts.sh     # Concurrency execution runner
└── tests/
    ├── functional_tests.sql      # Database functional validation (originally test_schema.sql)
    ├── adversarial_tests.sql     # Boundary and constraint validation (originally adversarial_tests.sql)
    └── stress_tests.sql          # Performance and cascade stress validation (originally stress_tests.sql)
```

### 5.2 Schema File Management: Monolithic vs. Decoupled
We recommend keeping the schema definition **monolithic** (`schema.sql`) for deployment compatibility, but maintaining it with clear comment dividers:
- *Why Monolithic?* Supabase migrations or direct sql execution via the Supabase Dashboard dashboard query editor are easiest when dealing with a single, copy-pasteable file containing all DDL statements in dependency order (Extensions -> Tables -> Indexes -> RLS -> Triggers). Splitting it introduces complex file loading sequences during local test verification and increases dev friction.
- *Developer Readability*: Use clean divider comments in `schema.sql` (e.g., `-- SECTION 1: EXTENSIONS`, `-- SECTION 2: TABLES`, etc.).

### 5.3 Local Mocking Guidelines
Developers setting up their local development environments (without full Supabase CLI tooling) should run:
```bash
psql -h localhost -U postgres -d supersauced -f local_mock_setup.sql
psql -h localhost -U postgres -d supersauced -f schema.sql
```
This enables local database querying and integration testing in backend apps (Node.js/Go/Python) while honoring RLS and schema structure.

---

## 6. Design of Unified Verification Runner Script
Instead of running separate runner scripts, we propose combining `verify_schema.sh` and `run_stress_tests.sh` into a single unified script: `scripts/run_tests.sh`.

### Unified Script Architecture:
1. **Docker Container Management**: Starts a temporary PostgreSQL 16 container, checks container liveness via `pg_isready`.
2. **Sequential Schema Loading**: Loads `local_mock_setup.sql` and `schema.sql` sequentially.
3. **Execution Levels (CLI Arguments)**:
   - Default (no args): Runs functional and adversarial tests.
   - `--all` / `-a`: Runs functional, adversarial, stress, and concurrency tests.
   - `--stress` / `-s`: Runs stress and concurrency tests only.
4. **Error Propagation**: Uses `-v ON_ERROR_STOP=1` in `psql` execution to ensure any test failure immediately aborts script execution and returns a non-zero exit code.
5. **Auto-Cleanup**: Ensures the temporary Docker container is terminated and removed under all termination states (success, manual interrupt, execution error) using bash traps.

---

## 7. CI/CD Integration Plan
To protect the main branch from broken schemas or SQL syntax regressions, the database validation suite should be executed automatically in GitHub Actions on every Pull Request containing modifications to files in `backend_guide/database/` or `docs/`.

### Example GitHub Actions Workflow (`.github/workflows/db-validation.yml`):
```yaml
name: Database Schema Validation

on:
  pull_request:
    paths:
      - 'backend_guide/database/**'
      - 'docs/**'

jobs:
  validate-schema:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Docker
        uses: docker-setup-action (default on github runner)

      - name: Run Unified Schema Verification
        run: |
          chmod +x backend_guide/database/scripts/run_tests.sh
          chmod +x backend_guide/database/scripts/concurrent_inserts.sh
          ./backend_guide/database/scripts/run_tests.sh --all
```

---

## 8. Actionable Guidelines for the Implementer Agent
When executing this strategy, the implementer agent should follow these steps:
1. Create the `backend_guide/database/` folder hierarchy.
2. Write a clear `README.md` documenting the schema design (highlighting RLS, the deferrable step swapping constraint, and trigger sync), local setup, and test runner usage.
3. Copy `docs/schema.sql` to `backend_guide/database/schema.sql`.
4. Copy `docs/local_mock_setup.sql` to `backend_guide/database/local_mock_setup.sql`.
5. Copy test suites into `backend_guide/database/tests/` (rename `test_schema.sql` to `functional_tests.sql` for clarity, and preserve `adversarial_tests.sql` and `stress_tests.sql`).
6. Write the unified runner script `backend_guide/database/scripts/run_tests.sh` which incorporates CLI arguments and wraps `concurrent_inserts.sh`. Copy `docs/concurrent_inserts.sh` to `backend_guide/database/scripts/concurrent_inserts.sh`, updating its postgres paths to point to the newly structured directory layout.
7. Verify layout compliance: ensure all database files (schemas, mocks, tests, scripts) remain under `backend_guide/database/` and that no project source code is created in `.agents/`.
