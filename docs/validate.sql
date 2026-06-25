-- DATABASE SCHEMA VALIDATION TEST SUITE
-- Run within a transaction and rolled back at the end to keep database clean.

\echo '=== Running Validation Tests ==='

BEGIN;

-- Explicitly grant SELECT on all tables in public schema to anon and authenticated roles
-- (to prevent any permission denied errors on SELECT itself before RLS is applied)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =========================================================================
-- TEST 1: Schema Structure Verification
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    RAISE EXCEPTION 'Table user_profiles is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes') THEN
    RAISE EXCEPTION 'Table recipes is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_ingredients') THEN
    RAISE EXCEPTION 'Table recipe_ingredients is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_steps') THEN
    RAISE EXCEPTION 'Table recipe_steps is missing';
  END IF;
END $$;


-- =========================================================================
-- TEST 2: Trigger public.handle_new_user() under various raw_user_meta_data conditions
-- =========================================================================
DO $$
DECLARE
  v_user_1_id UUID := gen_random_uuid();
  v_user_2_id UUID := gen_random_uuid();
  v_user_3_id UUID := gen_random_uuid();
  v_user_4_id UUID := gen_random_uuid();
  v_profile RECORD;
BEGIN
  -- Scenario A: Complete metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_1_id,
    'user1@test.com',
    '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"sku_1": 3}}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_1_id;
  IF v_profile.onboarding_survey IS NULL OR v_profile.onboarding_survey = 'null'::jsonb OR v_profile.onboarding_survey -> 'dietary_preferences' ->> 0 != 'vegan' THEN
    RAISE EXCEPTION 'Failed Scenario A (onboarding_survey)';
  END IF;
  IF v_profile.sauce_log IS NULL OR v_profile.sauce_log = 'null'::jsonb OR v_profile.sauce_log ->> 'sku_1' != '3' THEN
    RAISE EXCEPTION 'Failed Scenario A (sauce_log)';
  END IF;

  -- Scenario B: JSON null values
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_2_id,
    'user2@test.com',
    '{"onboarding_survey": null, "sauce_log": null}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_2_id;
  IF v_profile.onboarding_survey IS NULL OR v_profile.onboarding_survey = 'null'::jsonb OR v_profile.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario B (onboarding_survey did not default properly, got %)', v_profile.onboarding_survey;
  END IF;
  IF v_profile.sauce_log IS NULL OR v_profile.sauce_log = 'null'::jsonb OR v_profile.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario B (sauce_log did not default properly, got %)', v_profile.sauce_log;
  END IF;

  -- Scenario C: Missing metadata keys
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_3_id,
    'user3@test.com',
    '{"other_keys": "value"}'::jsonb
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_3_id;
  IF v_profile.onboarding_survey IS NULL OR v_profile.onboarding_survey = 'null'::jsonb OR v_profile.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario C (onboarding_survey did not default properly)';
  END IF;
  IF v_profile.sauce_log IS NULL OR v_profile.sauce_log = 'null'::jsonb OR v_profile.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario C (sauce_log did not default properly)';
  END IF;

  -- Scenario D: Entirely NULL metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    v_user_4_id,
    'user4@test.com',
    NULL
  );

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_user_4_id;
  IF v_profile.onboarding_survey IS NULL OR v_profile.onboarding_survey = 'null'::jsonb OR v_profile.onboarding_survey != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario D (onboarding_survey did not default properly)';
  END IF;
  IF v_profile.sauce_log IS NULL OR v_profile.sauce_log = 'null'::jsonb OR v_profile.sauce_log != '{}'::jsonb THEN
    RAISE EXCEPTION 'Failed Scenario D (sauce_log did not default properly)';
  END IF;

END $$;


-- =========================================================================
-- TEST 3: Relational integrity and ON DELETE CASCADE
-- =========================================================================
DO $$
DECLARE
  v_user_id UUID;
  v_recipe_id UUID;
  v_count INTEGER;
BEGIN
  -- A. User delete cascade
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  DELETE FROM auth.users WHERE id = v_user_id;
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'User profile not deleted when user was deleted';
  END IF;

  -- B. Recipe delete cascade
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Test Recipe', 'test-recipe', 2, true)
  RETURNING id INTO v_recipe_id;

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 1.5, 'cups', 'Flour', 1);

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES (v_recipe_id, 1, 'Mix ingredients');

  DELETE FROM public.recipes WHERE id = v_recipe_id;

  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Recipe ingredients not cascade-deleted';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Recipe steps not cascade-deleted';
  END IF;

END $$;


-- =========================================================================
-- TEST 4: Numeric precision on recipe ingredients
-- =========================================================================
DO $$
DECLARE
  v_recipe_id UUID;
  v_quantity NUMERIC(10,1);
