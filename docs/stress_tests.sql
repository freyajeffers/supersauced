-- DATABASE SCHEMA STRESS TEST SUITE
-- Run within a transaction and rolled back at the end to keep database clean.

\echo '=== Running Stress and Security Tests ==='

BEGIN;

-- Explicitly grant SELECT on all tables in public schema to anon and authenticated roles
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Alter service_role to bypass RLS to mimic Supabase production environment
ALTER ROLE service_role BYPASSRLS;

-- =========================================================================
-- STRESS TEST 1: Deferrable Unique Constraint vs Non-Deferrable
-- =========================================================================
\echo 'Running STRESS TEST 1: Deferrable Unique Constraint vs Non-Deferrable'
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_recipe_id UUID;
  v_desc_1 TEXT;
  v_desc_2 TEXT;
BEGIN
  -- 1. Verify standard non-deferrable UNIQUE constraint fails immediately
  CREATE TEMP TABLE recipe_steps_non_deferrable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL,
    step_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    CONSTRAINT unique_step_non_deferrable UNIQUE (recipe_id, step_number)
  );

  -- Insert two steps
  INSERT INTO recipe_steps_non_deferrable (recipe_id, step_number, description)
  VALUES 
    ('11111111-1111-1111-1111-111111111111', 1, 'First Step'),
    ('11111111-1111-1111-1111-111111111111', 2, 'Second Step');

  -- Attempt to swap step numbers. This requires temporarily having two rows with step_number = 2.
  -- In a standard UNIQUE constraint, this should fail immediately.
  BEGIN
    UPDATE recipe_steps_non_deferrable SET step_number = 2 WHERE step_number = 1;
    v_failed := TRUE; -- If we reach here, it did not fail immediately!
  EXCEPTION WHEN unique_violation THEN
    -- Expected behavior: it failed immediately on the first update.
    v_failed := FALSE;
  END;

  IF v_failed THEN
    RAISE EXCEPTION 'Assertion failed: Non-deferrable UNIQUE constraint allowed temporary duplicate step_number';
  END IF;

  -- Cleanup temp table
  DROP TABLE recipe_steps_non_deferrable;

  -- 2. Verify deferrable initially deferred constraint allows swapping in a transaction
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Deferrable Success Recipe', 'deferrable-success-recipe', 1)
  RETURNING id INTO v_recipe_id;

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES 
    (v_recipe_id, 1, 'Step A'),
    (v_recipe_id, 2, 'Step B');

  -- Swap step numbers sequentially.
  UPDATE public.recipe_steps SET step_number = 3 WHERE recipe_id = v_recipe_id AND step_number = 1;
  UPDATE public.recipe_steps SET step_number = 1 WHERE recipe_id = v_recipe_id AND step_number = 2;
  UPDATE public.recipe_steps SET step_number = 2 WHERE recipe_id = v_recipe_id AND step_number = 3;

  -- Verify they are swapped successfully
  SELECT description INTO v_desc_1 FROM public.recipe_steps WHERE recipe_id = v_recipe_id AND step_number = 1;
  SELECT description INTO v_desc_2 FROM public.recipe_steps WHERE recipe_id = v_recipe_id AND step_number = 2;

  IF v_desc_1 != 'Step B' OR v_desc_2 != 'Step A' THEN
    RAISE EXCEPTION 'Assertion failed: Deferrable step swap did not update descriptions correctly';
  END IF;

  RAISE NOTICE 'Stress Test 1: Constraint verification passed.';
END $$;


-- =========================================================================
-- STRESS TEST 2: User Profile Triggers - Sequential 1000 Users
-- =========================================================================
\echo 'Running STRESS TEST 2: User Profile Triggers - Sequential 1000 Users'
DO $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_duration INTERVAL;
  v_user_id UUID;
  v_metadata JSONB;
  v_profile RECORD;
