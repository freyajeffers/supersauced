-- ADVERSARIAL DATABASE SCHEMA TEST SUITE
-- Run within a transaction and rolled back at the end.

\echo '=== Running Adversarial Validation Tests ==='

BEGIN;

-- Explicitly grant SELECT on all tables in public schema to anon and authenticated roles
-- (to prevent any permission denied errors on SELECT itself before RLS is applied)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =========================================================================
-- ADVERSARIAL TEST 1: User Profiles RLS (Select, Insert, Update, Delete)
-- =========================================================================
DO $$
DECLARE
  v_user_a UUID := gen_random_uuid();
  v_user_b UUID := gen_random_uuid();
  v_count INTEGER;
BEGIN
  -- Setup profiles
  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'usera_adv@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_user_b, 'userb_adv@example.com');

  -- Profile for User B is automatically created via the trigger on auth.users insert.
  -- Let's verify that User B's profile exists.
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_b;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Trigger failed to create profile for User B';
  END IF;

  -- Impersonate User A
  PERFORM set_config('test.auth_uid', v_user_a::text, true);
  SET LOCAL ROLE authenticated;

  -- Assert: Select User B profile -> 0 rows
  SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_b;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Adversarial RLS: User A can read User B profile';
  END IF;

  -- Assert: Update User B profile -> 0 rows affected (returns no error but updates 0 rows)
  UPDATE public.user_profiles SET onboarding_survey = '{"hacked": true}'::jsonb WHERE id = v_user_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Adversarial RLS: User A can update User B profile';
  END IF;

  -- Assert: Delete User B profile -> 0 rows affected
  DELETE FROM public.user_profiles WHERE id = v_user_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'Adversarial RLS: User A can delete User B profile';
  END IF;

  -- Assert: Insert profile with User B's ID -> throws insufficient_privilege (RLS WITH CHECK fails)
  BEGIN
    INSERT INTO public.user_profiles (id, onboarding_survey) 
    VALUES (v_user_b, '{"hacked": true}'::jsonb);
    RAISE EXCEPTION 'Adversarial RLS: User A inserted profile for User B';
  EXCEPTION
    WHEN insufficient_privilege THEN
      -- Expected RLS violation
  END;

  RESET ROLE;
  PERFORM set_config('test.auth_uid', '', true);
END $$;


-- =========================================================================
-- ADVERSARIAL TEST 2: Recipes, Ingredients, and Steps RLS
-- =========================================================================
DO $$
DECLARE
  v_pub_id UUID;
  v_draft_id UUID;
  v_count INTEGER;
