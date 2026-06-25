# Scope: DB Schema & RLS Policies (Milestone 1)

## Architecture
- Relational database using PostgreSQL 16+ (Supabase compatible).
- Schema file target: `/home/freya/supersauced/docs/schema.sql`.
- Data Flow:
  - Users sign up -> `auth.users` trigger invokes trigger function -> row created in `public.user_profiles` with default preferences/sauce log.
  - Clients query `public.recipes`, `public.recipe_ingredients`, `public.recipe_steps` (read-only for authenticated/anonymous users based on RLS).
  - CMS operations (insert/update/delete) on `public.recipes` bypass RLS via admin/service_role.
- Tables:
  - `public.user_profiles`:
    - Linked to `auth.users` on `id` with `ON DELETE CASCADE`.
    - Stores onboarding survey preferences (JSONB) and sauce log (JSONB).
  - `public.recipes`:
    - Core recipe details (title, description, tags, etc.).
    - GIN indexes on array fields: `cube_tags` (text[]) and `dietary_tags` (text[]).
  - `public.recipe_ingredients`:
    - Linked to `recipes.id` with `ON DELETE CASCADE`.
    - Quantity stored using `NUMERIC(10,1)` precision.
  - `public.recipe_steps`:
    - Linked to `recipes.id` with `ON DELETE CASCADE`.
    - Ordering and instructions.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | DB Schema & RLS | Write schema, indexes, RLS, and auth trigger in docs/schema.sql | none | IN_PROGRESS |

## Interface Contracts
### `auth.users` ↔ `public.user_profiles`
- On `INSERT` to `auth.users`, a database trigger calls a function `public.handle_new_user()` which inserts a corresponding record into `public.user_profiles`.
- On `DELETE` of a record in `auth.users`, the corresponding record in `public.user_profiles` is automatically deleted via `FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE`.

### `public.recipes` ↔ `public.recipe_ingredients` / `public.recipe_steps`
- Foreign keys on `recipe_id` referencing `recipes.id` with `ON DELETE CASCADE`.
