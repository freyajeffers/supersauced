-- CHALLENGER STRESS TESTS & EDGE CASES SUITE
-- Runs within a transaction and rolled back at the end.

\echo '=== Running Challenger Stress and Edge Case Tests ==='

BEGIN;

-- Explicitly grant SELECT on all tables in public schema to anon and authenticated roles
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
ALTER ROLE service_role BYPASSRLS;

-- =========================================================================
-- 1. USER PROFILE TRIGGERS STRESS TEST
-- =========================================================================
\echo '--- Stress Testing User Profile Triggers ---'
DO $$
DECLARE
  v_start TIMESTAMP;
  v_end TIMESTAMP;
  v_duration INTERVAL;
  v_user_id UUID;
  v_meta JSONB;
BEGIN
  v_start := clock_timestamp();
  
  -- Insert 500 users in a loop with complex, nested metadata
  FOR i IN 1..500 LOOP
    v_user_id := gen_random_uuid();
    v_meta := jsonb_build_object(
      'onboarding_survey', jsonb_build_object(
        'dietary_preferences', jsonb_build_array('vegan', 'gluten-free', 'nut-free'),
        'cooking_frequency', 'daily',
        'experience_level', i,
        'nested_metrics', jsonb_build_object(
          'likes_spicy', true,
          'preferred_cuisines', jsonb_build_array('Mexican', 'Thai', 'Indian')
        )
      ),
      'sauce_log', jsonb_build_object(
        'logs', jsonb_build_array(
          jsonb_build_object('sku', 'sauce-001', 'qty', i, 'timestamp', clock_timestamp()),
          jsonb_build_object('sku', 'sauce-002', 'qty', i * 2, 'timestamp', clock_timestamp())
        )
      )
    );
    
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_user_id, 'stress_user_' || i || '@example.com', v_meta);
  END LOOP;
  
  v_end := clock_timestamp();
  v_duration := v_end - v_start;
  
  -- Verify all 500 profiles were created
  IF (SELECT COUNT(*) FROM public.user_profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'stress_user_%')) != 500 THEN
    RAISE EXCEPTION 'Not all user profiles were created by the trigger!';
  END IF;

  RAISE NOTICE 'Inserted 500 users with complex metadata. Duration: %', v_duration;
  
  -- Check if it took less than 2 seconds (usually takes ~100-200ms in pg)
  IF v_duration > INTERVAL '2 seconds' THEN
    RAISE WARNING 'User trigger performance is slow: %', v_duration;
  END IF;
END $$;


-- =========================================================================
-- 2. RLS POLICY BYPASSES & ROLE BLOCK VERIFICATION
-- =========================================================================
\echo '--- Verifying RLS Policy Block/Bypasses ---'
DO $$
DECLARE
  v_recipe_id UUID;
  v_count INTEGER;
BEGIN
  -- Insert a base recipe using the default superuser/service_role
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('RLS Test Recipe', 'rls-test-recipe', 2, true)
  RETURNING id INTO v_recipe_id;

  -- A. Test Anon role
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Anon write to recipes should fail
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Anon Recipe', 'anon-recipe', 1);
    RAISE EXCEPTION 'RLS Bypass: Anon was able to insert a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  BEGIN
    UPDATE public.recipes SET title = 'Anon Edit' WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: Anon was able to update a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  BEGIN
    DELETE FROM public.recipes WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: Anon was able to delete a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Anon write to recipe_ingredients should fail
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, position) VALUES (v_recipe_id, 'Anon Ing', 1);
    RAISE EXCEPTION 'RLS Bypass: Anon was able to insert a recipe ingredient!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Anon write to recipe_steps should fail
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description) VALUES (v_recipe_id, 10, 'Anon Step');
    RAISE EXCEPTION 'RLS Bypass: Anon was able to insert a recipe step!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- B. Test Authenticated role (Standard User)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

  -- Authenticated write to recipes should fail
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Auth Recipe', 'auth-recipe', 1);
    RAISE EXCEPTION 'RLS Bypass: Authenticated user was able to insert a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  BEGIN
    UPDATE public.recipes SET title = 'Auth Edit' WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: Authenticated user was able to update a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  BEGIN
    DELETE FROM public.recipes WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: Authenticated user was able to delete a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Authenticated write to recipe_ingredients should fail
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, position) VALUES (v_recipe_id, 'Auth Ing', 1);
    RAISE EXCEPTION 'RLS Bypass: Authenticated user was able to insert a recipe ingredient!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Authenticated write to recipe_steps should fail
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description) VALUES (v_recipe_id, 10, 'Auth Step');
    RAISE EXCEPTION 'RLS Bypass: Authenticated user was able to insert a recipe step!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- C. Test CMS Editor role (Should only read, cannot insert/update/delete)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "cms_editor"}', true);

  -- Read should succeed
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS Error: CMS Editor cannot read recipes!';
  END IF;

  -- Insert should fail
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('CMS Recipe', 'cms-recipe', 1);
    RAISE EXCEPTION 'RLS Bypass: CMS Editor was able to insert a recipe!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Update should fail
  BEGIN
    UPDATE public.recipes SET title = 'CMS Edit' WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: CMS Editor was able to update a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- Delete should fail
  BEGIN
    DELETE FROM public.recipes WHERE id = v_recipe_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'RLS Bypass: CMS Editor was able to delete a recipe!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- D. Test Service Role (Should bypass RLS completely and write successfully)
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "service_role"}', true);

  -- Insert, Update, and Delete should succeed
  INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Service Recipe', 'service-recipe', 1);
  UPDATE public.recipes SET title = 'Service Edit' WHERE slug = 'service-recipe';
  DELETE FROM public.recipes WHERE slug = 'service-recipe';

  -- Reset role and claims
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;


