CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users table for validation
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    raw_user_meta_data JSONB
);

-- Original project schema (copied from docs/schema.sql, line numbers removed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 1. user_profiles table (one-to-one with auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    onboarding_survey JSONB NOT NULL DEFAULT '{}'::jsonb,
    sauce_log JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    hero_image_url TEXT,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    cook_time_minutes INTEGER CHECK (cook_time_minutes >= 0),
    calories_per_serving INTEGER CHECK (calories_per_serving >= 0),
    protein_g INTEGER CHECK (protein_g >= 0),
    fat_g INTEGER CHECK (fat_g >= 0),
    carbs_g INTEGER CHECK (carbs_g >= 0),
    cube_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    dietary_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    servings_default INTEGER CHECK (servings_default > 0),
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. recipe_ingredients table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    quantity NUMERIC(10,1) CHECK (quantity >= 0.0),
    unit TEXT,
    name TEXT NOT NULL,
    notes TEXT,
    position INTEGER CHECK (position >= 0)
);

-- 4. recipe_steps table
CREATE TABLE IF NOT EXISTS public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number > 0),
    description TEXT NOT NULL,
    video_url TEXT,
    timer_seconds INTEGER CHECK (timer_seconds >= 0),
    tip TEXT,
    CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
);

-- Apply GIN indexes on recipes
CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));

-- Apply GIN index on user_profiles for full-text search
CREATE INDEX IF NOT EXISTS idx_user_profiles_fulltext ON public.user_profiles USING GIN (to_tsvector('english', coalesce(username, '') || ' ' || email));

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Allow select own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- RLS Policies for recipes
CREATE POLICY "Allow select published or cms_editor" ON public.recipes FOR SELECT USING (is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor');

-- RLS Policies for recipe_ingredients
CREATE POLICY "Allow select ingredients for published or cms_editor" ON public.recipe_ingredients FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_ingredients.recipe_id
          AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
    )
);

-- RLS Policies for recipe_steps
CREATE POLICY "Allow select steps for published or cms_editor" ON public.recipe_steps FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.recipes
        WHERE public.recipes.id = recipe_steps.recipe_id
          AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
    )
);

-- Trigger function to populate user_profiles from auth.users on insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_onboarding_survey JSONB;
    v_sauce_log JSONB;
BEGIN
    IF NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN
        v_onboarding_survey := NEW.raw_user_meta_data -> 'onboarding_survey';
        v_sauce_log := NEW.raw_user_meta_data -> 'sauce_log';
    ELSE
        v_onboarding_survey := '{}'::jsonb;
        v_sauce_log := '{}'::jsonb;
    END IF;
    IF v_onboarding_survey IS NULL OR jsonb_typeof(v_onboarding_survey) = 'null' THEN
        v_onboarding_survey := '{}'::jsonb;
    END IF;
    IF v_sauce_log IS NULL OR jsonb_typeof(v_sauce_log) = 'null' THEN
        v_sauce_log := '{}'::jsonb;
    END IF;
    INSERT INTO public.user_profiles (
        id, email, username, full_name, avatar_url, onboarding_survey, sauce_log
    ) VALUES (
        NEW.id,
        NEW.email,
        CASE WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN NEW.raw_user_meta_data ->> 'username' ELSE NULL END,
        CASE WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN NEW.raw_user_meta_data ->> 'full_name' ELSE NULL END,
        CASE WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN NEW.raw_user_meta_data ->> 'avatar_url' ELSE NULL END,
        v_onboarding_survey,
        v_sauce_log
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute handle_new_user()
CREATE OR REPLACE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_updated_at_column triggers
CREATE OR REPLACE TRIGGER set_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER set_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- End of combined schema
