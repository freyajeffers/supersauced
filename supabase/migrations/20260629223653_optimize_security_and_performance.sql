-- =========================================================================
-- SUPABASE & POSTGRES DATABASE REMEDIATION SCRIPT (FIXED POSTGRES SYNTAX)
-- =========================================================================

-- -------------------------------------------------------------------------
-- Category 1: Lock Down Function Search Paths & Execute Privileges
-- -------------------------------------------------------------------------

-- 1.1 Secure public.create_test_user
CREATE OR REPLACE FUNCTION public.create_test_user(p_id UUID, p_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, email_confirmed_at)
    VALUES (p_id, p_email, jsonb_build_object('email', p_email), 'authenticated', 'authenticated', now())
    ON CONFLICT (id) DO UPDATE SET email = p_email;
END;
$$;

-- Revoke all public execution rights from create_test_user
REVOKE EXECUTE ON FUNCTION public.create_test_user(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_test_user(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_test_user(UUID, TEXT) TO service_role;


-- 1.2 Secure public.add_recipe_to_shopping_list
CREATE OR REPLACE FUNCTION public.add_recipe_to_shopping_list(
    p_user_id   UUID,
    p_recipe_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_list_id   UUID;
    rec         RECORD;
BEGIN
    -- Security check: Ensure calling user can only manage their own list
    IF p_user_id <> (SELECT auth.uid()) AND ((SELECT auth.jwt()) ->> 'role') NOT IN ('admin', 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Find or create a shopping list for the user
    SELECT id INTO v_list_id FROM shopping_lists WHERE user_id = p_user_id LIMIT 1;
    IF v_list_id IS NULL THEN
        INSERT INTO shopping_lists (user_id, name) VALUES (p_user_id, 'My Shopping List') RETURNING id INTO v_list_id;
    END IF;

    -- Upsert each ingredient
    FOR rec IN SELECT ingredient_id, quantity_decimal, unit_id FROM recipe_ingredients WHERE recipe_id = p_recipe_id LOOP
        INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit_id)
            VALUES (v_list_id, rec.ingredient_id, rec.quantity_decimal, rec.unit_id)
        ON CONFLICT (shopping_list_id, ingredient_id, unit_id)
        DO UPDATE SET quantity = shopping_list_items.quantity + EXCLUDED.quantity;
    END LOOP;
END;
$$;


-- 1.3 Secure public.consolidate_shopping_list
CREATE OR REPLACE FUNCTION public.consolidate_shopping_list(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_list_id UUID;
BEGIN
    -- Security check: Ensure calling user can only manage their own list
    IF p_user_id <> (SELECT auth.uid()) AND ((SELECT auth.jwt()) ->> 'role') NOT IN ('admin', 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT id INTO v_list_id FROM shopping_lists WHERE user_id = p_user_id LIMIT 1;
    IF v_list_id IS NULL THEN
        RETURN; -- nothing to consolidate
    END IF;

    WITH summed AS (
        SELECT ingredient_id, unit_id, SUM(quantity) AS qty
        FROM shopping_list_items
        WHERE shopping_list_id = v_list_id
        GROUP BY ingredient_id, unit_id
    )
    DELETE FROM shopping_list_items WHERE shopping_list_id = v_list_id;

    INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit_id)
    SELECT v_list_id, ingredient_id, qty, unit_id FROM summed;
END;
$$;


-- 1.4 Secure public.refresh_recipe_details_materialized (Trigger Function)
CREATE OR REPLACE FUNCTION public.refresh_recipe_details_materialized()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.recipe_details_materialized;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Revoke public execution rights from the trigger function to prevent RPC bypass
REVOKE EXECUTE ON FUNCTION public.refresh_recipe_details_materialized() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_recipe_details_materialized() FROM anon, authenticated;


-- 1.5 Secure public.scale_recipe_servings
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
) LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
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
        CAST(ROUND(((p_target_servings::NUMERIC / v_original_servings::NUMERIC) * ri.quantity_decimal), 2) AS DECIMAL(10,2)) AS scaled_quantity,
        ri.preparation_state
    FROM public.recipes r
    JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    LEFT JOIN public.units u ON u.id = ri.unit_id
    WHERE r.id = p_recipe_id;
END;
$$;


-- -------------------------------------------------------------------------
-- Category 2: Secure Exposed Materialized Views
-- -------------------------------------------------------------------------

-- Revoke raw public API access to the pre-computed materialized cache view
REVOKE SELECT ON public.recipe_details_materialized FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recipe_details_materialized TO service_role;

-- Re-expose recipe details through a secure, high-performance regular view with embedded auth checks
CREATE OR REPLACE VIEW public.recipe_details AS
SELECT * 
FROM public.recipe_details_materialized
WHERE status = 'published' OR author_id = (SELECT auth.uid());

GRANT SELECT ON public.recipe_details TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------
-- Category 3: Cover Unindexed Foreign Keys
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_unit_id 
ON public.shopping_list_items(unit_id);


-- -------------------------------------------------------------------------
-- Category 4: Optimize Row-Level Security Policies (Subquery Caching + Non-Overlap)
-- -------------------------------------------------------------------------

-- 4.1 user_profiles
DROP POLICY IF EXISTS "users can view own profile" ON public.user_profiles;
CREATE POLICY "users can view own profile" ON public.user_profiles
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users can update own profile" ON public.user_profiles;
CREATE POLICY "users can update own profile" ON public.user_profiles
    FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow insert own profile" ON public.user_profiles;
CREATE POLICY "Allow insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow delete own profile" ON public.user_profiles;
CREATE POLICY "Allow delete own profile" ON public.user_profiles
    FOR DELETE USING ((SELECT auth.uid()) = user_id);


-- 4.2 user_settings
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);


-- 4.3 user_dietary_prefs
DROP POLICY IF EXISTS "Users can manage own dietary prefs" ON public.user_dietary_prefs;
CREATE POLICY "Users can manage own dietary prefs" ON public.user_dietary_prefs
    FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);


-- 4.4 saved_recipes
DROP POLICY IF EXISTS "Allow select own saved recipes" ON public.saved_recipes;
CREATE POLICY "Allow select own saved recipes" ON public.saved_recipes
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow insert own saved recipes" ON public.saved_recipes;
CREATE POLICY "Allow insert own saved recipes" ON public.saved_recipes
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow update own saved recipes" ON public.saved_recipes;
CREATE POLICY "Allow update own saved recipes" ON public.saved_recipes
    FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow delete own saved recipes" ON public.saved_recipes;
CREATE POLICY "Allow delete own saved recipes" ON public.saved_recipes
    FOR DELETE USING ((SELECT auth.uid()) = user_id);


-- 4.5 shopping_lists
DROP POLICY IF EXISTS shopping_lists_user_isolation ON public.shopping_lists;
CREATE POLICY shopping_lists_user_isolation ON public.shopping_lists
    FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));