-- =========================================================================
-- 3. CASCADE DELETE STRESS TEST
-- =========================================================================
\echo '--- Stress Testing Cascade Delete ---'
DO $$
DECLARE
  v_recipe_id UUID;
  v_user_id UUID;
  v_start TIMESTAMP;
  v_end TIMESTAMP;
  v_duration INTERVAL;
  v_large_json JSONB;
  v_count INTEGER;
BEGIN
  -- A. Recipe Cascade Delete Stress Test
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Huge Recipe', 'huge-recipe', 2)
  RETURNING id INTO v_recipe_id;

  -- Insert 500 ingredients and 500 steps
  FOR i IN 1..500 LOOP
    INSERT INTO public.recipe_ingredients (recipe_id, quantity, name, position)
    VALUES (v_recipe_id, i::numeric, 'Ingredient ' || i, i);

    INSERT INTO public.recipe_steps (recipe_id, step_number, description)
    VALUES (v_recipe_id, i, 'Step description ' || i);
  END LOOP;

  -- Measure delete cascade time
  v_start := clock_timestamp();
  DELETE FROM public.recipes WHERE id = v_recipe_id;
  v_end := clock_timestamp();
  v_duration := v_end - v_start;

  RAISE NOTICE 'Deleted recipe with 500 ingredients and 500 steps. Cascade delete duration: %', v_duration;

  -- Verify they are gone
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Cascade delete failed for recipe ingredients!';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Cascade delete failed for recipe steps!';
  END IF;

  -- B. User Cascade Delete with large profile history
  -- Create a large JSONB (approx 1MB)
  v_large_json := '{}'::jsonb;
  FOR i IN 1..1000 LOOP
    v_large_json := jsonb_set(v_large_json, ARRAY['key_' || i], jsonb_build_object(
      'data', repeat('A', 1000), -- 1KB of text
      'index', i,
      'timestamp', clock_timestamp()
    ));
  END LOOP;

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user_id, 'heavy_user@example.com', jsonb_build_object('sauce_log', v_large_json));

  -- Verify user profile was created with the heavy JSON
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Failed to create heavy user profile!';
  END IF;

  -- Measure cascade delete time
  v_start := clock_timestamp();
  DELETE FROM auth.users WHERE id = v_user_id;
  v_end := clock_timestamp();
  v_duration := v_end - v_start;

  RAISE NOTICE 'Deleted heavy user (1MB metadata profile). Cascade delete duration: %', v_duration;

  -- Verify profile is gone
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Cascade delete failed for heavy user profile!';
  END IF;

END $$;


-- =========================================================================
-- 4. DEFERRABLE UNIQUE CONSTRAINT ON STEPS VERIFICATION
-- =========================================================================
\echo '--- Verifying Deferrable vs Non-deferrable Unique Constraints ---'
DO $$
DECLARE
  v_recipe_id UUID := gen_random_uuid();
BEGIN
  -- A. Create a temporary table with a standard non-deferrable unique constraint
  CREATE TEMP TABLE temp_recipe_steps_non_deferrable (
    recipe_id UUID NOT NULL,
    step_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    CONSTRAINT unique_temp_step UNIQUE (recipe_id, step_number)
  );

  INSERT INTO temp_recipe_steps_non_deferrable (recipe_id, step_number, description)
  VALUES 
    (v_recipe_id, 1, 'Step A'),
    (v_recipe_id, 2, 'Step B');

  -- Attempt to swap them: step 1 -> step 2.
  -- This should fail IMMEDIATELY because the constraint is NOT deferrable.
  BEGIN
    UPDATE temp_recipe_steps_non_deferrable SET step_number = 2 WHERE step_number = 1;
    RAISE EXCEPTION 'Non-deferrable constraint allowed temporary duplicate during transaction! (Should have failed)';
  EXCEPTION WHEN unique_violation THEN
    -- Expected behavior
    RAISE NOTICE 'Non-deferrable constraint correctly failed immediately on temporary duplicate.';
  END;

  -- Drop temporary table
  DROP TABLE temp_recipe_steps_non_deferrable;

  -- B. Verify that on public.recipe_steps, which is DEFERRABLE INITIALLY DEFERRED,
  -- we can swap step numbers in a transaction successfully.
  INSERT INTO public.recipes (id, title, slug, difficulty)
  VALUES (v_recipe_id, 'Swap Stress Test Recipe', 'swap-stress-test-recipe', 2);

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES 
    (v_recipe_id, 1, 'First'),
    (v_recipe_id, 2, 'Second');

  -- Swap them inside the transaction
  UPDATE public.recipe_steps SET step_number = 2 WHERE recipe_id = v_recipe_id AND step_number = 1;
  -- Now we temporarily have two "2"s. In deferred mode, this is allowed until check.
  UPDATE public.recipe_steps SET step_number = 1 WHERE recipe_id = v_recipe_id AND description = 'Second';

  -- Verify swap works and doesn't throw when checking constraints at commit / SET IMMEDIATE
  SET CONSTRAINTS ALL IMMEDIATE;
  
  -- Restore to deferred
  SET CONSTRAINTS ALL DEFERRED;

  RAISE NOTICE 'Deferrable constraint successfully allowed swapping of steps.';
END $$;

ROLLBACK;

\echo '=== Challenger Stress and Edge Case Tests Completed Successfully ==='
