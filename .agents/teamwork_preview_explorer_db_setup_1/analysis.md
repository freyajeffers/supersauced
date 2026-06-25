# Database Schema Analysis and Setup/Verification Strategy

## Executive Summary
The Super Sauced database schema is designed for the high-performance B2C recipe mobile application. It implements a robust PostgreSQL 16+ structure on Supabase featuring GIN indexing for sub-100ms searches, strict numeric precision for ingredient scaling, cascade deletes for CMS sync integrity, and Row-Level Security (RLS) for data privacy. We recommend a structured, migration-ready layout under `backend_guide/database/` that separates production-ready migrations, local auth mocks, and functional/adversarial/stress verification suites, integrated into the CI/CD pipeline.

---

## 1. Core Database Requirements
The database schema must satisfy the following architectural requirements:

| Component | Target Table / Objects | Details & Technical Specifications |
| :--- | :--- | :--- |
| **Extensions** | N/A | `pgcrypto` (UUID generation), `pg_trgm` (fuzzy matching), and `btree_gin` (multi-column GIN indexing). |
| **User Profiles** | `public.user_profiles` | One-to-one relationship with `auth.users(id)` via `ON DELETE CASCADE`. Houses `onboarding_survey` (JSONB) and `sauce_log` (JSONB SKU inventory). Defaults to `{}` to prevent null-handling errors. |
| **Recipes** | `public.recipes` | Main recipe table featuring string `slug` (unique identifier), difficulty (1-3), default servings, macro counts, and array fields `cube_tags` and `dietary_tags` for filtering. |
| **Recipe Ingredients** | `public.recipe_ingredients` | Linked via `recipe_id` with `ON DELETE CASCADE`. Requires `NUMERIC(10,1)` for `quantity` to avoid floating-point rounding errors during serving scaling (e.g. 1.25 rounds cleanly to 1.3). |
| **Recipe Steps** | `public.recipe_steps` | Linked via `recipe_id` with `ON DELETE CASCADE`. Step numbers must be positive. Contains description, optional Cloudinary `video_url`, `timer_seconds` and tips. |
| **Index Optimizations** | `public.recipes`, `public.user_profiles` | GIN indexes on `recipes.cube_tags` and `recipes.dietary_tags` (fast tag filters). Full-text English search GIN index on recipes (`title \|\| description`) and user profiles (`username \|\| email`). |
| **Triggers** | `public.user_profiles`, `public.recipes` | 1. `update_updated_at_column()` to auto-update `updated_at` before modification.<br>2. `handle_new_user()` trigger function executing `AFTER INSERT` on `auth.users` to extract metadata and write default profile values. |
| **Security & RLS** | All Tables | 1. `user_profiles` limits select/insert/update access to `auth.uid() = id`. No direct delete policy (relies on cascade from auth).<br>2. `recipes`, `ingredients`, and `steps` SELECT access is restricted to published content or users with the `cms_editor` JWT claim. Writes are disabled by default under RLS (managed via bypass/service_role by Directus). |

---

## 2. Analysis of Existing Assets
We analyzed the SQL scripts and verification frameworks in the `docs/` folder:

1. **`schema.sql`**: The production-ready core schema definition. It correctly configures the extensions, tables, GIN indexes, RLS, and triggers (user sync and updated_at updates).
2. **`local_mock_setup.sql`**: A mockup of Supabase's internal auth layer. It sets up the `auth` schema, `auth.users` table, and mock roles (`anon`, `authenticated`, `service_role`). It also mocks the `auth.uid()` and `auth.jwt()` functions, allowing developers to set PostgreSQL session variables (like `test.auth_uid` and `request.jwt.claims`) to test RLS policies locally.
3. **`test_schema.sql` (Functional Suite)**: A transaction-backed test suite that checks schema tables, trigger defaults (Scenario A-D for metadata variations), cascade deletes, numeric rounding checks, profile/recipe RLS policies, index definitions, and deferrable constraints.
4. **`adversarial_tests.sql` (Adversarial Suite)**: Attempts malicious modifications or invalid inserts (e.g., negative cooking times, invalid foreign keys, negative quantities, RLS policy violations) and asserts that they throw appropriate exceptions.
5. **`challenger_stress_tests.sql` (Performance Suite)**: Performance checks simulating heavy loads (500 user triggers inserted in a loop, cascading deletes on a recipe with 500 ingredients and 500 steps, deleting a user with a 1MB profile history). It checks trigger completion times and validates that deferrable unique step constraints are optimized.
6. **`verify_schema.sh`**: A shell script that provisions a clean PostgreSQL 16 Docker container, applies the mocks and schemas sequentially, runs the three test suites in order, and cleans up the container on termination.

---

