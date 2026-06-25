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