BEGIN
  v_start_time := clock_timestamp();

  FOR i IN 1..1000 LOOP
    v_user_id := gen_random_uuid();
    v_metadata := jsonb_build_object(
      'onboarding_survey', jsonb_build_object(
        'dietary_preferences', jsonb_build_array('vegan', 'gluten-free', 'nut-free'),
        'frequency', 'daily',
        'details', jsonb_build_object('user_num', i, 'registered_at', clock_timestamp())
      ),
      'sauce_log', jsonb_build_object(
        'items', jsonb_build_array(
          jsonb_build_object('sku', 'sku-' || i, 'rating', 5),
          jsonb_build_object('sku', 'sku-other', 'rating', 4)
        )
      )
    );

    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (
      v_user_id,
      'stress_user_' || i || '@test.com',
      v_metadata
    );

    -- Verify profile is created
    SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_id;
    IF v_profile IS NULL THEN
      RAISE EXCEPTION 'Profile not created for user %', i;
    END IF;
    IF (v_profile.onboarding_survey -> 'details' ->> 'user_num')::INT != i THEN
      RAISE EXCEPTION 'Metadata mismatch for user %', i;
    END IF;
  END LOOP;

  v_end_time := clock_timestamp();
  v_duration := v_end_time - v_start_time;
  RAISE NOTICE 'Successfully inserted 1000 users sequentially. Duration: %', v_duration;
END $$;


-- =========================================================================
-- STRESS TEST 3: Cascade Deletion with Large Datasets
-- =========================================================================
\echo 'Running STRESS TEST 3: Cascade Deletion with Large Datasets'
DO $$
DECLARE
  v_recipe_id UUID;
  v_user_id UUID;
  v_metadata JSONB;
  v_count INT;
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_duration INTERVAL;
BEGIN
  -- A. Recipe cascade delete stress test (1000 ingredients, 1000 steps)
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Cascade Stress Recipe', 'cascade-stress-recipe', 2)
  RETURNING id INTO v_recipe_id;

  -- Bulk insert 1000 ingredients
  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  SELECT 
    v_recipe_id, 
    1.0, 
    'g', 
    'Ingredient ' || i, 
    i
  FROM generate_series(1, 1000) AS i;

  -- Bulk insert 1000 steps
  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  SELECT 
    v_recipe_id, 
    i, 
    'Step Description ' || i
  FROM generate_series(1, 1000) AS i;

  -- Verify count before delete
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  IF v_count != 1000 THEN
    RAISE EXCEPTION 'Failed to insert 1000 ingredients, got %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  IF v_count != 1000 THEN
    RAISE EXCEPTION 'Failed to insert 1000 steps, got %', v_count;
  END IF;

  -- Delete recipe and measure cascade deletion time
  v_start_time := clock_timestamp();
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  v_end_time := clock_timestamp();
  v_duration := v_end_time - v_start_time;

  -- Verify cascade
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Cascade delete failed for recipe ingredients (leftovers: %)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Cascade delete failed for recipe steps (leftovers: %)', v_count;
  END IF;

  RAISE NOTICE 'Recipe cascade delete stress test passed. Duration: %', v_duration;

  -- B. User profile cascade delete stress test
  -- Create a large JSONB structure for onboarding survey and sauce log
  v_metadata := jsonb_build_object(
    'onboarding_survey', (
      SELECT jsonb_agg(jsonb_build_object('q', i, 'ans', 'answer_' || i))
      FROM generate_series(1, 1000) AS i
    ),
    'sauce_log', (
      SELECT jsonb_agg(jsonb_build_object('sku', 'sku_' || i, 'ts', clock_timestamp()))
      FROM generate_series(1, 1000) AS i
    )
  );

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user_id, 'large_profile_user@test.com', v_metadata);

  -- Verify profile exists and is large
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Large profile user profile not created';
  END IF;

  -- Delete user and measure cascade deletion time
  v_start_time := clock_timestamp();
  DELETE FROM auth.users WHERE id = v_user_id;
  v_end_time := clock_timestamp();
  v_duration := v_end_time - v_start_time;

  -- Verify profile is deleted
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'User profile cascade delete failed';
  END IF;

  RAISE NOTICE 'User profile cascade delete stress test passed. Duration: %', v_duration;

END $$;


-- =========================================================================
-- STRESS TEST 4: RLS Write Block Validation
-- =========================================================================
\echo 'Running STRESS TEST 4: RLS Write Block Validation'
DO $$
DECLARE
  v_recipe_id UUID;
  v_count INT;
