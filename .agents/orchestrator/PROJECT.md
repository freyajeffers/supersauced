# Project: Super Sauced Backend Guide

## Architecture
The Super Sauced backend consists of two main components:
1. **Supabase / PostgreSQL Database Layer**: Core tables (`auth.users`, `public.user_profiles`, `public.recipes`, `public.recipe_ingredients`, `public.recipe_steps`) with GIN indexes and RLS policies.
2. **FastAPI Application Layer**: Python-based REST API that implements `/auth` and `/user_profiles`, `/recipes`, `/recipe_ingredients`, `/recipe_steps` endpoints, serving as a developer guide and proxy to Supabase/PostgREST.

```
                  +--------------------------+
                  |    Python FastAPI App    |
                  +-------------+------------+
                                |
             (Auth / SQL Queries / Supabase Client)
                                |
                                v
                  +--------------------------+
                  |  Supabase / PostgreSQL   |
                  +--------------------------+
```

## Code Layout
The project files will be structured under `/home/freya/supersauced/backend_guide/` as follows:
- `database/schema.sql` - Supabase PostgreSQL schema with tables, constraints, and RLS policies.
- `database/verify_schema.sh` - Database verification script using a local PostgreSQL docker container.
- `app/` - Python FastAPI application source code.
  - `app/main.py` - FastAPI entrypoint.
  - `app/config.py` - Configuration and environment variables.
  - `app/auth.py` - Sign-up, login, JWT validation, and user routing.
  - `app/routers/` - Routers for recipes, profiles, steps, and ingredients.
- `docs/` - Generated documentation.
  - `docs/api_reference.md` - Generated API reference from `api_spec.yaml`.
  - `docs/schema_diagram.svg` - Mermaid schema diagram rendered as SVG.
  - `docs/user_guide.md` - User guide covering sign-up, profile edit, recipe search, and cooking steps.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | DB Setup & Validation | Implement and verify PostgreSQL schema using dockerized test scripts. | None | DONE | 3237f380-f1fe-4607-92ad-81a3d50c55c1, c8cf2aa6-280f-4f70-9e34-4ce85db5a1cc, 7acb28db-4355-44c5-a4ed-a721d78b2fea, 65a491e1-a746-42ec-ba28-30d04268db8d |
| 2 | FastAPI Auth & Profile | Implement `/auth` and `/user_profiles` endpoints with JWT and database state sync. | M1 | DONE | 3013d7b6-725b-4bc2-bf54-261bb453ec9d, 8cde02b3-b502-467c-a41f-1b707bb7753d, f35e2674-b638-4618-8670-436c7d8b6c65, f87e0267-49dc-4e94-a667-1fbb5336664f |
| 3 | FastAPI Recipes & Steps | Implement recipes, ingredients, and steps CRUD with array filtering. | M2 | DONE | ba8644a1-bcd4-478f-8993-63e753e3a672, 5173cd91-f8e4-40a4-841d-2f7d66b2a8a7, 057d8e51-8e40-4edc-9081-73c4dd83047f, fb3dc094-82e4-4a45-a301-3b4643fa30db |
| 4 | Verification & E2E | Run verification scripts and API tests to validate 100% compliance with `api_spec.yaml`. | M3 | DONE | f3f1b24b-5a20-4f6f-abb7-841c7d0d088e |
| 5 | Documentation | Generate API reference, schema diagram, and write the cooking user guide. | M3 | DONE | f3f1b24b-5a20-4f6f-abb7-841c7d0d088e |

## Interface Contracts
### FastAPI Router ↔ Supabase / PostgreSQL Client
- Auth operations utilize Supabase GoTrue API or direct database checks/inserts mimicking Supabase Auth.
- Profiles and Recipes are queried via async connection pool or Supabase Python SDK.
- Response payloads must conform strictly to `docs/api_spec.yaml` schemas.
