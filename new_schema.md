@agent We need to optimize our Super Sauced PostgreSQL schema to hit our "Speed to Meal" goal (finding a dinner in under 30 seconds). We need lightning-fast filtering and native backend math for dynamic serving sizes.

Please use the Supabase MCP to generate and execute a SQL migration that accomplishes the following:

### 1. Refactor for GIN Indexes & Array Types (Fast Filtering)
To make cross-referencing tags instantly fast, we are moving away from relational join tables for recipe filtering. 
- Alter the `recipes` table to include two new columns: `dietary_tags TEXT[]` and `cube_tags TEXT[]`.
- Create `GIN` indexes on both of these array columns so our app's search filters are lightning-fast.
- (Optional) Drop the old `recipe_categories` join table if it is no longer needed for filtering.

### 2. Strict Separation for Dynamic Serving Math
Ensure our tables are strictly split into `recipes`, `recipe_ingredients`, and `instruction_steps`. 
- Verify that `recipe_ingredients` has precise numeric columns (`quantity_decimal`, `base_servings` or rely on `recipes.servings`) so we can scale them.
- Create a Postgres RPC (Stored Procedure) named `scale_recipe_servings`. 
  - It should accept `p_recipe_id UUID` and `p_target_servings INT`.
  - It should return the recipe data, but natively calculate and return the scaled ingredient quantities `(target_servings / original_servings) * quantity_decimal` directly from the backend.

### 3. Execution & Types
- Execute this SQL migration against the database.
- After the database is updated, regenerate our frontend TypeScript interfaces to reflect the new `TEXT[]` array types and the expected return type of the `scale_recipe_servings` RPC.
