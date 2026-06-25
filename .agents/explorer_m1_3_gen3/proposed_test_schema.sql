-- =========================================================================
-- DATABASE SCHEMA VALIDATION TEST SUITE (test_schema.sql)
-- =========================================================================

-- Test Trigger Behavior

-- 1. Insert user with NULL raw_user_meta_data
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'user1@example.com', NULL);

-- Check profile was created and has default empty objects
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT onboarding_survey, sauce_log INTO r FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';
  IF r.onboarding_survey IS NULL OR r.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: onboarding_survey not empty object for NULL metadata';
  END IF;
  IF r.sauce_log IS NULL OR r.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: sauce_log not empty object for NULL metadata';
  END IF;
END;
$$;


-- 2. Insert user with empty raw_user_meta_data
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000002', 'user2@example.com', '{}'::jsonb);

DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT onboarding_survey, sauce_log INTO r FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002';
  IF r.onboarding_survey IS NULL OR r.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: onboarding_survey not empty object for empty metadata';
  END IF;
  IF r.sauce_log IS NULL OR r.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: sauce_log not empty object for empty metadata';
  END IF;
END;
$$;


-- 3. Insert user with specific raw_user_meta_data values (JSON null values)
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'user3@example.com',
  '{"onboarding_survey": null, "sauce_log": null}'::jsonb
);

-- Check profile was created and has default empty objects instead of JSON nulls
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT onboarding_survey, sauce_log INTO r FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000003';
  IF r.onboarding_survey = 'null'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: onboarding_survey resolved to JSON null instead of empty object';
  END IF;
  IF r.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: onboarding_survey not empty object for JSON null metadata';
  END IF;
  IF r.sauce_log = 'null'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: sauce_log resolved to JSON null instead of empty object';
  END IF;
  IF r.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Assertion failed: sauce_log not empty object for JSON null metadata';
  END IF;
END;
$$;


-- 4. Insert user with valid custom metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'user4@example.com',
  '{"onboarding_survey": {"spicy_tolerance": 5}, "sauce_log": {"classic_sauce": 2}}'::jsonb
);

-- Assert profile has custom metadata
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT onboarding_survey, sauce_log INTO r FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000004';
  IF r.onboarding_survey->>'spicy_tolerance' != '5' THEN
    RAISE EXCEPTION 'Assertion failed: custom onboarding_survey not stored correctly';
  END IF;
  IF r.sauce_log->>'classic_sauce' != '2' THEN
    RAISE EXCEPTION 'Assertion failed: custom sauce_log not stored correctly';
  END IF;
END;
$$;


-- 5. Test Cascading Delete on auth.users -> public.user_profiles
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Assertion failed: user profile not deleted cascade after auth user delete';
  END IF;
END;
$$;


-- 6. Test Recipe deletion cascade to ingredients and steps
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Recipe', 'test-recipe', true, 1);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES ('11111111-1111-1111-1111-111111111111', 1.5, 'tbsp', 'Hot Sauce', 0);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES ('11111111-1111-1111-1111-111111111111', 1, 'Pour it on everything');

DELETE FROM public.recipes WHERE id = '11111111-1111-1111-1111-111111111111';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'Assertion failed: recipe_ingredients not cascadingly deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'Assertion failed: recipe_steps not cascadingly deleted';
  END IF;
END;
$$;


-- 7. Test RLS Policies for Profiles
RESET ROLE;

-- Create test roles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated_user') THEN
    CREATE ROLE authenticated_user;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated_user;
GRANT ALL ON SCHEMA public TO authenticated_user;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
  ('00000000-0000-0000-0000-000000000010', 'user10@example.com', NULL),
  ('00000000-0000-0000-0000-000000000020', 'user20@example.com', NULL);

-- Mock auth.uid() function to return user10's ID
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000010'::UUID;
$$;

SET ROLE authenticated_user;

-- Verify can select own profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'Assertion failed: RLS blocked reading own profile';
  END IF;
END;
$$;

