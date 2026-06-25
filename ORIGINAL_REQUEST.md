# Original User Request

## Initial Request — 2026-06-24T10:20:58-07:00

# Teamwork Project Prompt — Draft

> Status: Step 5 — Ready for delegation
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

An exhaustive guide for building the Super Sauced backend using Supabase, PostgREST, and Python FastAPI.

Working directory: /home/freya/supersauced/backend_guide

Integrity mode: development

## Requirements

### R1. Database Schema Overview and Key Tables
- Supabase PostgreSQL 16+ with core tables: `auth.users`, `public.users`, `public.user_profiles`, `recipes`, `recipe_ingredients`, `recipe_steps`.
- Columns, primary/foreign keys, and Row‑Level Security (RLS) policies as described.

### R2. API Implementation (Python FastAPI)
- Implement all endpoints defined in `docs/api_spec.yaml` using FastAPI.
- Authentication endpoints: `/auth/signup`, `/auth/login`, `/auth/user`.
- User profile CRUD at `/user_profiles/{id}`.
- Recipe CRUD with filtering (`/recipes?tags=...`).
- Ingredient and step CRUD under `/recipe_ingredients` and `/recipe_steps`.

### R3. Documentation
- Generate developer documentation from the OpenAPI spec (`docs/api_spec.yaml`).
- Produce a database schema diagram (Mermaid or SVG) and include it in the docs.
- Write a user guide covering sign‑up, profile management, recipe search, and cooking flow.

### R4. Verification Resources
- OpenAPI specification file `docs/api_spec.yaml` will be used to validate endpoint behavior.
- Postgres schema file `docs/schema.sql` will be used to verify database structure.

## Acceptance Criteria

### Backend Implementation
- [ ] All tables exist with correct columns, constraints, and RLS policies as per `schema.sql`.
- [ ] FastAPI server starts without errors and connects to Supabase.
- [ ] All API endpoints respond with correct HTTP status codes and payloads matching `api_spec.yaml`.
- [ ] GIN indexes on `recipes.tags` arrays are created for fast filtering.

### Documentation
- [ ] API reference markdown generated from `api_spec.yaml` and includes all endpoints.
- [ ] Database schema diagram exported (e.g., Mermaid SVG) and included in docs.
- [ ] User guide covers sign‑up, profile edit, recipe search, and cooking steps.

---
*Next: when approved → delegate via invoke_subagent (see Delegation Protocol)*

## Follow-up — 2026-06-24T17:23:10Z

Please ensure the documentation and implementation guide are comprehensive and detailed enough for the backend development team to fully complete all aspects of the project, covering schema design, API implementation, RLS policies, deployment steps, testing procedures, diagrams, and user guide sections.

## Follow-up — 2026-06-24T17:26:13Z

Please ensure that any backend edge functions are implemented using Python (e.g., FastAPI routes or serverless functions) as part of the comprehensive implementation guide. Include deployment details, testing procedures, and integration points with Supabase.

## Follow-up — 2026-06-24T17:42:14Z

Please ensure that all backend edge functions are implemented using Python (e.g., FastAPI). Include code examples, deployment steps, and testing guidance for Python edge functions in the implementation guide.

## Follow-up — 2026-06-25T17:10:38Z

Please resume your work.
