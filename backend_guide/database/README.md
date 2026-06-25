# SuperSauced Database Architecture & Setup Guide

This guide details the database layer of the **SuperSauced** project. It outlines the schema design, Row Level Security (RLS) policies, database triggers, migrations structure, local emulation/mocking architecture, and the automated verification suite.

---

## Directory Structure

All database assets are organized modularly under the `backend_guide/database/` directory:

```text
backend_guide/database/
├── README.md               # This guide
├── migrations/             # Versioned production-ready schema migrations
│   ├── 00001_extensions.sql
│   ├── 00002_core_schema.sql
│   ├── 00003_indexes.sql
│   ├── 00004_rls_policies.sql
│   └── 00005_triggers.sql
├── mocks/                  # Local auth and role mocks for testing and development
│   └── auth_mock_setup.sql
├── tests/                  # Transaction-isolated SQL validation suites
│   ├── 01_functional_test.sql
│   ├── 02_adversarial_test.sql
│   └── 03_stress_performance_test.sql
└── scripts/                # Automated validation and verification runners
    └── verify_schema.sh
```

---

## 1. Schema Design

The schema uses PostgreSQL 16 features tailored for integration with **Supabase**. It utilizes standard relational models, custom check constraints, full-text search capability, and dynamic JSONB columns.

### 1.1 Enabled Extensions
*   `pgcrypto`: Used to generate secure random UUIDs via `gen_random_uuid()` for primary keys.
*   `pg_trgm`: Enables similarity-based matching (trigrams) for searching.
*   `btree_gin`: Enables creating GIN indexes on scalar data types alongside text/array data.

### 1.2 Core Tables
1.  **`public.user_profiles`**:
    *   **Purpose**: Stores user profile details linked directly to Supabase's internal `auth.users` system table.
    *   **Structure**:
        *   `id`: UUID (Primary Key, foreign key referencing `auth.users(id)` with `ON DELETE CASCADE`).
        *   `email`: TEXT (Unique, Not Null).
        *   `username` / `full_name` / `avatar_url`: TEXT.
        *   `onboarding_survey`: JSONB (Default `{}`: stores dietary survey responses).
        *   `sauce_log`: JSONB (Default `{}`: logs user interactions and activity).
        *   `created_at` / `updated_at`: Timestamps.
2.  **`public.recipes`**:
    *   **Purpose**: Stores culinary recipe records.
    *   **Structure**:
        *   `id`: UUID (Primary Key, defaults to random UUID).
        *   `title` / `slug`: TEXT (Unique, Not Null).
        *   `difficulty`: INTEGER (Checked: `BETWEEN 1 AND 3`).
        *   `cook_time_minutes` / `calories_per_serving` / `protein_g` / `fat_g` / `carbs_g`: INTEGER (Checked: `>= 0`).
        *   `cube_tags` / `dietary_tags`: TEXT[] (Default `{}`).
        *   `servings_default`: INTEGER (Checked: `> 0`).
        *   `is_published`: BOOLEAN (Default `false`).
3.  **`public.recipe_ingredients`**:
    *   **Purpose**: Stores structured recipe ingredients.
    *   **Structure**:
        *   `recipe_id`: UUID (References `public.recipes(id)` with `ON DELETE CASCADE`).
        *   `quantity`: NUMERIC(10,1) (Checked: `>= 0.0` - provides exactly 1 decimal digit precision).
        *   `unit` / `name` / `notes`: TEXT.
        *   `position`: INTEGER (Checked: `>= 0`).
4.  **`public.recipe_steps`**:
    *   **Purpose**: Holds chronological cooking directions.
    *   **Structure**:
        *   `recipe_id`: UUID (References `public.recipes(id)` with `ON DELETE CASCADE`).
        *   `step_number`: INTEGER (Checked: `> 0`).
        *   `description`: TEXT.
        *   `timer_seconds`: INTEGER (Checked: `>= 0`).
        *   `tip`: TEXT.
    *   **Deferrable Unique Constraint**: 
        ```sql
        CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
        ```
        *Rationale*: A standard uniqueness check blocks step-swapping transactions because updating one step to match another's sequence number triggers an immediate violation. Declaring this constraint `DEFERRABLE INITIALLY DEFERRED` delays validation until transaction commit, enabling complex batch updates or swaps (e.g. swapping Step 1 and Step 2) in a single transaction.

---

## 2. Row Level Security (RLS) Policies

Row Level Security is enabled on all tables to enforce strict permission boundaries at the database level:

