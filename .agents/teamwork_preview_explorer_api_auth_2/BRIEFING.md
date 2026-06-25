# BRIEFING — 2026-06-24T17:26:30Z

## Mission
Analyze requirements and provide a design strategy for Python FastAPI auth and user profile endpoints integrating Supabase and JWT authentication.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Read-only investigator, analyzer
- Working directory: /home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_2
- Original parent: 5603c4d4-238d-4891-a5ec-09b02097c6c2
- Milestone: Auth and Profile API Design

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze docs/api_spec.yaml, docs/api_spec.md, docs/auth_integration.md, and backend_guide/database/
- Focus on directory structure, JWT authentication, and Supabase integration
- Write recommendations to /home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_2/analysis.md

## Current Parent
- Conversation ID: 5603c4d4-238d-4891-a5ec-09b02097c6c2
- Updated: 2026-06-24T17:26:30Z

## Investigation State
- **Explored paths**:
  - `docs/auth_integration.md`
  - `docs/api_spec.md`
  - `docs/api_spec.yaml`
  - `backend_guide/database/migrations/00002_core_schema.sql`
  - `backend_guide/database/migrations/00004_rls_policies.sql`
- **Key findings**:
  - Supabase issues standard HS256 JWT tokens, enabling local cryptographic validation on the FastAPI server using the `SUPABASE_JWT_SECRET` key to ensure low latency.
  - A database trigger (`public.handle_new_user()`) handles profile synchronization upon registration, meaning `/auth/signup` needs to supply custom metadata inside the `raw_user_meta_data` dictionary.
  - Profile operations in SQL are protected by RLS matching `auth.uid() = id`. FastAPI can mirror this access boundary using local token claim parsing or by authenticating requests using the client's token.
- **Unexplored areas**:
  - None, the requirements are fully analyzed.

## Key Decisions Made
- Layout the FastAPI app with clean separations between core logic (security, configs), v1 routers, Pydantic schemas, and Supabase service client layers.
- Favor local JWT signature verification to avoid network performance bottlenecks.
- Validate nested JSONB structures (onboarding survey and sauce log) using Pydantic models.

## Artifact Index
- /home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_2/analysis.md — Auth and profile API design recommendations
- /home/freya/supersauced/.agents/teamwork_preview_explorer_api_auth_2/handoff.md — Handoff report
