# Milestone 1: Supabase/PostgreSQL 16+ Relational Database Schema Design & RLS Policies

This document outlines the detailed design recommendations and relational schema for the Super Sauced B2C mobile app MVP, supporting both the React Native (Expo) app and the Next.js website connecting to the same Supabase database.

---

## 1. Schema Design Recommendations

The schema leverages PostgreSQL 16+ features to support relational integrity, exact precision for scaling ingredients, rapid text-array queries, automatic onboarding profile generation, and secure data isolation.

### Entity-Relationship Structure

```
+-------------------------------------------------------+
|                     auth.users                        |
+-------------------------------------------------------+
|  id (UUID, PK)                                        |
+--------------------------+----------------------------+
                           | (1:1, ON DELETE CASCADE)
                           v
+-------------------------------------------------------+
|                 public.user_profiles                  |
+-------------------------------------------------------+
|  id (UUID, PK, FK -> auth.users)                      |
|  onboarding_survey (JSONB)                            |
|  sauce_log (JSONB)                                    |
|  created_at (TIMESTAMPTZ)                             |
|  updated_at (TIMESTAMPTZ)                             |
+-------------------------------------------------------+

+-------------------------------------------------------+
|                    public.recipes                     |
+-------------------------------------------------------+
|  id (UUID, PK)                                        |
|  title (TEXT)                                         |
|  slug (TEXT, UNIQUE)                                  |
|  description (TEXT)                                   |
|  hero_image_url (TEXT)                                |
|  servings_default (INT)                               |
|  cook_time_minutes (INT)                              |
|  difficulty (INT, 1-3)                                |
|  calories_per_serving (INT)                           |
|  protein_g (NUMERIC(6,1))                             |
|  fat_g (NUMERIC(6,1))                                 |
|  carbs_g (NUMERIC(6,1))                               |
|  cube_tags (TEXT[], GIN indexed)                      |
|  dietary_tags (TEXT[], GIN indexed)                   |
|  is_published (BOOLEAN)                               |
|  created_at (TIMESTAMPTZ)                             |
|  updated_at (TIMESTAMPTZ)                             |
+--------------------------+----------------------------+
                           |
                           +----------------------------+
                           | (1:N, ON DELETE CASCADE)   | (1:N, ON DELETE CASCADE)
                           v                            v
+---------------------------------------+   +---------------------------------------+
|       public.recipe_ingredients        |   |          public.recipe_steps          |
+---------------------------------------+   +---------------------------------------+
|  id (UUID, PK)                        |   |  id (UUID, PK)                        |
|  recipe_id (UUID, FK -> recipes)      |   |  recipe_id (UUID, FK -> recipes)      |
|  quantity (NUMERIC(10,1))             |   |  step_number (INT)                    |
|  unit (TEXT)                          |   |  description (TEXT)                   |
|  name (TEXT)                          |   |  video_url (TEXT)                     |
|  notes (TEXT)                         |   |  timer_seconds (INT)                  |
|  position (INT)                       |   |  tip (TEXT)                           |
|  created_at (TIMESTAMPTZ)             |   |  created_at (TIMESTAMPTZ)             |
|  updated_at (TIMESTAMPTZ)             |   |  updated_at (TIMESTAMPTZ)             |
+---------------------------------------+   +---------------------------------------+
```

---

## 2. Table DDL & Relational Integrity

### Rationale for Selected Data Types:
- **UUID (`gen_random_uuid()`)**: Standard practice for primary keys. Decouples client generation, keeps identifiers opaque, and integrates natively with Supabase Auth.
- **`NUMERIC(10,1)` for Ingredient Quantities**: Using floating-point types (`float`, `real`) results in binary approximation errors (e.g., `0.300000004` instead of `0.3`). This would cause display bugs in the serving size adjuster. `NUMERIC(10,1)` guarantees precise decimal calculations and holds quantities up to `999,999,999.9` with exactly one decimal place.
- **`JSONB` for `user_profiles`**: Onboarding surveys and sauce logs (cube inventories) are highly dynamic and will evolve as the marketing and product teams iterate on onboarding questions. Storing them as JSONB keeps schema maintenance low while maintaining Supabase/PostgreSQL indexable document access.
- **`TEXT[]` for Recipe Tags**: PostgreSQL arrays simplify filtering operations without requiring high-overhead junction tables. Since these tags (like dietary preferences or cube flavors) are static identifiers, array search is optimal when paired with a GIN index.

```sql
-- DDL Script for Milestone 1 Schema

-- Helper function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

-- =========================================================================
-- 1. Table: public.recipes
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    hero_image_url TEXT,
    servings_default INT NOT NULL DEFAULT 2,
    cook_time_minutes INT NOT NULL DEFAULT 0,
    difficulty INT NOT NULL DEFAULT 1 CONSTRAINT chk_recipes_difficulty CHECK (difficulty BETWEEN 1 AND 3),
    calories_per_serving INT,
    protein_g NUMERIC(6,1),
    fat_g NUMERIC(6,1),
    carbs_g NUMERIC(6,1),
    cube_tags TEXT[] NOT NULL DEFAULT '{}',
    dietary_tags TEXT[] NOT NULL DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER set_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- =========================================================================
-- 2. Table: public.recipe_ingredients
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    quantity NUMERIC(10,1), -- Nullable to allow qualitative quantities (e.g. "pinch of salt")
    unit TEXT,              -- Nullable for units like "piece", "onion"
    name TEXT NOT NULL,
    notes TEXT,
    position INT NOT NULL DEFAULT 0, -- Renders ingredients in a specific sorted order
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER set_recipe_ingredients_updated_at
    BEFORE UPDATE ON public.recipe_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- =========================================================================
-- 3. Table: public.recipe_steps
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INT NOT NULL CONSTRAINT chk_recipe_steps_number CHECK (step_number > 0),
    description TEXT NOT NULL,
    video_url TEXT,          -- Cloudinary MP4 URL
    timer_seconds INT CONSTRAINT chk_recipe_steps_timer CHECK (timer_seconds IS NULL OR timer_seconds >= 0),
    tip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    -- Enforce uniqueness of step sequence numbers per recipe
    CONSTRAINT uq_recipe_steps_recipe_and_number UNIQUE (recipe_id, step_number)
);

CREATE TRIGGER set_recipe_steps_updated_at
    BEFORE UPDATE ON public.recipe_steps
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- =========================================================================
-- 4. Table: public.user_profiles
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    onboarding_survey JSONB NOT NULL DEFAULT '{}'::jsonb,
    sauce_log JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER set_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();
```