BEGIN
  -- Insert a recipe as owner/service_role
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('RLS Test Recipe', 'rls-test-recipe', 2, TRUE)
  RETURNING id INTO v_recipe_id;

  -- 1. Test as 'anon' role
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Anon should fail on INSERT/UPDATE/DELETE on recipes
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Anon Recipe', 'anon-recipe', 1);
    RAISE EXCEPTION 'Assertion failed: Anon role successfully inserted a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  BEGIN
    UPDATE public.recipes SET title = 'Anon Hack' WHERE id = v_recipe_id;
    RAISE EXCEPTION 'Assertion failed: Anon role successfully updated a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  BEGIN
    DELETE FROM public.recipes WHERE id = v_recipe_id;
    RAISE EXCEPTION 'Assertion failed: Anon role successfully deleted a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  -- Anon should fail on INSERT/UPDATE/DELETE on recipe_ingredients
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, position) VALUES (v_recipe_id, 'Ingredient A', 1);
    RAISE EXCEPTION 'Assertion failed: Anon role successfully inserted recipe ingredient!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  -- Anon should fail on INSERT/UPDATE/DELETE on recipe_steps
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description) VALUES (v_recipe_id, 10, 'Step A');
    RAISE EXCEPTION 'Assertion failed: Anon role successfully inserted recipe step!';
  EXCEPTION WHEN insufficient_privilege THEN END;


  -- 2. Test as standard 'authenticated' role (role: 'user')
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "user"}', true);

  -- Authenticated user should fail on INSERT recipe
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Auth User Recipe', 'auth-user-recipe', 1);
    RAISE EXCEPTION 'Assertion failed: Authenticated user role successfully inserted a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  -- Authenticated user should fail on UPDATE recipe (affects 0 rows or fails)
  UPDATE public.recipes SET title = 'Auth User Hack' WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Assertion failed: Authenticated user role successfully updated a recipe!';
  END IF;

  -- Authenticated user should fail on DELETE recipe (affects 0 rows or fails)
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Assertion failed: Authenticated user role successfully deleted a recipe!';
  END IF;

  -- Authenticated user should fail on INSERT/UPDATE/DELETE on recipe_ingredients
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, position) VALUES (v_recipe_id, 'Ingredient A', 1);
    RAISE EXCEPTION 'Assertion failed: Authenticated user successfully inserted recipe ingredient!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  -- Authenticated user should fail on INSERT/UPDATE/DELETE on recipe_steps
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description) VALUES (v_recipe_id, 10, 'Step A');
    RAISE EXCEPTION 'Assertion failed: Authenticated user successfully inserted recipe step!';
  EXCEPTION WHEN insufficient_privilege THEN END;


  -- 3. Test as 'cms_editor' (role: 'cms_editor')
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "cms_editor"}', true);

  -- cms_editor should be blocked from INSERT recipe
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('CMS Editor Recipe', 'cms-editor-recipe', 1);
    RAISE EXCEPTION 'Assertion failed: cms_editor role successfully inserted a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN END;

  -- cms_editor should be blocked from UPDATE recipe
  UPDATE public.recipes SET title = 'CMS Editor Hack' WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Assertion failed: cms_editor role successfully updated a recipe!';
  END IF;

  -- cms_editor should be blocked from DELETE recipe
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Assertion failed: cms_editor role successfully deleted a recipe!';
  END IF;


  -- Reset role and claims
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 4. Test as 'service_role' (should succeed in writing since it bypasses RLS)
  SET LOCAL ROLE service_role;

  -- Insert recipe should succeed
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Service Role Recipe', 'service-role-recipe', 1)
  RETURNING id INTO v_recipe_id;

  -- Update recipe should succeed
  UPDATE public.recipes SET title = 'Service Role Updated' WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Assertion failed: service_role could not update recipe!';
  END IF;

  -- Delete recipe should succeed
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Assertion failed: service_role could not delete recipe!';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'Stress Test 4: RLS Write Block validation passed.';
END $$;

ROLLBACK;

\echo '=== All Stress/Security Tests Passed Successfully ==='
