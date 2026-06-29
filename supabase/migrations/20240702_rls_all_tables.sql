-- 20240702_rls_all_tables.sql – Enable Row Level Security (RLS) and define secure access control policies across all 15 remaining public tables

-- ==========================================
-- 1. Private User Data (Private Read/Write)
-- ==========================================

-- User Settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Dietary Preferences
ALTER TABLE public.user_dietary_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own dietary prefs" ON public.user_dietary_prefs;
CREATE POLICY "Users can manage own dietary prefs" ON public.user_dietary_prefs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ==========================================
-- 2. Recipe Sub-Components & Metadata (Public Read, Author Manage)
-- ==========================================

-- Recipe Categories
ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read recipe categories" ON public.recipe_categories;
CREATE POLICY "Public read recipe categories" ON public.recipe_categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author can manage recipe categories" ON public.recipe_categories;
CREATE POLICY "Author can manage recipe categories" ON public.recipe_categories
    FOR ALL TO authenticated 
    USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()))
    WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()));

-- Recipe Ingredients
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Public read recipe ingredients" ON public.recipe_ingredients
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author can manage recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Author can manage recipe ingredients" ON public.recipe_ingredients
    FOR ALL TO authenticated 
    USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()))
    WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()));

-- Recipe Products
ALTER TABLE public.recipe_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read recipe products" ON public.recipe_products;
CREATE POLICY "Public read recipe products" ON public.recipe_products
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author can manage recipe products" ON public.recipe_products;
CREATE POLICY "Author can manage recipe products" ON public.recipe_products
    FOR ALL TO authenticated 
    USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()))
    WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()));

-- Instruction Steps
ALTER TABLE public.instruction_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read instruction steps" ON public.instruction_steps;
CREATE POLICY "Public read instruction steps" ON public.instruction_steps
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author can manage instruction steps" ON public.instruction_steps;
CREATE POLICY "Author can manage instruction steps" ON public.instruction_steps
    FOR ALL TO authenticated 
    USING (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()))
    WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid()));

-- Step Media
ALTER TABLE public.step_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read step media" ON public.step_media;
CREATE POLICY "Public read step media" ON public.step_media
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author can manage step media" ON public.step_media;
CREATE POLICY "Author can manage step media" ON public.step_media
    FOR ALL TO authenticated 
    USING (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid())))
    WITH CHECK (step_id IN (SELECT id FROM public.instruction_steps WHERE recipe_id IN (SELECT id FROM public.recipes WHERE author_id = auth.uid())));


-- ==========================================
-- 3. Reference & Master Data (Public Read, Admin/Editor Write)
-- ==========================================

-- Dietary Tags
ALTER TABLE public.dietary_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read dietary tags" ON public.dietary_tags;
CREATE POLICY "Public read dietary tags" ON public.dietary_tags
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage dietary tags" ON public.dietary_tags;
CREATE POLICY "Admin and CMS editor can manage dietary tags" ON public.dietary_tags
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories" ON public.categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage categories" ON public.categories;
CREATE POLICY "Admin and CMS editor can manage categories" ON public.categories
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Units
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read units" ON public.units;
CREATE POLICY "Public read units" ON public.units
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage units" ON public.units;
CREATE POLICY "Admin and CMS editor can manage units" ON public.units
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Ingredients
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ingredients" ON public.ingredients;
CREATE POLICY "Public read ingredients" ON public.ingredients
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage ingredients" ON public.ingredients;
CREATE POLICY "Admin and CMS editor can manage ingredients" ON public.ingredients
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read products" ON public.products;
CREATE POLICY "Public read products" ON public.products
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage products" ON public.products;
CREATE POLICY "Admin and CMS editor can manage products" ON public.products
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Product Nutrition
ALTER TABLE public.product_nutrition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product nutrition" ON public.product_nutrition;
CREATE POLICY "Public read product nutrition" ON public.product_nutrition
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage product nutrition" ON public.product_nutrition;
CREATE POLICY "Admin and CMS editor can manage product nutrition" ON public.product_nutrition
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));

-- Product Media
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product media" ON public.product_media;
CREATE POLICY "Public read product media" ON public.product_media
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage product media" ON public.product_media;
CREATE POLICY "Admin and CMS editor can manage product media" ON public.product_media
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));


-- ==========================================
-- 4. Media Assets (Public Read, Authenticated Create, Admin Manage)
-- ==========================================

-- Media Assets
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read media assets" ON public.media_assets;
CREATE POLICY "Public read media assets" ON public.media_assets
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated user can insert media assets" ON public.media_assets;
CREATE POLICY "Authenticated user can insert media assets" ON public.media_assets
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admin and CMS editor can manage media assets" ON public.media_assets;
CREATE POLICY "Admin and CMS editor can manage media assets" ON public.media_assets
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('cms_editor', 'admin'));
