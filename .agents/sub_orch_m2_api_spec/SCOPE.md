# Scope: Milestone 2 - PostgREST API Spec

## Architecture
- Documentation of Supabase PostgREST API endpoints and Supabase Client JS/TS SDK queries.
- Data flows: Client application interacting with Supabase Auth, calling PostgREST endpoints, mapping to PostgreSQL schema under Row-Level Security (RLS) constraints.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | API Spec Documentation | Create and verify docs/api_spec.md covering recipes, ingredients, steps, and profiles with JS/TS SDK and curl examples, headers, parameters, and RLS rules. | None | PLANNED |

## Interface Contracts
### Supabase Client JS/TS SDK ↔ Supabase PostgREST API
- Authentication: Bearer JWT token in Authorization header, apiKey header.
- Headers: `apikey`, `Authorization`, `Content-Type: application/json`, `Prefer: return=representation` (on write).
- Schema mapping:
  - `recipes` -> read-only list, pagination, and multi-tag array filtering.
  - `recipe_ingredients` -> join table/relational querying by recipe ID.
  - `recipe_steps` -> query ordered steps by recipe ID.
  - `profiles` -> read/update own profile, preferences, and `sauce_log` inventory.
