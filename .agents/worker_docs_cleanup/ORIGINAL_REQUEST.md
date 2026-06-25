## 2026-06-23T21:01:29-07:00
You are a teamwork_preview_worker. Your working directory is `/home/freya/supersauced/.agents/worker_docs_cleanup`.

Your task is to:
1. Clean up and rewrite `/home/freya/supersauced/docs/schema.sql` to:
   - Remove all ANSI escape codes (e.g. `[18D [K`, `[3D [K`, etc.).
   - Represent a complete, valid PostgreSQL schema that complies with the instructions in `instructions.md` and passes the validation tests in `test_schema.sql`, `adversarial_tests.sql`, and `challenger_stress_tests.sql`.
   - The tables, constraints, indexes, RLS policies, and triggers must be perfectly aligned with the test suites. Specifically:
     - `user_profiles` table must have: `id` (UUID references auth.users), `email` (TEXT UNIQUE NOT NULL), `username` (TEXT UNIQUE nullable), `full_name` (TEXT), `avatar_url` (TEXT), `onboarding_survey` (JSONB defaulting to '{}'), `sauce_log` (JSONB defaulting to '{}'), `created_at`, `updated_at`.
     - `recipes` table must have: `id` (UUID default gen_random_uuid()), `title` (TEXT NOT NULL), `slug` (TEXT UNIQUE NOT NULL), `description` (TEXT), `hero_image_url` (TEXT), `difficulty` (INTEGER CHECK 1..3), `cook_time_minutes` (INTEGER CHECK >=0), `calories_per_serving` (INTEGER CHECK >=0), `protein_g` (INTEGER CHECK >=0), `fat_g` (INTEGER CHECK >=0), `carbs_g` (INTEGER CHECK >=0), `cube_tags` (TEXT[]), `dietary_tags` (TEXT[]), `servings_default` (INTEGER CHECK >0), `is_published` (BOOLEAN DEFAULT false), `created_at`, `updated_at`.
     - `recipe_ingredients` table must have: `id` (UUID default gen_random_uuid()), `recipe_id` (UUID references recipes ON DELETE CASCADE), `quantity` (NUMERIC(10,1) CHECK >=0.0), `unit` (TEXT), `name` (TEXT NOT NULL), `notes` (TEXT), `position` (INTEGER CHECK >=0).
     - `recipe_steps` table must have: `id` (UUID default gen_random_uuid()), `recipe_id` (UUID references recipes ON DELETE CASCADE), `step_number` (INTEGER CHECK >0), `description` (TEXT NOT NULL), `video_url` (TEXT), `timer_seconds` (INTEGER CHECK >=0), `tip` (TEXT), and a DEFERRABLE INITIALLY DEFERRED unique constraint on `(recipe_id, step_number)`.
     - Trigger `handle_new_user()` on `auth.users` insert must populate `user_profiles` correctly, including defaults for `onboarding_survey` and `sauce_log` from `NEW.raw_user_meta_data`, even if metadata is missing or JSON null.
     - Apply GIN indexes on `recipes` (`cube_tags`, `dietary_tags`, and full-text search) and `user_profiles` (full-text search).
     - Configure Row Level Security (RLS) policies for all tables. For `recipes`, `recipe_ingredients`, and `recipe_steps`, select is allowed if `is_published` is true or user role is `cms_editor`. For `user_profiles`, users can select, insert, and update their own profiles.
     - Triggers to automatically update `updated_at` on modification.

2. Clean up and rewrite `/home/freya/supersauced/docs/api_spec.md`, `/home/freya/supersauced/docs/content_workflow.md`, and `/home/freya/supersauced/docs/auth_integration.md` (and optionally `/home/freya/supersauced/docs/analysis_summary.md`) to:
   - Remove all ANSI escape codes, edit glitches, and broken sentences.
   - Format them professionally as complete, clean Markdown documentation files.
   - Align the documented triggers and examples with the actual schema in `schema.sql` (e.g. document `handle_new_user` instead of `sync_user_profile`, use the correct column names like `position` instead of `sort_order` or `name` instead of `ingredient`).

3. Run the database verification script `/home/freya/supersauced/docs/verify_schema.sh` to compile the schema and run all functional, adversarial, and stress validation tests. Ensure it passes completely with output "SUCCESS: Database Schema Verification Passed".

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report back when you are finished, including the command you ran and the exact verification outputs in your handoff.