-- 4.6 shopping_list_items
DROP POLICY IF EXISTS shopping_items_user_isolation ON public.shopping_list_items;
CREATE POLICY shopping_items_user_isolation ON public.shopping_list_items
    FOR ALL USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE user_id = (SELECT auth.uid())))
    WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE user_id = (SELECT auth.uid())));


-- 4.7 recipes
DROP POLICY IF EXISTS recipes_cms_editor_write ON public.recipes;
DROP POLICY IF EXISTS recipes_cms_editor_write_insert ON public.recipes;
DROP POLICY IF EXISTS recipes_cms_editor_write_update ON public.recipes;
DROP POLICY IF EXISTS recipes_cms_editor_write_delete ON public.recipes;

CREATE POLICY recipes_cms_editor_write_insert ON public.recipes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = author_id);
CREATE POLICY recipes_cms_editor_write_update ON public.recipes
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = author_id) WITH CHECK ((SELECT auth.uid()) = author_id);
CREATE POLICY recipes_cms_editor_write_delete ON public.recipes
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = author_id);


-- 4.8 recipe_metrics
DROP POLICY IF EXISTS recipe_metrics_cms_editor_write ON public.recipe_metrics;
DROP POLICY IF EXISTS recipe_metrics_cms_editor_write_insert ON public.recipe_metrics;
DROP POLICY IF EXISTS recipe_metrics_cms_editor_write_update ON public.recipe_metrics;
DROP POLICY IF EXISTS recipe_metrics_cms_editor_write_delete ON public.recipe_metrics;

