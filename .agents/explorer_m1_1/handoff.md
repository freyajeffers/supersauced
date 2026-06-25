# Handoff Report - Database Schema & RLS Design (Milestone 1)

## 1. Observation
We observed and extracted the following directives:
- **`SCOPE.md` lines 11-22**: Mentions core tables `public.user_profiles`, `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps`. Demands cascading deletes, numeric precision for quantities, GIN indexes, and sign-up trigger functionality.
- **`ORIGINAL_REQUEST.md` line 10**: "Define, implement, and verify the Supabase/PostgreSQL 16+ relational database schema, GIN indexes, RLS policies, and triggers in `/home/freya/supersauced/docs/schema.sql`."
- **`PRD_Mobile Recipe App_B2C.txt` line 315**: Spec for fields:
  - Recipes: `title`, `slug`, `description`, `hero_image_url`, `servings_default`, `cook_time_minutes`, `difficulty (1-3)`, `calories_per_serving`, `protein_g`, `fat_g`, `carbs_g`, `cube_tags[]`, `dietary_tags[]`, `is_published`.
  - RecipeStep: `step_number`, `description`, `video_url (Cloudinary MP4)`, `timer_seconds (nullable)`, `tip (nullable)`.
  - RecipeIngredient: `quantity (decimal)`, `unit`, `name`, `notes`.
- **`PRD_Mobile Recipe App_B2C.txt` line 208**:
  - `public.user_profiles`: Stores `user_id` (primary key mapped to `auth.users.id`), `onboarding_survey` (dietary preferences, discovery channel) and `sauce_log` to track cube inventory.
- **`SCOPE.md` lines 30-36**:
  - Requires `auth.users` insert trigger invoking `public.handle_new_user()`.
  - Requires cascading deletes: profile mapped to `auth.users(id) ON DELETE CASCADE`; ingredients/steps mapped to `recipes(id) ON DELETE CASCADE`.

## 2. Logic Chain
- **User Profiles Schema**: Mapping the profile identifier `id` as both a Primary Key and Foreign Key to `auth.users(id) ON DELETE CASCADE` satisfies the requirement that a user profile is automatically garbage-collected when the parent user is deleted.
- **Automatic Profile Trigger**: A database trigger function `public.handle_new_user()` bound `AFTER INSERT ON auth.users` guarantees that a profile is created in the same transaction. Using `SECURITY DEFINER` and `SET search_path = public` prevents RLS blockers and guards against search-path hijacking attacks. Extracting default preferences from `raw_user_meta_data` via `COALESCE` allows metadata passing during signup.
- **Decimal Precision**: Regular floats are approximate and represent numbers like `0.3` as `0.30000001`. Using `NUMERIC(10,1)` for recipe ingredient quantities guarantees precise decimal storage, avoiding UI glitches during ingredient scaling.
- **Fast Filter Indexes**: A GIN index on `cube_tags` and `dietary_tags` stores inverted references to array elements, enabling log-time search queries for array contains (`@>`) and overlap (`&&`) operations, supporting the goal of finding a recipe in under 30 seconds.
- **RLS Policies**:
  - Enforcing `auth.uid() = id` on `public.user_profiles` isolates customer data.
  - Adding SELECT policies restricting public reads of recipes, steps, and ingredients to rows where the parent recipe has `is_published = true` prevents clients from reading draft content.
  - Directus CMS and database workers bypass policies automatically via Superuser rights or the `service_role` credential.

## 3. Caveats
- **Offline Syncing**: The current database design assumes online client connectivity. Storing saved states or log updates offline and syncing them later must be handled on the client or in a future phase.
- **Directus Schema Alterations**: Directus interfaces directly with the schema. Content managers must be restricted from deleting columns or altering datatypes directly in production.
- **Sequential Steps**: The design recommends a composite unique constraint on `(recipe_id, step_number)` to enforce sequential ordering. If content managers frequently reorder steps, step numbers may need to be updated concurrently (using deferred constraints) to prevent violation conflicts.

## 4. Conclusion
The proposed database schema, DDL structure, GIN indexes, RLS policies, and trigger logic satisfy all requirements for Milestone 1. It provides a robust, secure foundation for subsequent work.

## 5. Verification Method
1. **DDL Syntax Check**: Run the DDL code in a PostgreSQL 16 local environment (or Supabase local CLI using `supabase db start`). Confirm all tables, indexes, triggers, and policies compile successfully.
2. **Trigger Test**: Run an INSERT on `auth.users` and check that a corresponding row in `public.user_profiles` is created.
3. **RLS Test**: Assert that a SELECT request as an anonymous/authenticated user returns only rows where `is_published = true`, and check that accessing another user's profile UUID is blocked.
4. **Index Verification**: Run `EXPLAIN ANALYZE` on tag filters to verify that `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` are used via bitmap index scans.
