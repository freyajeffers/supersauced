## 2026-06-23T21:24:23Z
You are a worker agent. Your working directory is `/home/freya/supersauced/.agents/worker_m1_1`.
Your parent is `/home/freya/supersauced/.agents/sub_orch_m1_db_schema`.

You must implement the Supabase/PostgreSQL 16+ relational database schema, GIN indexes, RLS policies, and triggers in `/home/freya/supersauced/docs/schema.sql` based on the recommendations from the explorers.

Key instructions:
1. Write the schema to `/home/freya/supersauced/docs/schema.sql`.
2. Create standard mock setup for `auth` schema and `auth.users` table at the very beginning of the script so it compiles cleanly on a fresh database instance.
3. Implement `public.user_profiles` table:
   - Primary key `id UUID REFERENCES auth.users(id) ON DELETE CASCADE`.
   - Fields: `onboarding_survey` JSONB NOT NULL DEFAULT '{}'::jsonb, `sauce_log` JSONB NOT NULL DEFAULT '{}'::jsonb.
   - `created_at` and `updated_at` timestamps.
4. Implement `public.recipes` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
   - Fields matching PRD: title, slug (unique), description, hero_image_url, servings_default, cook_time_minutes, difficulty (1-3), calories_per_serving, protein_g, fat_g, carbs_g, cube_tags (text[]), dietary_tags (text[]), is_published (boolean).
   - `created_at` and `updated_at` timestamps.
5. Implement `public.recipe_ingredients` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
   - Fields: recipe_id (REFERENCES public.recipes ON DELETE CASCADE), quantity NUMERIC(10,1), unit, name, notes, position (int).
   - `created_at` and `updated_at` timestamps.
6. Implement `public.recipe_steps` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
   - Fields: recipe_id (REFERENCES public.recipes ON DELETE CASCADE), step_number (int), description, video_url, timer_seconds (int), tip.
   - Unique constraint: `UNIQUE (recipe_id, step_number)`.
   - `created_at` and `updated_at` timestamps.
7. Set up `BEFORE UPDATE` trigger function and triggers for all tables to update `updated_at` to current timestamp.
8. Create GIN indexes on `recipes.cube_tags` and `recipes.dietary_tags`.
9. Enable RLS on all tables and implement policies:
   - Owner-only SELECT/INSERT/UPDATE/DELETE access to `user_profiles` (`auth.uid() = id`).
   - Public read-only SELECT access to `recipes`, `recipe_ingredients`, and `recipe_steps` ONLY if `recipes.is_published = true` (using EXISTS subqueries for ingredients and steps).
10. Implement `public.handle_new_user()` trigger function:
    - Runs `SECURITY DEFINER` and `SET search_path = public`.
    - Inserts a new profile when a user signs up.
    - COALESCE raw_user_meta_data fields.
    - Set trigger `AFTER INSERT ON auth.users`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please compile, test, and write your handoff report when complete. Send a completion message to your parent.