CREATE POLICY recipe_metrics_cms_editor_write_insert ON public.recipe_metrics
    FOR INSERT TO authenticated WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY recipe_metrics_cms_editor_write_update ON public.recipe_metrics
    FOR UPDATE TO authenticated USING (recipe_id IN (SELECT id FROM recipes WHERE author_id = (SELECT auth.uid()))) WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY recipe_metrics_cms_editor_write_delete ON public.recipe_metrics
    FOR DELETE TO authenticated USING (recipe_id IN (SELECT id FROM recipes WHERE author_id = (SELECT auth.uid())));


-- 4.9 Recipe nested components (Resolve FOR ALL select overlap)

-- recipe_ingredients
DROP POLICY IF EXISTS "Author can manage recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Author can manage recipe ingredients_insert" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Author can manage recipe ingredients_update" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Author can manage recipe ingredients_delete" ON public.recipe_ingredients;

CREATE POLICY "Author can manage recipe ingredients_insert" ON public.recipe_ingredients
    FOR INSERT TO authenticated WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage recipe ingredients_update" ON public.recipe_ingredients
    FOR UPDATE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))) WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage recipe ingredients_delete" ON public.recipe_ingredients
    FOR DELETE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));

-- recipe_products
DROP POLICY IF EXISTS "Author can manage recipe products" ON public.recipe_products;
DROP POLICY IF EXISTS "Author can manage recipe products_insert" ON public.recipe_products;
DROP POLICY IF EXISTS "Author can manage recipe products_update" ON public.recipe_products;
DROP POLICY IF EXISTS "Author can manage recipe products_delete" ON public.recipe_products;

CREATE POLICY "Author can manage recipe products_insert" ON public.recipe_products
    FOR INSERT TO authenticated WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage recipe products_update" ON public.recipe_products
    FOR UPDATE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))) WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage recipe products_delete" ON public.recipe_products
    FOR DELETE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));

-- instruction_steps
DROP POLICY IF EXISTS "Author can manage instruction steps" ON public.instruction_steps;
DROP POLICY IF EXISTS "Author can manage instruction steps_insert" ON public.instruction_steps;
DROP POLICY IF EXISTS "Author can manage instruction steps_update" ON public.instruction_steps;
DROP POLICY IF EXISTS "Author can manage instruction steps_delete" ON public.instruction_steps;

CREATE POLICY "Author can manage instruction steps_insert" ON public.instruction_steps
    FOR INSERT TO authenticated WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage instruction steps_update" ON public.instruction_steps
    FOR UPDATE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))) WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));
CREATE POLICY "Author can manage instruction steps_delete" ON public.instruction_steps
    FOR DELETE TO authenticated USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())));

-- step_media
DROP POLICY IF EXISTS "Author can manage step media" ON public.step_media;
DROP POLICY IF EXISTS "Author can manage step media_insert" ON public.step_media;
DROP POLICY IF EXISTS "Author can manage step media_update" ON public.step_media;
DROP POLICY IF EXISTS "Author can manage step media_delete" ON public.step_media;

CREATE POLICY "Author can manage step media_insert" ON public.step_media
    FOR INSERT TO authenticated WITH CHECK (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))));
CREATE POLICY "Author can manage step media_update" ON public.step_media
    FOR UPDATE TO authenticated USING (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid())))) WITH CHECK (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))));
CREATE POLICY "Author can manage step media_delete" ON public.step_media
    FOR DELETE TO authenticated USING (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = (SELECT auth.uid()))));


-- 4.10 Reference Data (Resolve FOR ALL select overlap and optimize JWT queries)

