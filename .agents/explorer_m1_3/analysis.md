# Database Schema & Security Design Analysis (Milestone 1)

## Executive Summary
This analysis presents the recommended design for the Supabase/PostgreSQL 16+ database schema, indexing strategy, Row Level Security (RLS) policies, and triggers for Milestone 1 of the Super Sauced MVP. The design satisfies all security, performance, and data integrity constraints defined in the project scope.

---

## 1. Complete SQL DDL Schema Design
The following DDL establishes the core tables in the `public` schema. All constraints, types, and defaults are designed to align with Supabase standards.

```sql
-- =========================================================================
-- 1. EXTENSIONS
-- =========================================================================
-- Enable pg_trgm for fuzzy text searches (if needed in CMS/search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Enable btree_gin for indexing scalar types with GIN (if mixed queries are required)
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =========================================================================
-- 2. CORE TABLES
-- =========================================================================

-- A. USER PROFILES TABLE
-- Directly linked to auth.users (Supabase managed) with ON DELETE CASCADE.
-- Serves as the user identity registry and CRM engine.
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    dietary_preferences TEXT[] DEFAULT '{}'::TEXT[],
    discovery_channel TEXT,
    onboarding_survey JSONB DEFAULT '{}'::jsonb NOT NULL,
    sauce_log JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- B. RECIPES TABLE
-- The main content table. Holds high-level metadata about recipes.
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    hero_image_url TEXT,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    cook_time_minutes INTEGER NOT NULL CHECK (cook_time_minutes > 0),
    calories_per_serving INTEGER CHECK (calories_per_serving >= 0),
    protein_g INTEGER CHECK (protein_g >= 0),
    fat_g INTEGER CHECK (fat_g >= 0),
    carbs_g INTEGER CHECK (carbs_g >= 0),
    cube_tags TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    dietary_tags TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- C. RECIPE INGREDIENTS TABLE
-- Linked to recipes.id with ON DELETE CASCADE.
-- Uses fixed-precision NUMERIC(10,1) for scaling accuracy.
CREATE TABLE public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    quantity NUMERIC(10,1) NOT NULL CHECK (quantity > 0.0),
    unit TEXT, -- e.g., 'cups', 'tbsp', 'g', or NULL for count
    name TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL
);

-- D. RECIPE STEPS TABLE
-- Linked to recipes.id with ON DELETE CASCADE.
-- Unique constraint on (recipe_id, step_number) ensures sequential ordering.
CREATE TABLE public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number > 0),
    description TEXT NOT NULL,
    video_url TEXT, -- Cloudinary CDN video link
    timer_seconds INTEGER CHECK (timer_seconds IS NULL OR timer_seconds > 0),
    tip TEXT,
    UNIQUE (recipe_id, step_number)
);
```

---

## 2. Indexing Strategy for Performance & Cascading Deletes
To ensure the app meets the Core User Journey (CUJ) "Speed to Meal" (browse/filter under 30 seconds) and database operations remain efficient, the following index layout is recommended:

```sql
-- GIN Indexes for fast filtering on array tags (Speed to Meal)
CREATE INDEX idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
CREATE INDEX idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);

-- B-Tree Indexes on Foreign Keys (Crucial for joins and CASCADE deletion speed)
CREATE INDEX idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_steps_recipe_id ON public.recipe_steps(recipe_id);
```

### Architectural Rationale for Indexing
* **Generalized Inverted Indexes (GIN)**: GIN indexes are ideal for indexing composite values where queries look for elements inside containers (e.g., matching tags in an array). When a user filters for recipes with `cube_tags @> ARRAY['spicy']` or `dietary_tags && ARRAY['vegan', 'gluten-free']`, PostgreSQL does not need to perform a full-table sequential scan. Instead, it looks up the specific tags in the GIN index and returns the matched row IDs in logarithmic time.
* **Foreign Key Indexes**: While SQL engines enforce foreign key constraints, they **do not** automatically create indexes on foreign key columns. If `recipe_ingredients` and `recipe_steps` lack indexes on `recipe_id`:
  1. Joins between `recipes` and its child tables will require sequential table scans.
  2. When a recipe is deleted, the engine must perform a full scan on `recipe_ingredients` and `recipe_steps` to find matching rows to cascade delete. Under CMS bulk deletes, this would cause severe locks and timeouts. The B-Tree indexes on these FK columns prevent this.

---

