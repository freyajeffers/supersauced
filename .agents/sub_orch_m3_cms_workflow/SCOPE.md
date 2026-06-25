# Scope: CMS & Media Workflow Documentation (Milestone 3)

## Architecture
The system architecture integrates Directus CMS with Supabase PostgreSQL (the main database backend) and uses dual-storage backends (Supabase Storage for images and Cloudinary for video streaming).
- **Database**: Supabase PostgreSQL containing tables: `recipes`, `recipe_ingredients`, `recipe_steps`, etc.
- **CMS**: Directus mapping directly to Supabase PostgreSQL tables.
- **Auth/RBAC**: Directus roles (Admin, Content Creator, Editor) managing item permissions based on status (e.g. `draft`, `published`).
- **Media**:
  - Hero images stored in Supabase Storage.
  - Guided cooking videos hosted and optimized on Cloudinary.
- **Integration**: Directus configured with storage adapters, CDN preloading config, and API tokens.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Research | Analyze `docs/schema.sql`, `instructions.md`, and workspace to understand schemas, roles, and media needs | None | DONE |
| 2 | Draft Documentation | Worker creates `docs/content_workflow.md` detailing database mappings, RBAC permissions, and media pipelines | M1 | DONE |
| 3 | Review and Refinement | Spawns reviewers to inspect the correctness, formatting, and completeness of the document | M2 | IN_PROGRESS |
| 4 | Challenge Verification | Challenger checks logical validity and performs sanity checks on the documented integration setups | M3 | PLANNED |
| 5 | Forensic Audit | Auditor verifies no cheating, dummy configurations, or incomplete details, validating authenticity | M4 | PLANNED |

## Interface Contracts
- **CMS Database Mapping**: Exact column-to-field alignment between Directus and PostgreSQL tables: `recipes`, `recipe_ingredients`, `recipe_steps`.
- **RBAC Matrix**: Definition of roles (Admin, Editor, Creator) and their CRUD rules for recipes under different lifecycle statuses (`draft` vs `published`).
- **Storage Configuration**: Spec for Supabase Storage adapter and Cloudinary API settings.