-- dietary_tags
DROP POLICY IF EXISTS "Admin and CMS editor can manage dietary tags" ON public.dietary_tags;
DROP POLICY IF EXISTS "Admin and CMS editor can manage dietary tags_insert" ON public.dietary_tags;
DROP POLICY IF EXISTS "Admin and CMS editor can manage dietary tags_update" ON public.dietary_tags;
DROP POLICY IF EXISTS "Admin and CMS editor can manage dietary tags_delete" ON public.dietary_tags;

CREATE POLICY "Admin and CMS editor can manage dietary tags_insert" ON public.dietary_tags
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage dietary tags_update" ON public.dietary_tags
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage dietary tags_delete" ON public.dietary_tags
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- categories
DROP POLICY IF EXISTS "Admin and CMS editor can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Admin and CMS editor can manage categories_insert" ON public.categories;
DROP POLICY IF EXISTS "Admin and CMS editor can manage categories_update" ON public.categories;
DROP POLICY IF EXISTS "Admin and CMS editor can manage categories_delete" ON public.categories;

CREATE POLICY "Admin and CMS editor can manage categories_insert" ON public.categories
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage categories_update" ON public.categories
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage categories_delete" ON public.categories
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- units
DROP POLICY IF EXISTS "Admin and CMS editor can manage units" ON public.units;
DROP POLICY IF EXISTS "Admin and CMS editor can manage units_insert" ON public.units;
DROP POLICY IF EXISTS "Admin and CMS editor can manage units_update" ON public.units;
DROP POLICY IF EXISTS "Admin and CMS editor can manage units_delete" ON public.units;

CREATE POLICY "Admin and CMS editor can manage units_insert" ON public.units
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage units_update" ON public.units
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage units_delete" ON public.units
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- ingredients
DROP POLICY IF EXISTS "Admin and CMS editor can manage ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admin and CMS editor can manage ingredients_insert" ON public.ingredients;
DROP POLICY IF EXISTS "Admin and CMS editor can manage ingredients_update" ON public.ingredients;
DROP POLICY IF EXISTS "Admin and CMS editor can manage ingredients_delete" ON public.ingredients;

CREATE POLICY "Admin and CMS editor can manage ingredients_insert" ON public.ingredients
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage ingredients_update" ON public.ingredients
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage ingredients_delete" ON public.ingredients
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- products
DROP POLICY IF EXISTS "Admin and CMS editor can manage products" ON public.products;
DROP POLICY IF EXISTS "Admin and CMS editor can manage products_insert" ON public.products;
DROP POLICY IF EXISTS "Admin and CMS editor can manage products_update" ON public.products;
DROP POLICY IF EXISTS "Admin and CMS editor can manage products_delete" ON public.products;

CREATE POLICY "Admin and CMS editor can manage products_insert" ON public.products
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage products_update" ON public.products
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage products_delete" ON public.products
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- product_nutrition
DROP POLICY IF EXISTS "Admin and CMS editor can manage product nutrition" ON public.product_nutrition;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product nutrition_insert" ON public.product_nutrition;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product nutrition_update" ON public.product_nutrition;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product nutrition_delete" ON public.product_nutrition;

CREATE POLICY "Admin and CMS editor can manage product nutrition_insert" ON public.product_nutrition
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage product nutrition_update" ON public.product_nutrition
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage product nutrition_delete" ON public.product_nutrition
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));

-- product_media
DROP POLICY IF EXISTS "Admin and CMS editor can manage product media" ON public.product_media;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product media_insert" ON public.product_media;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product media_update" ON public.product_media;
DROP POLICY IF EXISTS "Admin and CMS editor can manage product media_delete" ON public.product_media;

CREATE POLICY "Admin and CMS editor can manage product media_insert" ON public.product_media
    FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage product media_update" ON public.product_media
    FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin')) WITH CHECK (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));
CREATE POLICY "Admin and CMS editor can manage product media_delete" ON public.product_media
    FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> 'role') IN ('cms_editor', 'admin'));