BEGIN
  -- Set up recipes
  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Pub Adv Recipe', 'pub-adv-recipe', 2, true)
  RETURNING id INTO v_pub_id;

  INSERT INTO public.recipes (title, slug, difficulty, is_published)
  VALUES ('Draft Adv Recipe', 'draft-adv-recipe', 2, false)
  RETURNING id INTO v_draft_id;

  INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
  VALUES (v_draft_id, 2.0, 'tbsp', 'Draft Secret Ingredient', 1);

  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES (v_draft_id, 1, 'Draft Secret Step');

  -- --- Scenario 1: Anon role ---
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Assert: Anon cannot see draft recipe
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: Anon can read draft recipe'; END IF;

  -- Assert: Anon cannot see draft recipe ingredient
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: Anon can read draft recipe ingredient'; END IF;

  -- Assert: Anon cannot see draft recipe step
  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: Anon can read draft recipe step'; END IF;

  -- Assert: Anon cannot write (INSERT) recipe
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('Anon Recipe', 'anon-recipe', 1);
    RAISE EXCEPTION 'Adversarial RLS: Anon allowed to insert recipe';
  EXCEPTION WHEN insufficient_privilege THEN -- Expected
  END;

  -- --- Scenario 2: Authenticated role with role 'user' ---
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "user"}', true);

  -- Assert: 'user' cannot see draft recipe
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: User role can read draft recipe'; END IF;

  -- Assert: 'user' cannot see draft recipe ingredient
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: User role can read draft recipe ingredient'; END IF;

  -- Assert: 'user' cannot see draft recipe step
  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: User role can read draft recipe step'; END IF;

  -- Assert: 'user' cannot insert recipe
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('User Recipe', 'user-recipe', 1);
    RAISE EXCEPTION 'Adversarial RLS: User role allowed to insert recipe';
  EXCEPTION WHEN insufficient_privilege THEN -- Expected
  END;

  -- --- Scenario 3: Authenticated role with role 'editor' (non-cms_editor) ---
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "editor"}', true);

  -- Assert: 'editor' cannot see draft recipe
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_draft_id;
  IF v_count != 0 THEN RAISE EXCEPTION 'Adversarial RLS: Editor role can read draft recipe'; END IF;

  -- --- Scenario 4: Authenticated role with role 'cms_editor' ---
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "cms_editor"}', true);

  -- Assert: 'cms_editor' CAN see draft recipe
  SELECT COUNT(*) INTO v_count FROM public.recipes WHERE id = v_draft_id;
  IF v_count != 1 THEN RAISE EXCEPTION 'Adversarial RLS: cms_editor cannot read draft recipe'; END IF;

  -- Assert: 'cms_editor' CAN see draft recipe ingredient
  SELECT COUNT(*) INTO v_count FROM public.recipe_ingredients WHERE recipe_id = v_draft_id;
  IF v_count != 1 THEN RAISE EXCEPTION 'Adversarial RLS: cms_editor cannot read draft recipe ingredient'; END IF;

  -- Assert: 'cms_editor' CAN see draft recipe step
  SELECT COUNT(*) INTO v_count FROM public.recipe_steps WHERE recipe_id = v_draft_id;
  IF v_count != 1 THEN RAISE EXCEPTION 'Adversarial RLS: cms_editor cannot read draft recipe step'; END IF;

  -- Assert: 'cms_editor' cannot insert recipe (since no INSERT policy is defined)
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty) VALUES ('CMS Recipe', 'cms-recipe', 1);
    RAISE EXCEPTION 'Adversarial RLS: cms_editor allowed to insert recipe';
  EXCEPTION WHEN insufficient_privilege THEN -- Expected
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;


-- =========================================================================
-- ADVERSARIAL TEST 3: Table Constraints (CHECK constraints, NOT NULL, FKs)
-- =========================================================================
DO $$
DECLARE
  v_rec_id UUID;
