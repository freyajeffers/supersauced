-- 20240704_dietary_tags_and_scaler.sql - Optimize recipe schema and implement native serving scaler

-- 1. Alter public.recipes to include dietary_tags and cube_tags array columns
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS cube_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- 2. Create GIN indexes for lightning fast filtering
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);

-- 3. Drop the old recipe_categories table as it is no longer needed
DROP TABLE IF EXISTS public.recipe_categories CASCADE;

-- 4. Create database RPC for serving size calculations
CREATE OR REPLACE FUNCTION public.scale_recipe_servings(
    p_recipe_id UUID,
    p_target_servings INT
)
RETURNS TABLE (
    recipe_id UUID,
    recipe_title VARCHAR(255),
    recipe_description TEXT,
    recipe_status VARCHAR(50),
    recipe_published_at TIMESTAMPTZ,
    dietary_tags TEXT[],
    cube_tags TEXT[],
    target_servings INT,
    original_servings INT,
    ingredient_id UUID,
    ingredient_name VARCHAR(255),
    unit_id UUID,
    unit_name VARCHAR(100),
    unit_abbreviation VARCHAR(20),
    quantity_decimal DECIMAL(10,2),
    scaled_quantity DECIMAL(10,2),
    preparation_state VARCHAR(255)
) AS $$
DECLARE
    v_original_servings INT;
BEGIN
    -- Fetch original servings from recipe_metrics
    SELECT m.servings INTO v_original_servings
    FROM public.recipe_metrics m
    WHERE m.recipe_id = p_recipe_id;

    -- Avoid database-level integer division and division-by-zero errors
    v_original_servings := COALESCE(NULLIF(v_original_servings, 0), 1);

    -- Return recipe metadata combined with dynamically scaled ingredients
    RETURN QUERY
    SELECT 
        r.id AS recipe_id,
        r.title AS recipe_title,
        r.description AS recipe_description,
        r.status AS recipe_status,
        r.published_at AS recipe_published_at,
        r.dietary_tags,
        r.cube_tags,
        p_target_servings AS target_servings,
        v_original_servings AS original_servings,
        ri.ingredient_id,
        i.name AS ingredient_name,
        ri.unit_id,
        u.name AS unit_name,
        u.abbreviation AS unit_abbreviation,
        ri.quantity_decimal,
        -- Round the calculated decimal to 2 decimal places and cast appropriately
        CAST(ROUND(((p_target_servings::NUMERIC / v_original_servings::NUMERIC) * ri.quantity_decimal), 2) AS DECIMAL(10,2)) AS scaled_quantity,
        ri.preparation_state
    FROM public.recipes r
    JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    LEFT JOIN public.units u ON u.id = ri.unit_id
    WHERE r.id = p_recipe_id;
END;
$$ LANGUAGE plpgsql;
