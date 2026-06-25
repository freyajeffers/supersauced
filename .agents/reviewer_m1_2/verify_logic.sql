-- Test Trigger Behavior

-- 1. Insert user with NULL raw_user_meta_data
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'user1@example.com', NULL);

-- Check profile was created and has default empty objects
SELECT id, onboarding_survey, sauce_log FROM public.user_profiles 
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2. Insert user with empty raw_user_meta_data
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000002', 'user2@example.com', '{}'::jsonb);

SELECT id, onboarding_survey, sauce_log FROM public.user_profiles 
WHERE id = '00000000-0000-0000-0000-000000000002';

-- 3. Insert user with specific raw_user_meta_data values
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000003', 
  'user3@example.com', 
  '{"onboarding_survey": {"diet": "vegan"}, "sauce_log": {"habanero": true}}'::jsonb
);

SELECT id, onboarding_survey, sauce_log FROM public.user_profiles 
WHERE id = '00000000-0000-0000-0000-000000000003';

-- 4. Test RLS on user_profiles
-- Mock auth.uid() function to return user1's ID
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::UUID; $$;

-- Enable RLS for current session queries (simulate a non-superuser/anon/authenticated role)
-- In postgres, superuser bypasses RLS unless FORCE ROW LEVEL SECURITY is enabled, or we set role.
-- Let's create a test role to verify RLS properly.
-- Check if role already exists, if so grant, else create
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'test_app_user') THEN
    CREATE ROLE test_app_user WITH LOGIN;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_app_user;
GRANT ALL ON SCHEMA public TO test_app_user;

-- Set current role to test_app_user
SET ROLE test_app_user;

-- Select own profile (should succeed)
SELECT 'User 1 selects own profile' as test;
SELECT id FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';

-- Select other profile (should return 0 rows)
SELECT 'User 1 selects user 2 profile (should be empty)' as test;
SELECT id FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002';

-- Insert profile with own ID (should succeed)
SELECT 'User 1 inserts own profile' as test;
UPDATE public.user_profiles SET onboarding_survey = '{"updated": true}'::jsonb WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT id, onboarding_survey FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';

-- Update other profile (should do nothing / 0 rows affected)
SELECT 'User 1 updates user 2 profile (should do nothing)' as test;
UPDATE public.user_profiles SET onboarding_survey = '{"hacked": true}'::jsonb WHERE id = '00000000-0000-0000-0000-000000000002';

-- Reset role to superuser to populate recipes
RESET ROLE;

-- Clear tables first to avoid unique key conflicts on subsequent runs
DELETE FROM public.recipes;
DELETE FROM public.recipe_ingredients;
DELETE FROM public.recipe_steps;

-- Insert published and unpublished recipes
INSERT INTO public.recipes (id, title, slug, difficulty, is_published, cube_tags, dietary_tags)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Published Recipe', 'published-recipe', 1, true, ARRAY['cube_spicy'], ARRAY['vegan']),
  ('22222222-2222-2222-2222-222222222222', 'Draft Recipe', 'draft-recipe', 2, false, ARRAY['cube_mild'], ARRAY['keto']);

-- Insert ingredients
INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES
  ('11111111-1111-1111-1111-111111111111', 1.5, 'cups', 'Spicy Sauce', 1),
  ('22222222-2222-2222-2222-222222222222', 2.0, 'tbsp', 'Draft Ingredient', 1);

-- Insert steps
INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES
  ('11111111-1111-1111-1111-111111111111', 1, 'Pour spicy sauce on it.'),
  ('22222222-2222-2222-2222-222222222222', 1, 'Draft step.');

-- Set role to test_app_user again
SET ROLE test_app_user;

-- Read published recipe (should succeed)
SELECT 'User reads published recipe' as test;
SELECT title FROM public.recipes WHERE id = '11111111-1111-1111-1111-111111111111';

-- Read draft recipe (should be empty)
SELECT 'User reads draft recipe (should be empty)' as test;
SELECT title FROM public.recipes WHERE id = '22222222-2222-2222-2222-222222222222';

-- Read published ingredients (should succeed)
SELECT 'User reads published ingredients' as test;
SELECT name FROM public.recipe_ingredients WHERE recipe_id = '11111111-1111-1111-1111-111111111111';

-- Read draft ingredients (should be empty)
SELECT 'User reads draft ingredients (should be empty)' as test;
SELECT name FROM public.recipe_ingredients WHERE recipe_id = '22222222-2222-2222-2222-222222222222';

-- Try to insert a recipe as test_app_user (should fail/be blocked since there's no insert policy)
SELECT 'User tries to insert recipe (should fail)' as test;
INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Hacked Recipe', 'hacked-recipe', 1);
