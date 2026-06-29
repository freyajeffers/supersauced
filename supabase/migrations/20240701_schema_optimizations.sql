-- 20240701_schema_optimizations.sql – Performance optimizations for Super Sauced database

-- 1. Targeted Cover/Unique Indexes
CREATE INDEX IF NOT EXISTS idx_recipes_slug ON public.recipes(slug);
CREATE INDEX IF NOT EXISTS idx_instruction_steps_recipe_id ON public.instruction_steps(recipe_id);

-- 2. Partial Index for Active Shopping List Items
-- Optimizes active shopping list views by filtering out items that are already checked off.
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_active 
ON public.shopping_list_items(shopping_list_id) 
WHERE is_checked_off = false;

-- 3. Full-Text Search on Recipes
-- Add a stored generated column to pre-compute the search vectors for recipe title and description.
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '')) || ' ' ||
    to_tsvector('english', coalesce(description, ''))
) STORED;

-- Add a GIN index on the generated search_vector column for ultra-fast full-text searches.
CREATE INDEX IF NOT EXISTS idx_recipes_search_vector 
ON public.recipes USING GIN(search_vector);

-- 4. Flattened Materialized View for Recipe Details
-- Aggregates recipe metadata, prep/cook metrics, nested ingredients, and steps in JSON arrays.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.recipe_details_materialized AS
SELECT
    r.id,
    r.author_id,
    r.title,
    r.slug,
    r.description,
    r.status,
    r.published_at,
    COALESCE(rm.prep_time_seconds, 0) AS prep_time_seconds,
    COALESCE(rm.cook_time_seconds, 0) AS cook_time_seconds,
    COALESCE(rm.servings, 1) AS servings,
    COALESCE(rm.difficulty_level, 'easy') AS difficulty_level,
    (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'recipe_ingredient_id', ri.id,
            'ingredient_id', ri.ingredient_id,
            'name', i.name,
            'quantity_decimal', ri.quantity_decimal,
            'quantity_numerator', ri.quantity_numerator,
            'quantity_denominator', ri.quantity_denominator,
            'unit_id', ri.unit_id,
            'unit_name', u.name,
            'unit_abbreviation', u.abbreviation,
            'preparation_state', ri.preparation_state
        ) ORDER BY ri.id), '[]'::jsonb)
        FROM public.recipe_ingredients ri
        JOIN public.ingredients i ON ri.ingredient_id = i.id
        LEFT JOIN public.units u ON ri.unit_id = u.id
        WHERE ri.recipe_id = r.id
    ) AS ingredients,
    (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'step_id', s.id,
            'step_number', s.step_number,
            'instruction_text', s.instruction_text,
            'is_active_cooking', s.is_active_cooking,
            'timer_seconds', s.timer_seconds
        ) ORDER BY s.step_number), '[]'::jsonb)
        FROM public.instruction_steps s
        WHERE s.recipe_id = r.id
    ) AS steps
FROM public.recipes r
LEFT JOIN public.recipe_metrics rm ON r.id = rm.recipe_id;

-- Unique indexes on the materialized view are required for CONCURRENT refresh support.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_details_materialized_id 
ON public.recipe_details_materialized(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_details_materialized_slug 
ON public.recipe_details_materialized(slug);

-- 5. Automatic Refresh Triggers for the Materialized View
-- We define a single trigger function to concurrently refresh the materialized view.
CREATE OR REPLACE FUNCTION public.refresh_recipe_details_materialized()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.recipe_details_materialized;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply AFTER statement-level triggers to all source tables, ensuring the cache is always fresh.
DROP TRIGGER IF EXISTS refresh_recipes_mv ON public.recipes;
CREATE TRIGGER refresh_recipes_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.recipes
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

DROP TRIGGER IF EXISTS refresh_recipe_metrics_mv ON public.recipe_metrics;
CREATE TRIGGER refresh_recipe_metrics_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.recipe_metrics
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

DROP TRIGGER IF EXISTS refresh_recipe_ingredients_mv ON public.recipe_ingredients;
CREATE TRIGGER refresh_recipe_ingredients_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.recipe_ingredients
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

DROP TRIGGER IF EXISTS refresh_instruction_steps_mv ON public.instruction_steps;
CREATE TRIGGER refresh_instruction_steps_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.instruction_steps
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

DROP TRIGGER IF EXISTS refresh_ingredients_mv ON public.ingredients;
CREATE TRIGGER refresh_ingredients_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.ingredients
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

DROP TRIGGER IF EXISTS refresh_units_mv ON public.units;
CREATE TRIGGER refresh_units_mv
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.units
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_recipe_details_materialized();

-- 6. Grant Permissions
-- Explicitly grant SELECT privilege on the materialized view to all API roles.
GRANT SELECT ON public.recipe_details_materialized TO anon, authenticated, service_role;