BEGIN
  -- Insert a valid recipe to use for foreign key tests
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Valid Base Recipe', 'valid-base-recipe', 1)
  RETURNING id INTO v_rec_id;

  -- 1. servings_default <= 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, servings_default)
    VALUES ('Bad Recipe 1', 'bad-recipe-1', 1, 0);
    RAISE EXCEPTION 'Constraint failure: allowed servings_default = 0';
  EXCEPTION WHEN check_violation THEN END;

  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, servings_default)
    VALUES ('Bad Recipe 2', 'bad-recipe-2', 1, -3);
    RAISE EXCEPTION 'Constraint failure: allowed servings_default = -3';
  EXCEPTION WHEN check_violation THEN END;

  -- 2. cook_time_minutes < 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, cook_time_minutes)
    VALUES ('Bad Recipe 3', 'bad-recipe-3', 1, -1);
    RAISE EXCEPTION 'Constraint failure: allowed cook_time_minutes = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 3. difficulty NOT IN (1, 2, 3) check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty)
    VALUES ('Bad Recipe 4', 'bad-recipe-4', 0);
    RAISE EXCEPTION 'Constraint failure: allowed difficulty = 0';
  EXCEPTION WHEN check_violation THEN END;

  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty)
    VALUES ('Bad Recipe 5', 'bad-recipe-5', 4);
    RAISE EXCEPTION 'Constraint failure: allowed difficulty = 4';
  EXCEPTION WHEN check_violation THEN END;

  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty)
    VALUES ('Bad Recipe 6', 'bad-recipe-6', NULL);
    RAISE EXCEPTION 'Constraint failure: allowed difficulty = NULL';
  EXCEPTION WHEN not_null_violation THEN END;

  -- 4. calories_per_serving < 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, calories_per_serving)
    VALUES ('Bad Recipe 7', 'bad-recipe-7', 1, -1);
    RAISE EXCEPTION 'Constraint failure: allowed calories_per_serving = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 5. protein_g < 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, protein_g)
    VALUES ('Bad Recipe 8', 'bad-recipe-8', 1, -1);
    RAISE EXCEPTION 'Constraint failure: allowed protein_g = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 6. fat_g < 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, fat_g)
    VALUES ('Bad Recipe 9', 'bad-recipe-9', 1, -1);
    RAISE EXCEPTION 'Constraint failure: allowed fat_g = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 7. carbs_g < 0 check
  BEGIN
    INSERT INTO public.recipes (title, slug, difficulty, carbs_g)
    VALUES ('Bad Recipe 10', 'bad-recipe-10', 1, -1);
    RAISE EXCEPTION 'Constraint failure: allowed carbs_g = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 8. recipe_ingredients.quantity < 0.0 check
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, position)
    VALUES (v_rec_id, 'Sugar', -0.5, 1);
    RAISE EXCEPTION 'Constraint failure: allowed ingredient quantity = -0.5';
  EXCEPTION WHEN check_violation THEN END;

  -- 9. recipe_ingredients.position < 0 check
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, position)
    VALUES (v_rec_id, 'Sugar', 1.0, -1);
    RAISE EXCEPTION 'Constraint failure: allowed ingredient position = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 10. recipe_ingredients.name IS NULL check
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, position)
    VALUES (v_rec_id, NULL, 1.0, 1);
    RAISE EXCEPTION 'Constraint failure: allowed ingredient name = NULL';
  EXCEPTION WHEN not_null_violation THEN END;

  -- 11. recipe_steps.step_number <= 0 check
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description)
    VALUES (v_rec_id, 0, 'Mix');
    RAISE EXCEPTION 'Constraint failure: allowed step_number = 0';
  EXCEPTION WHEN check_violation THEN END;

  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description)
    VALUES (v_rec_id, -1, 'Mix');
    RAISE EXCEPTION 'Constraint failure: allowed step_number = -1';
  EXCEPTION WHEN check_violation THEN END;

  -- 12. recipe_steps.timer_seconds < 0 check
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description, timer_seconds)
    VALUES (v_rec_id, 1, 'Mix', -10);
    RAISE EXCEPTION 'Constraint failure: allowed timer_seconds = -10';
  EXCEPTION WHEN check_violation THEN END;

  -- 13. recipe_steps.description IS NULL check
  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description)
    VALUES (v_rec_id, 1, NULL);
    RAISE EXCEPTION 'Constraint failure: allowed step description = NULL';
  EXCEPTION WHEN not_null_violation THEN END;

  -- 14. Foreign key violations (invalid recipe_id)
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, position)
    VALUES ('00000000-0000-0000-0000-000000000000', 'Water', 1.0, 1);
    RAISE EXCEPTION 'Constraint failure: allowed ingredient with non-existent recipe_id';
  EXCEPTION WHEN foreign_key_violation THEN END;

  BEGIN
    INSERT INTO public.recipe_steps (recipe_id, step_number, description)
    VALUES ('00000000-0000-0000-0000-000000000000', 1, 'Boil');
    RAISE EXCEPTION 'Constraint failure: allowed step with non-existent recipe_id';
  EXCEPTION WHEN foreign_key_violation THEN END;

END $$;


-- =========================================================================
-- ADVERSARIAL TEST 4: Deferrable Unique Constraint Swap and Deferral Behavior
-- =========================================================================
DO $$
DECLARE
  v_rec_id UUID;
BEGIN
  -- Insert a recipe
  INSERT INTO public.recipes (title, slug, difficulty)
  VALUES ('Deferrable Test Recipe', 'deferrable-test-recipe', 1)
  RETURNING id INTO v_rec_id;

  -- Insert two steps
  INSERT INTO public.recipe_steps (recipe_id, step_number, description)
  VALUES 
    (v_rec_id, 1, 'Step 1'),
    (v_rec_id, 2, 'Step 2');

  -- Update step 1 to 2. Under immediate constraints, this would raise unique_violation.
  -- Under deferrable initially deferred, it succeeds because checking is deferred.
  UPDATE public.recipe_steps SET step_number = 2 WHERE recipe_id = v_rec_id AND step_number = 1;

  -- Now we have two step 2s. We attempt to force immediate checking.
  -- This should raise a unique_violation exception.
  BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Constraint check failed: duplicate step_number was not caught by SET CONSTRAINTS IMMEDIATE';
  EXCEPTION WHEN unique_violation THEN
    -- Expected behavior
  END;

  -- Reset constraints to DEFERRED so the transaction remains valid
  SET CONSTRAINTS ALL DEFERRED;

END $$;

ROLLBACK;

\echo '=== All Adversarial Tests Passed Successfully ==='
