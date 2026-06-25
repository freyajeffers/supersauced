-- Clean up tables for a clean test run
RESET ROLE;
DROP ROLE IF EXISTS app_test_user;
TRUNCATE auth.users CASCADE;
TRUNCATE public.recipes CASCADE;

-- =========================================================================
-- TEST 1: User Signup Trigger & Metadata Initialization
-- =========================================================================
\echo '--- TEST 1: User Signup Trigger ---'

-- A. Insert user with valid metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'user1@example.com',
  '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"cube1": true}}'::jsonb
);

-- Check profile creation
SELECT id, onboarding_survey, sauce_log FROM public.user_profiles;

-- B. Insert user with NULL metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  'user2@example.com',
  NULL
);

-- Check profile creation for NULL metadata
SELECT id, onboarding_survey, sauce_log FROM public.user_profiles WHERE id = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

-- C. Insert user with JSON null in metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  'user3@example.com',
  '{"onboarding_survey": null, "sauce_log": null}'::jsonb
);

-- Check profile creation for JSON null (displays the bug where 'null'::jsonb is inserted instead of '{}'::jsonb)
SELECT id, onboarding_survey, sauce_log, 
       (onboarding_survey = '{}'::jsonb) as is_empty_object,
       (onboarding_survey = 'null'::jsonb) as is_json_null
FROM public.user_profiles WHERE id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';


-- =========================================================================
-- TEST 2: Foreign Key Cascade Deletes
-- =========================================================================
\echo '--- TEST 2: Cascade Deletes ---'

-- A. Delete user from auth.users and check user_profiles
DELETE FROM auth.users WHERE id = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
SELECT count(*) as profile_count_after_delete FROM public.user_profiles WHERE id = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

-- B. Create recipe, ingredients, steps
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Spicy Chili', 'spicy-chili', 2, true);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 1.5, 'cube', 'Spicy Cube', 1);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 1, 'Boil water and drop cube.');

-- Check rows exist
SELECT count(*) as ingredient_count FROM public.recipe_ingredients WHERE recipe_id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
SELECT count(*) as step_count FROM public.recipe_steps WHERE recipe_id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

-- Delete recipe and check ingredients/steps
DELETE FROM public.recipes WHERE id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
SELECT count(*) as ingredient_count_after_delete FROM public.recipe_ingredients WHERE recipe_id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
SELECT count(*) as step_count_after_delete FROM public.recipe_steps WHERE recipe_id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';


-- =========================================================================
-- TEST 3: Ingredient Quantity Precision
-- =========================================================================
\echo '--- TEST 3: Ingredient Quantity Precision ---'

-- Insert recipe again
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Spicy Chili', 'spicy-chili', 2, true);

-- Insert ingredient with 1.25 quantity and see if it scales/rounds
INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 1.25, 'cube', 'Test Precision', 2);

-- Check stored quantity (Postgres numeric(10,1) will round 1.25 to 1.3)
SELECT quantity FROM public.recipe_ingredients WHERE name = 'Test Precision';


-- =========================================================================
-- TEST 4: Row Level Security (RLS)
-- =========================================================================
\echo '--- TEST 4: Row Level Security ---'

-- Create unpublished recipe
INSERT INTO public.recipes (id, title, slug, difficulty, is_published)
VALUES ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'Draft Soup', 'draft-soup', 1, false);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 2.0, 'cup', 'Water', 1);

-- Enable RLS (already enabled in schema, but ensuring it is active)
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Define a helper to dynamically mock auth.uid() for testing owner policies
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.auth_uid', true), '')::uuid;
$$;

-- Create a test role that represents a client connection (standard role like 'authenticated' or 'anon')
-- Since we are running as superuser postgres, we must set role or simulate a non-owner user.
-- We can set role to a non-superuser role to test RLS.
CREATE ROLE app_test_user;
GRANT SELECT ON public.recipes TO app_test_user;
GRANT SELECT ON public.recipe_ingredients TO app_test_user;
GRANT SELECT ON public.user_profiles TO app_test_user;

-- Switch to the app_test_user role to enforce RLS
SET ROLE app_test_user;

-- A. Test public reads on recipes (should only see Spicy Chili, not Draft Soup)
\echo '--- RLS: Recipes visible to public ---'
SELECT id, title, is_published FROM public.recipes;

-- B. Test public reads on recipe_ingredients (should only see ingredients for Spicy Chili)
\echo '--- RLS: Ingredients visible to public ---'
SELECT recipe_id, name, quantity FROM public.recipe_ingredients;

-- C. Test owner read on user_profiles when auth.uid() is null
\echo '--- RLS: User Profiles visible to public (auth.uid = null) ---'
SELECT id FROM public.user_profiles;

-- D. Test owner read on user_profiles when auth.uid() matches user1
RESET ROLE;
SET test.auth_uid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
SET ROLE app_test_user;

\echo '--- RLS: User Profiles visible to owner (auth.uid = user1) ---'
SELECT id, onboarding_survey FROM public.user_profiles;

-- E. Test owner read on user_profiles when auth.uid() does NOT match user1 (e.g. user2)
RESET ROLE;
SET test.auth_uid = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'; -- user3
SET ROLE app_test_user;

\echo '--- RLS: User Profiles visible to user3 (should only see user3 profile, not user1) ---'
SELECT id FROM public.user_profiles;

-- Clean up
RESET ROLE;
REVOKE ALL PRIVILEGES ON public.user_profiles FROM app_test_user;
REVOKE ALL PRIVILEGES ON public.recipes FROM app_test_user;
REVOKE ALL PRIVILEGES ON public.recipe_ingredients FROM app_test_user;
DROP ROLE IF EXISTS app_test_user;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT null::UUID;
$$;
