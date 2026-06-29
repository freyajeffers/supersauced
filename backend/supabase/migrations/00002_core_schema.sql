-- 1. USER & IDENTITY DOMAIN
-- Note: In Supabase, the base user table is `auth.users`. 
-- We extend it here in the public schema.

CREATE TABLE public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_media_id UUID, -- FK added later after media_assets is created
    bio TEXT
);

CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    measurement_system VARCHAR(50) DEFAULT 'metric',
    push_notifications BOOLEAN DEFAULT false,
    newsletter BOOLEAN DEFAULT false
);

CREATE TABLE public.dietary_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    is_allergen BOOLEAN DEFAULT false
);

CREATE TABLE public.user_dietary_prefs (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    dietary_tag_id UUID REFERENCES public.dietary_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, dietary_tag_id)
);

-- 2. MEDIA DOMAIN (Cloudinary Integration)
CREATE TABLE public.media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloudinary_public_id VARCHAR(255) UNIQUE NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    resource_type VARCHAR(50) CHECK (resource_type IN ('image', 'video')),
    format VARCHAR(20)
);

-- Add the FK back to user_profiles now that media_assets exists
ALTER TABLE public.user_profiles 
ADD CONSTRAINT fk_avatar_media 
FOREIGN KEY (avatar_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;

-- 3. PRODUCT DOMAIN (Super Sauced Cubes)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flavor_profile VARCHAR(255),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE public.product_nutrition (
    product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    serving_size_grams DECIMAL(5,2),
    calories INT,
    protein_g DECIMAL(5,2),
    carbs_g DECIMAL(5,2),
    fat_g DECIMAL(5,2)
);

CREATE TABLE public.product_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    media_id UUID REFERENCES public.media_assets(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false
);

-- 4. RECIPE CORE DOMAIN
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    published_at TIMESTAMPTZ
);

CREATE TABLE public.recipe_metrics (
    recipe_id UUID PRIMARY KEY REFERENCES public.recipes(id) ON DELETE CASCADE,
    prep_time_seconds INT DEFAULT 0,
    cook_time_seconds INT DEFAULT 0,
    servings INT DEFAULT 1,
    difficulty_level VARCHAR(50)
);

CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE public.recipe_categories (
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
);

-- 5. RECIPE CONSTRUCTION (Ingredients & Units)
CREATE TABLE public.units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(20)
);

CREATE TABLE public.ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    default_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL
);

CREATE TABLE public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    quantity_decimal DECIMAL(10,2),
    quantity_numerator INT,
    quantity_denominator INT,
    preparation_state VARCHAR(255)
);

CREATE TABLE public.recipe_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2)
);

-- 6. INSTRUCTIONS
CREATE TABLE public.instruction_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    instruction_text TEXT NOT NULL,
    is_active_cooking BOOLEAN DEFAULT true,
    timer_seconds INT DEFAULT 0
);

CREATE TABLE public.step_media (
    step_id UUID REFERENCES public.instruction_steps(id) ON DELETE CASCADE,
    media_id UUID REFERENCES public.media_assets(id) ON DELETE CASCADE,
    PRIMARY KEY (step_id, media_id)
);

-- 7. USER ENGAGEMENT & SHOPPING
CREATE TABLE public.saved_recipes (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    collection_name VARCHAR(100) DEFAULT 'All',
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE public.shopping_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.shopping_list_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shopping_list_id UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2),
    is_checked_off BOOLEAN DEFAULT false
);