## 3. Recommended Setup and Verification Strategy
To integrate these assets into a clean, maintainable structure under `backend_guide/database/`, we propose a modular organization. This avoids monolithic SQL files, separates production code from mocks/tests, and sets up a robust developer workflow.

### A. Recommended Directory Structure
We recommend creating the following layout under `/home/freya/supersauced/backend_guide/database/`:

```
backend_guide/database/
├── README.md                          # Database architecture and local/CI execution guide
├── migrations/                        # Versioned schema migrations for production/staging
│   ├── 00001_extensions.sql           # Enables pgcrypto, pg_trgm, btree_gin
│   ├── 00002_core_schema.sql          # Creates tables: user_profiles, recipes, ingredients, steps
│   ├── 00003_indexes.sql              # Sets up GIN index and text search vector indexes
│   ├── 00004_rls_policies.sql         # Activates RLS and creates policies
│   └── 00005_triggers.sql             # Creates updated_at triggers and handle_new_user sync
├── mocks/                             # Mock configurations for local testing (Never in Prod)
│   └── auth_mock_setup.sql            # Mocks auth schema, users table, roles, auth.uid(), auth.jwt()
├── tests/                             # SQL-based verification suites
│   ├── 01_functional_test.sql         # Tests functional logic, defaults, and data scaling
│   ├── 02_adversarial_test.sql        # Tests bounds checks, constraints, and RLS violations
│   └── 03_stress_performance_test.sql # Tests batch triggers, large cascade deletes, and transaction durations
└── scripts/                           # Orchestration and build tools
    └── verify_schema.sh               # Runs Docker-based test orchestration (with clean setup/teardown)
```

### B. Setup & Migration Workflow Strategy
1. **Migration Tool Integration**: Rather than raw SQL executions, migrations under `migrations/` should be applied using a database migration manager. Since Supabase is the database provider, we recommend standardizing on the **Supabase CLI** (`supabase db branch` / `supabase migration new` / `supabase db reset`).
2. **Strict Environment Separation**:
   - **Local Dev / Testing**: Executed sequentially: `mocks/auth_mock_setup.sql` -> `migrations/` -> `tests/`.
   - **Production / Staging**: Mocks and tests are **strictly excluded**. The migration tool directly executes `migrations/` against the Supabase remote project instance.

### C. Verification & Test Suite Execution Strategy
To verify schema integrity locally or in a continuous integration environment, the database verification pipeline must run.

1. **Local Test Script Execution**:
   The orchestrated shell script (`scripts/verify_schema.sh`) handles:
   - Starting a temporary PostgreSQL 16 container.
   - Initializing the mock environment (`mocks/auth_mock_setup.sql`).
   - Running the migrations sequentially via `psql` (or calling `supabase migration up`).
   - Running the test suites (`tests/*_test.sql`) inside rollback-enclosed transactions to assert correct database behavior.
   - Tearing down the container automatically using bash `trap`.

2. **CI/CD Integration (GitHub Actions)**:
   We recommend establishing a GitHub Actions workflow `.github/workflows/db-validation.yml` which triggers on every pull request targeting `main`. The pipeline will:
   - Spin up a Docker service container for `postgres:16`.
   - Run the local verify script (`backend_guide/database/scripts/verify_schema.sh`).
   - Block pull request merging if any test suite throws an exception (e.g., if a constraint check fails, RLS is breached, or trigger performance degrades).

---

## 4. Key Schema Verification Checks (Test Coverage Matrix)
To confirm that changes to the database do not degrade performance or compromise security, the validation suites verify the following key features:

| Test Category | Target Feature | Validation Scenario | Expected Result |
| :--- | :--- | :--- | :--- |
| **Integrity Checks** | Deferrable Constraint | Swap step numbers (1 $\leftrightarrow$ 2) in a single transaction. | Succeeds (checks deferred until transaction commit). |
| **Integrity Checks** | CASCADE Rules | Delete a recipe or delete an auth user. | Associated ingredients, steps, and user profiles are automatically deleted. |
| **Integrity Checks** | Numeric Precision | Insert a recipe ingredient with quantity `1.25`. | Value rounds to `1.3` (due to `NUMERIC(10,1)` type). |
| **Security (RLS)** | Profile Isolation | User A attempts to read or update User B's profile. | Returns 0 rows affected; direct inserts throw `insufficient_privilege`. |
| **Security (RLS)** | Content Access | Anonymous users attempt to query unpublished/draft recipes. | Returns 0 rows. Only `cms_editor` role JWT claims bypass publishing blocks. |
| **Performance** | Trigger Overhead | Insert 500 users with highly nested metadata in a single transaction. | Validates trigger executions run in sub-second duration (warns if >2s). |
| **Performance** | Cascade Scale | Delete recipe with 500 ingredients & steps; delete user with 1MB profile metadata. | Measures deletion times to verify indexed cascades perform cleanly. |
