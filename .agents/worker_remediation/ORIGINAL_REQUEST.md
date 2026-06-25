## 2026-06-24T16:46:40Z
You are a teamwork_preview_worker. Your working directory is `/home/freya/supersauced/.agents/worker_remediation`.

Your task is to remediate specific findings from the Victory Audit failure:

1. **Update `docs/api_spec.yaml`**:
   - Review the database schema in `docs/schema.sql` (e.g., UUID IDs, etc.).
   - Rewrite the OpenAPI schema models (`UserProfile`, `Recipe`, `RecipeIngredient`, `RecipeStep`) in `docs/api_spec.yaml` to ensure they are complete and use the correct UUID data types for keys, as well as including all matching columns from the DDL schema (such as `email`, `onboarding_survey`, `sauce_log`, `difficulty`, `cook_time_minutes`, `calories_per_serving`, `protein_g`, `fat_g`, `carbs_g`, `cube_tags`, `dietary_tags`, `servings_default`, `is_published`, `created_at`, `updated_at`, `notes`, `position`, `step_number`, `description`, `video_url`, `timer_seconds`, `tip`, etc.). No placeholder schema objects or incomplete data types are allowed.

2. **Expand `docs/api_spec.md`**:
   - The file is currently too brief (only 43 lines). You must expand it to include the full PostgREST/Supabase API specifications and query patterns.
   - You must include complete, professional TypeScript/Supabase SDK code snippets for:
     - Fetching the recipe library with filtering (e.g. searching/filtering by `cube_tags` and `dietary_tags` arrays using `.contains` or `.overlaps` filters).
     - Fetching a recipe, its steps, and its ingredients in a single network request (solving the N+1 query problem) using Supabase resource embedding:
       ```typescript
       const { data, error } = await supabase
         .from('recipes')
         .select('*, recipe_steps(*), recipe_ingredients(*)')
         .eq('id', recipeId)
         .single();
       ```
     - Syncing/toggling saved states/likes for recipes. Since the database schema has a `user_profiles` table, describe the clean query pattern to toggle saved recipes (either using a join table or updates to a jsonb array field, or as a general pattern).

3. **Remediate `docs/auth_integration.md`**:
   - The audit failed because the document contains Swift iOS native keychain code instead of recommending and documenting the use of `expo-secure-store` for React Native as required by the acceptance criteria.
   - Rewrite the secure token storage section to recommend, document, and show TypeScript code snippets using `expo-secure-store` (from the Expo ecosystem) for React Native session token storage and lifecycle management. Remove the native Swift iOS keychain code or mark it as an alternative while elevating `expo-secure-store` as the primary standard.

4. **Verify Database Schema**:
   - Run the verification script:
     `bash docs/verify_schema.sh`
     Ensure that everything compiles and passes all functional, adversarial, and challenger stress test suites successfully.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report back when you are finished, including the command you ran and the exact verification outputs in your handoff.