---

## 3. GIN Indexes for Array Filtering

To meet the speed objective of finding a meal in under 30 seconds, filtering the recipe library by `cube_tags` and `dietary_tags` must yield sub-second responses. 

PostgreSQL supports GIN (Generalized Inverted Index) on array types. Instead of indexing the array as a single value, a GIN index maps individual array elements back to the rows they inhabit.

```sql
CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
```

### Supported Operators:
These GIN indexes optimize array queries using standard PostgreSQL array operators:
- **Overlap (`&&`)**: Checks if any tags overlap (e.g. querying recipes containing either *classic* OR *spicy*).
  ```sql
  SELECT * FROM public.recipes WHERE cube_tags && ARRAY['classic', 'spicy'];
  ```
- **Contains (`@>`)**: Checks if all tags are present (e.g. querying recipes that are both *vegan* AND *gluten-free*).
  ```sql
  SELECT * FROM public.recipes WHERE dietary_tags @> ARRAY['vegan', 'gluten-free'];
  ```

---

## 4. Trigger for User Onboarding

When a new user signs up via Apple, Google, or Email Magic Link, an entry is created in `auth.users`. To automate the creation of a corresponding profile in `public.user_profiles`, an `AFTER INSERT` trigger is bound to `auth.users`.

### Security Design:
- **`SECURITY DEFINER`**: The trigger function executes with the privileges of the user who created it (the database owner / superuser). This allows the function to insert into `public.user_profiles` even if Row Level Security is active and the client session has not yet been fully established.
- **`SET search_path = public`**: Secures the function against search path hijacking attacks, preventing malicious users from shadowing tables or functions in custom search paths.
- **Sign-Up Survey Integration**: If the client submits onboarding survey answers during the signup call, Supabase saves them into `auth.users.raw_user_meta_data`. The trigger function extracts these fields dynamically. If not present, it defaults to empty JSONB objects (`'{}'`), enabling the app to update them later during post-signup onboarding.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, onboarding_survey, sauce_log)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->'onboarding_survey', '{}'::jsonb),
        COALESCE(NEW.raw_user_meta_data->'sauce_log', '{}'::jsonb)
    );
    RETURN NEW;
END;
$$;

-- Create the trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
```

---

## 5. Row Level Security (RLS) Policies

Row Level Security is enabled on all tables to protect user privacy and enforce read-only visibility rules for consumer clients.

### Policy Rules Matrix:

| Table | SELECT Access | INSERT / UPDATE / DELETE Access | RLS Rationale |
|---|---|---|---|
| `public.user_profiles` | Authenticated Owners (`auth.uid() = id`) | Authenticated Owners (`auth.uid() = id`) | Users can only inspect and edit their own profiles. Service role and database owners can bypass to audit or manage. |
| `public.recipes` | Public (if `is_published = true`) | Denied (Read-only for app clients) | CMS handles writes (bypassing RLS). Mobile apps only display fully published recipes. |
| `public.recipe_ingredients` | Public (if recipe `is_published = true`) | Denied (Read-only for app clients) | Relies on parent recipe status. Prevents access to ingredients of draft recipes. |
| `public.recipe_steps` | Public (if recipe `is_published = true`) | Denied (Read-only for app clients) | Relies on parent recipe status. Prevents access to steps of draft recipes. |

### DDL Implementation:

```sql
-- Enable RLS on all tables
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- RLS Policies: public.recipes
-- =========================================================================
CREATE POLICY recipes_public_select ON public.recipes
    FOR SELECT TO public
    USING (is_published = true);

-- =========================================================================
-- RLS Policies: public.recipe_ingredients
-- =========================================================================
CREATE POLICY recipe_ingredients_public_select ON public.recipe_ingredients
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = recipe_ingredients.recipe_id
              AND public.recipes.is_published = true
        )
    );

-- =========================================================================
-- RLS Policies: public.recipe_steps
-- =========================================================================
CREATE POLICY recipe_steps_public_select ON public.recipe_steps
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = recipe_steps.recipe_id
              AND public.recipes.is_published = true
        )
    );

-- =========================================================================
-- RLS Policies: public.user_profiles
-- =========================================================================
CREATE POLICY user_profiles_owner_select ON public.user_profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY user_profiles_owner_insert ON public.user_profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY user_profiles_owner_update ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY user_profiles_owner_delete ON public.user_profiles
    FOR DELETE TO authenticated
    USING (auth.uid() = id);
```

### CMS & Service Role Bypass
- **Service Role**: Supabase clients utilizing the `service_role` key automatically bypass Row Level Security. This key is used on backend worker tasks and during Edge Function operations.
- **Directus CMS**: Directus will connect directly to the database. RLS policies do not apply to the Postgres database owner role or any role with superuser attributes. In production, Directus should use a dedicated postgres database user that owns these schemas or possesses the bypass privilege (`BYPASSRLS`), ensuring that content managers can write data directly without satisfying the SELECT/INSERT checks assigned to public users.
