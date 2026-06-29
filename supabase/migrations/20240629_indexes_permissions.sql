-- Add covering indexes for all unindexed foreign keys in the core schema
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_default_unit_id ON public.ingredients(default_unit_id);
CREATE INDEX IF NOT EXISTS idx_instruction_steps_recipe_id ON public.instruction_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_media_media_id ON public.product_media(media_id);
CREATE INDEX IF NOT EXISTS idx_product_media_product_id ON public.product_media(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_categories_category_id ON public.recipe_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id ON public.recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_unit_id ON public.recipe_ingredients(unit_id);
CREATE INDEX IF NOT EXISTS idx_recipe_products_product_id ON public.recipe_products(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_products_recipe_id ON public.recipe_products(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_author_id ON public.recipes(author_id);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_recipe_id ON public.saved_recipes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_ingredient_id ON public.shopping_list_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_product_id ON public.shopping_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_shopping_list_id ON public.shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON public.shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_step_media_media_id ON public.step_media(media_id);
CREATE INDEX IF NOT EXISTS idx_user_dietary_prefs_dietary_tag_id ON public.user_dietary_prefs(dietary_tag_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_avatar_media_id ON public.user_profiles(avatar_media_id);

-- Enable RLS on saved_recipes
ALTER TABLE public.saved_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select own saved recipes" ON public.saved_recipes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow insert own saved recipes" ON public.saved_recipes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update own saved recipes" ON public.saved_recipes
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete own saved recipes" ON public.saved_recipes
    FOR DELETE USING (auth.uid() = user_id);

-- user_profiles additional policies (Insert/Delete)
CREATE POLICY "Allow insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete own profile" ON public.user_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- SECURITY DEFINER function to create/upsert auth users for test seeding
CREATE OR REPLACE FUNCTION public.create_test_user(p_id UUID, p_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, email_confirmed_at)
    VALUES (p_id, p_email, jsonb_build_object('email', p_email), 'authenticated', 'authenticated', now())
    ON CONFLICT (id) DO UPDATE SET email = p_email;
END;
$$;

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on all public tables to API roles
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant usage on all public sequences to API roles
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant execute on all public functions to API roles
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables, sequences, and functions automatically get these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