| Table | SELECT Policy | INSERT/UPDATE/DELETE Policies |
|---|---|---|
| `user_profiles` | Restricted to profile owner (`auth.uid() = id`). | Restricted to profile owner (`auth.uid() = id`). |
| `recipes` | Allowed if `is_published = true` OR user is a `cms_editor`. | Denied to all roles except `service_role` (service-role only). |
| `recipe_ingredients`| Allowed if parent recipe is published OR user is a `cms_editor`. | Denied to all roles except `service_role`. |
| `recipe_steps` | Allowed if parent recipe is published OR user is a `cms_editor`. | Denied to all roles except `service_role`. |

### RLS Custom Role Claims
The custom role check for CMS editors relies on Supabase jwt payload attributes:
```sql
(auth.jwt() ->> 'role') = 'cms_editor'
```
This enables decoupled authorization checks: standard users receive standard access, while users authenticated with `cms_editor` JWT claims bypass the publication checks to inspect drafts.

---

## 3. Database Triggers & Synchronization

*   **`handle_new_user()`**: Executed `AFTER INSERT ON auth.users`. It automatically extracts user profile metadata (`username`, `full_name`, `avatar_url`, `onboarding_survey`, `sauce_log`) from Supabase's `raw_user_meta_data` field, applies schema-compliant defaults, and inserts the record into `public.user_profiles`.
*   **`update_updated_at_column()`**: Applied `BEFORE UPDATE` on `public.recipes` and `public.user_profiles` to guarantee audit trail validity.

---

## 4. Database Migrations

DDL configurations are split into 5 versioned files under `migrations/` to match sequential order of dependencies:

1.  **`00001_extensions.sql`**: Configures PostgreSQL extensions.
2.  **`00002_core_schema.sql`**: Creates tables (`user_profiles`, `recipes`, `recipe_ingredients`, `recipe_steps`) with check constraints and primary/foreign keys.
3.  **`00003_indexes.sql`**: Creates index structures, including GIN indexes on `recipes.cube_tags`, `recipes.dietary_tags`, and full-text vectors.
4.  **`00004_rls_policies.sql`**: Activates RLS and applies access control rules.
5.  **`00005_triggers.sql`**: Creates the functions and triggers for new user initialization and update hooks.

---

## 5. Local Mock Environment (`mocks/auth_mock_setup.sql`)

To develop and test database code locally without spinning up the heavy Supabase docker orchestration stack:
1.  Creates a mock `auth` schema containing a mock `auth.users` table mirroring Supabase's internal structure.
2.  Declares Supabase system roles: `anon`, `authenticated`, and `service_role`.
3.  Defines mock helper functions `auth.uid()` and `auth.jwt()` which inspect session variables `test.auth_uid` and `request.jwt.claims`. This allows simulating different logged-in users and custom JWT claims using session parameters:
    ```sql
    -- Impersonating user A:
    PERFORM set_config('test.auth_uid', 'some-uuid-here', true);
    SET LOCAL ROLE authenticated;
    ```

---

## 6. Verification & Automated Testing

### 6.1 Test Suites (`tests/`)
*   **`01_functional_test.sql`**: Asserts correct table presence, onboarding sync triggers under multiple metadata scenarios (empty, missing keys, null), delete cascade functionality, rounding of ingredients, basic RLS policies, index registrations, and deferrable unique constraints.
*   **`02_adversarial_test.sql`**: Validates boundary checks (difficulty values, negative times, null constraints), asserts RLS blocks unauthorized reads/writes/deletes from anonymous and unauthorized users, and checks that constraint swapping throws immediate errors if constraints are set to immediate before resolution.
*   **`03_stress_performance_test.sql`**: Benchmarks database trigger throughput (500 sequential user creations with complex nested JSON), checks cascade delete speed with heavy datasets (500 ingredients, 500 steps, 1MB user profile histories), verifies RLS bypass performance, and asserts deferrable unique constraint flexibility under bulk updates.

### 6.2 Running Verification Locally
Execute the automated test script to run the migrations and full verification suite inside a clean PostgreSQL 16 container:

```bash
./backend_guide/database/scripts/verify_schema.sh
```

**Workflow executed by the runner**:
1.  Launches a temporary `postgres:16` Docker container on a random name identifier.
2.  Waits for connection readiness via `pg_isready`.
3.  Sequentially injects:
    *   `mocks/auth_mock_setup.sql` (auth mock)
    *   `migrations/*.sql` (ordered schema configuration)
    *   `tests/*.sql` (functional, adversarial, and stress validation tests)
4.  Terminates the docker container automatically upon script completion (on both success and failure states via `trap EXIT`).
5.  Exits with code `0` on success, or code `1` if any migration script or SQL assertion throws an error.