-- Verify cannot select other's profile (it should return 0 rows)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000020') THEN
    RAISE EXCEPTION 'Assertion failed: RLS allowed reading another profile';
  END IF;
END;
$$;

-- Verify cannot update other's profile
DO $$
BEGIN
  UPDATE public.user_profiles SET onboarding_survey = '{"compromised": true}'::jsonb WHERE id = '00000000-0000-0000-0000-000000000020';
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000020' AND onboarding_survey = '{"compromised": true}'::jsonb) THEN
    RAISE EXCEPTION 'Assertion failed: RLS allowed updating another profile';
  END IF;
END;
$$;

RESET ROLE;


-- 8. Test RLS for Recipes (Published vs Draft)
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Published Recipe', 'published', true, 1),
  ('22222222-2222-2222-2222-222222222222', 'Draft Recipe', 'draft', false, 1);

INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 1, 'cup', 'Published Ingredient', 1),
  ('22222222-2222-2222-2222-222222222222', 1, 'cup', 'Draft Ingredient', 1);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 1, 'Published Step'),
  ('22222222-2222-2222-2222-222222222222', 1, 'Draft Step');

SET ROLE authenticated_user;

-- Verify can select published recipe elements
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'Assertion failed: RLS blocked reading published recipe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'Assertion failed: RLS blocked reading published recipe ingredients';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'Assertion failed: RLS blocked reading published recipe steps';
  END IF;
END;
$$;

-- Verify cannot select draft recipe elements
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recipes WHERE id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'Assertion failed: RLS allowed reading draft recipe';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'Assertion failed: RLS allowed reading draft recipe ingredients';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'Assertion failed: RLS allowed reading draft recipe steps';
  END IF;
END;
$$;

RESET ROLE;


-- 9. Verify GIN Indexes exist on the arrays
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'recipes' AND indexname = 'idx_recipes_cube_tags' AND indexdef LIKE '%USING gin%'
  ) THEN
    RAISE EXCEPTION 'Assertion failed: GIN index idx_recipes_cube_tags is missing or incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'recipes' AND indexname = 'idx_recipes_dietary_tags' AND indexdef LIKE '%USING gin%'
  ) THEN
    RAISE EXCEPTION 'Assertion failed: GIN index idx_recipes_dietary_tags is missing or incorrect';
  END IF;
END;
$$;


-- 10. Test Deferrable Unique Constraint on steps
INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
VALUES ('33333333-3333-3333-3333-333333333333', 'Unique Constraint Recipe', 'unique-test', true, 1);

INSERT INTO public.recipe_steps (recipe_id, step_number, description)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 1, 'First step'),
  ('33333333-3333-3333-3333-333333333333', 2, 'Second step');

-- Inside a transaction, swap step numbers. This temporarily violates uniqueness, but because it is deferrable initially deferred, it should succeed upon commit.
BEGIN;
UPDATE public.recipe_steps SET step_number = 3 WHERE recipe_id = '33333333-3333-3333-3333-333333333333' AND step_number = 1;
UPDATE public.recipe_steps SET step_number = 1 WHERE recipe_id = '33333333-3333-3333-3333-333333333333' AND step_number = 2;
UPDATE public.recipe_steps SET step_number = 2 WHERE recipe_id = '33333333-3333-3333-3333-333333333333' AND step_number = 3;
COMMIT;

-- Verify swap happened successfully
DO $$
DECLARE
  desc1 TEXT;
  desc2 TEXT;
BEGIN
  SELECT description INTO desc1 FROM public.recipe_steps WHERE recipe_id = '33333333-3333-3333-3333-333333333333' AND step_number = 1;
  SELECT description INTO desc2 FROM public.recipe_steps WHERE recipe_id = '33333333-3333-3333-3333-333333333333' AND step_number = 2;
  IF desc1 != 'Second step' OR desc2 != 'First step' THEN
    RAISE EXCEPTION 'Assertion failed: swap of deferrable recipe steps did not execute correctly';
  END IF;
END;
$$;
