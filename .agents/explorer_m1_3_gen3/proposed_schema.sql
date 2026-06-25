-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. UTILITY FUNCTION FOR UPDATE TRIGGERS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 2. TABLES CREATION
-- =========================================================================

-- A. USER PROFILES
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_survey JSONB NOT NULL DEFAULT '{}'::jsonb,
  sauce_log JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- B. RECIPES
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  hero_image_url TEXT,
  servings_default INTEGER CHECK (servings_default > 0),
  cook_time_minutes INTEGER CHECK (cook_time_minutes >= 0),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  calories_per_serving INTEGER CHECK (calories_per_serving >= 0),
  protein_g INTEGER CHECK (protein_g >= 0),
  fat_g INTEGER CHECK (fat_g >= 0),
  carbs_g INTEGER CHECK (carbs_g >= 0),
  cube_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  dietary_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- C. RECIPE INGREDIENTS
CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  quantity NUMERIC(10,1) CHECK (quantity >= 0.0),
  unit TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- D. RECIPE STEPS
CREATE TABLE public.recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  description TEXT NOT NULL,
  video_url TEXT,
  timer_seconds INTEGER CHECK (timer_seconds >= 0),
  tip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
);

-- =========================================================================
-- 3. UPDATE TRIGGERS APPLICATION
-- =========================================================================
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipe_ingredients_updated_at
  BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipe_steps_updated_at
  BEFORE UPDATE ON public.recipe_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4. PERFORMANCE INDEXES (GIN INDEXING FOR TAG ARRAYS)
-- =========================================================================
CREATE INDEX idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
CREATE INDEX idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);

-- B-Tree indexes on foreign keys for join performance and cascading deletes
CREATE INDEX idx_recipe_ingredients_recipe_id ON public.recipe_ingredients (recipe_id);
CREATE INDEX idx_recipe_steps_recipe_id ON public.recipe_steps (recipe_id);

-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

-- public.user_profiles policies
CREATE POLICY "owner_select_user_profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "owner_insert_user_profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "owner_update_user_profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "owner_delete_user_profile" ON public.user_profiles
  FOR DELETE USING (auth.uid() = id);

-- public.recipes policy
CREATE POLICY "public_read_published_recipes" ON public.recipes
  FOR SELECT USING (is_published = true);

-- public.recipe_ingredients policy
CREATE POLICY "public_read_published_recipe_ingredients" ON public.recipe_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND public.recipes.is_published = true
    )
  );

-- public.recipe_steps policy
CREATE POLICY "public_read_published_recipe_steps" ON public.recipe_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipes
      WHERE public.recipes.id = recipe_id
        AND public.recipes.is_published = true
    )
  );

-- =========================================================================
-- 6. AUTOMATED SIGN-UP TRIGGER & FUNCTION
-- =========================================================================

-- Trigger function with search_path set to public for security isolation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    onboarding_survey,
    sauce_log
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->'onboarding_survey', 'null'::jsonb), '{}'::jsonb),
    COALESCE(NULLIF(NEW.raw_user_meta_data->'sauce_log', 'null'::jsonb), '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;

-- Trigger binding on auth.users table
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