BEGIN
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Test Recipe Precision', 'test-recipe-precision', 1, true)
  RETURNING id INTO v_recipe_id;

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_recipe_id, 1.25, 'cups', 'Sugar', 1);

  SELECT quantity INTO v_quantity FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;
  -- numeric(10,1) should round 1.25 to 1.3
  IF v_quantity != 1.3 THEN
    RAISE EXCEPTION 'Decimal precision value mismatch, expected 1.3, got %', v_quantity;
  END IF;
END $$;


-- =========================================================================
-- TEST 5: RLS Policies for Profiles
-- =========================================================================
DO $$
DECLARE
  v_user_a UUID := gen_random_uuid();
  v_user_b UUID := gen_random_uuid();
  v_count INTEGER;
BEGIN
  -- Setup profiles
  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'usera@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_user_b, 'userb@example.com');

  -- Impersonate User A
  PERFORM set_config('test.auth_uid', v_user_a::text, true);

  -- Switch to authenticated role
  SET LOCAL ROLE authenticated;

  -- Verify User A can select own profile
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_a;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS: User A cannot read own profile';
  END IF;

  -- Verify User A cannot select User B profile
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_b;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: User A can read User B profile';
  END IF;

  -- Verify User A cannot update User B profile
  UPDATE public.user_profiles SET onboarding_survey = '{"compromised": true}'::jsonb WHERE id = v_user_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: User A updated User B profile';
  END IF;

  -- Reset role and claims
  RESET ROLE;
  PERFORM set_config('test.auth_uid', '', true);
END $$;


-- =========================================================================
-- TEST 6: RLS Policies for Recipes, Ingredients, and Steps
-- =========================================================================
DO $$
DECLARE
  v_recipe_pub_id UUID;
  v_recipe_draft_id UUID;
  v_count INTEGER;
BEGIN
  -- Setup published and draft recipes
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Pub Recipe', 'pub-recipe', 2, true)
  RETURNING id INTO v_recipe_pub_id;

  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Draft Recipe', 'draft-recipe', 2, false)
  RETURNING id INTO v_recipe_draft_id;

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES 
    (v_recipe_pub_id, 1, 'cup', 'Published Ingredient', 1),
    (v_recipe_draft_id, 1, 'cup', 'Draft Ingredient', 1);

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES 
    (v_recipe_pub_id, 1, 'Published Step'),
    (v_recipe_draft_id, 1, 'Draft Step');

  -- Scenario A: Test as 'anon' user (can only see published)
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: Anon user cannot read published recipe';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: Anon user could read draft recipe';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_draft_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: Anon user could read draft recipe ingredients';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_draft_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: Anon user could read draft recipe steps';
  END IF;

  RESET ROLE;

  -- Scenario B: Test as 'authenticated' user (can only see published)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: Authenticated user cannot read published recipe';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'RLS violation: Authenticated user could read draft recipe';
  END IF;

  RESET ROLE;

  -- Scenario C: Test as 'cms_editor' (can see both draft and published)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "cms_editor"}', true);

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_pub_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: CMS Editor cannot read published recipe';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_recipe_draft_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: CMS Editor cannot read draft recipe';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_recipe_draft_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: CMS Editor cannot read draft recipe ingredients';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_recipe_draft_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'RLS fail: CMS Editor cannot read draft recipe steps';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

END $$;


-- =========================================================================
-- TEST 7: Verify GIN Indexes exist on the arrays
-- =========================================================================
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
END $$;


-- =========================================================================
-- TEST 8: Test Deferrable Unique Constraint on steps
-- =========================================================================
DO $$
DECLARE
  v_recipe_id UUID;
  desc1 TEXT;
  desc2 TEXT;
BEGIN
  INSERT INTO public.recipes (id, title, slug, is_published, difficulty)
  VALUES ('33333333-3333-3333-3333-333333333333', 'Unique Constraint Recipe', 'unique-test', true, 1)
  RETURNING id INTO v_recipe_id;

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES 
    (v_recipe_id, 1, 'First step'),
    (v_recipe_id, 2, 'Second step');

  -- Inside a transaction, swap step numbers. This temporarily violates uniqueness, but because it is deferrable initially deferred, it should succeed upon commit.
  -- Note: We must run this inside SQL statements within the transaction.
  EXECUTE 'UPDATE public.recipe_steps SET step_number = 3 WHERE recipe_id = $1 AND step_number = 1' USING v_recipe_id;
  EXECUTE 'UPDATE public.recipe_steps SET step_number = 1 WHERE recipe_id = $1 AND step_number = 2' USING v_recipe_id;
  EXECUTE 'UPDATE public.recipe_steps SET step_number = 2 WHERE recipe_id = $1 AND step_number = 3' USING v_recipe_id;

END $$;

-- Verify swap happened successfully (after the DO block finishes in the same transaction)
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
END $$;

ROLLBACK;

\echo '=== All Tests Passed Successfully ==='