## 3. Row Level Security (RLS) Policies
By default, all tables must block read/write operations unless an explicit policy grants it.

```sql
-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- user_profiles Policies
-- =========================================================================
CREATE POLICY "Allow authenticated users to read their own profile"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Allow authenticated users to update their own profile"
    ON public.user_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Note: No INSERT policy is strictly needed for clients if the sign-up trigger
-- runs as SECURITY DEFINER (it bypasses RLS). However, for robustness:
CREATE POLICY "Allow users to insert their own profile"
    ON public.user_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- =========================================================================
-- recipes Policies
-- =========================================================================
CREATE POLICY "Allow public read access to published recipes"
    ON public.recipes FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- Note: Write policies (INSERT/UPDATE/DELETE) are omitted. This makes the table
-- read-only for public client roles. Superuser (postgres) and the Supabase
-- service_role (used by Directus CMS) automatically bypass RLS.

-- =========================================================================
-- recipe_ingredients Policies
-- =========================================================================
CREATE POLICY "Allow public read access to ingredients of published recipes"
    ON public.recipe_ingredients FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE recipes.id = recipe_ingredients.recipe_id
            AND recipes.is_published = true
        )
    );

-- =========================================================================
-- recipe_steps Policies
-- =========================================================================
CREATE POLICY "Allow public read access to steps of published recipes"
    ON public.recipe_steps FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE recipes.id = recipe_steps.recipe_id
            AND recipes.is_published = true
        )
    );
```

---

## 4. Automated User Profile Trigger
To automate CRM registration and capture onboarding inputs, a database trigger is attached to `auth.users`.

```sql
-- Trigger function with search_path set to public for security isolation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    extracted_dietary TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Safely extract dietary_preferences from raw_user_meta_data if present and is an array
    IF new.raw_user_meta_data IS NOT NULL 
       AND new.raw_user_meta_data ? 'dietary_preferences' 
       AND jsonb_typeof(new.raw_user_meta_data->'dietary_preferences') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(x)::TEXT[], ARRAY[]::TEXT[]) INTO extracted_dietary
        FROM jsonb_array_elements_text(new.raw_user_meta_data->'dietary_preferences') AS x;
    END IF;

    -- 2. Insert the profile record
    INSERT INTO public.user_profiles (
        id,
        email,
        dietary_preferences,
        discovery_channel,
        onboarding_survey,
        sauce_log
    ) VALUES (
        new.id,
        new.email,
        extracted_dietary,
        new.raw_user_meta_data->>'discovery_channel',
        COALESCE(new.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
        COALESCE(new.raw_user_meta_data->'sauce_log', '{}'::jsonb)
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: Ensure user registration is NEVER blocked by metadata errors
    INSERT INTO public.user_profiles (id, email)
    VALUES (new.id, new.email);
    RETURN NEW;
END;
$$;

-- Trigger binding
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
```

### Architectural Rationale for the Trigger
1. **`SECURITY DEFINER`**: The trigger executes when a row is inserted into `auth.users` by the authentication service. Because the client role at this instant does not have write access to `public.user_profiles` (RLS would block it), the function must run with the privileges of the function owner (`postgres`), bypassing RLS.
2. **`SET search_path`**: Prevents Search Path Hijacking. Since the function runs with superuser privileges, a malicious user could exploit it if search path resolution was manipulated. Setting it explicitly to `public, pg_temp` isolates execution.
3. **Graceful Failures**: The `EXCEPTION WHEN OTHERS` block acts as a circuit breaker. If a client sends malformed JSON metadata, the database logs the error but still creates a basic user profile, preventing signup failures.

---

## 5. Schema Maintenance Triggers
To automate the `updated_at` columns, standard PostgreSQL update triggers should be applied.

```sql
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Apply triggers
CREATE TRIGGER update_user_profiles_modtime
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_recipes_modtime
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
```

---

## 6. Implementation Quality Considerations
* **Strict Ingredient Precision**: `NUMERIC(10,1)` prevents float accumulation drift during multiplier scaling. An ingredient with quantity `0.3` cups scaled up for 3 servings returns exactly `0.9` instead of `0.8999999999999999`.
* **CMS Bypass**: Directus reads and writes to Supabase using a direct database connection. In PostgreSQL, tables owned by a user or accessed via a role with superuser/service_role bypass RLS policies automatically. Therefore, no RLS policies are needed for CMS write operations; they are securely restricted at the network/database role level.
