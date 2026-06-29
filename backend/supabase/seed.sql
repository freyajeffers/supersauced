-- ==========================================
-- SUPER SAUCED: DATABASE SEED DATA
-- ==========================================

-- 1. AUTH USERS (Passwords are 'SecurePassword123!')
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud
) VALUES (
    'e7b39a3f-e8b9-47bb-a951-40439d5e3111',
    '00000000-0000-0000-0000-000000000000',
    'chef@test.com',
    extensions.crypt('SecurePassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Sauce Chef", "role": "cms_editor"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
), (
    'e7b39a3f-e8b9-47bb-a951-40439d5e3222',
    '00000000-0000-0000-0000-000000000000',
    'cook@test.com',
    extensions.crypt('SecurePassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Casual Cook", "role": "authenticated"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- 2. MEDIA ASSETS (DECOMMISSIONED - replaced with Bunny.net direct paths)

-- 3. USER PROFILES & SETTINGS
INSERT INTO public.user_profiles (user_id, first_name, last_name, avatar_path, bio) VALUES
('e7b39a3f-e8b9-47bb-a951-40439d5e3111', 'Sauce', 'Chef', 'users/avatars/e7b39a3f-e8b9-47bb-a951-40439d5e3111.jpg', 'Head development chef for Super Sauced.'),
('e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'Casual', 'Cook', NULL, 'Enthusiastic home cook.')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_settings (user_id, measurement_system, push_notifications, newsletter) VALUES
('e7b39a3f-e8b9-47bb-a951-40439d5e3111', 'metric', true, true),
('e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'imperial', false, true)
ON CONFLICT (user_id) DO NOTHING;

-- 4. DIETARY TAGS & USER PREFERENCES
INSERT INTO public.dietary_tags (id, name, is_allergen) VALUES
('d1111111-1111-1111-1111-111111111111', 'Gluten-Free', false),
('d2222222-2222-2222-2222-222222222222', 'Vegan', false),
('d3333333-3333-3333-3333-333333333333', 'Vegetarian', false),
('d4444444-4444-4444-4444-444444444444', 'Peanuts', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_dietary_prefs (user_id, dietary_tag_id) VALUES
('e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'd1111111-1111-1111-1111-111111111111'), -- Cook is Gluten-Free
('e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'd2222222-2222-2222-2222-222222222222')  -- Cook is Vegan
ON CONFLICT (user_id, dietary_tag_id) DO NOTHING;

-- 5. PRODUCTS (Super Sauced Cubes) & NUTRITION
INSERT INTO public.products (id, sku, name, description, flavor_profile, is_active) VALUES
('b1111111-1111-1111-1111-111111111111', 'sauce-cube-classic', 'Classic Sauced Cube', 'Umami-rich baseline flavor enhancer.', 'Savory & Herbs', true),
('b2222222-2222-2222-2222-222222222222', 'sauce-cube-spicy', 'Spicy Sauced Cube', 'Zesty chili blend with a fiery finish.', 'Spicy Chili & Garlic', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_nutrition (product_id, serving_size_grams, calories, protein_g, carbs_g, fat_g) VALUES
('b1111111-1111-1111-1111-111111111111', 10.00, 35, 1.20, 5.50, 0.80),
('b2222222-2222-2222-2222-222222222222', 10.00, 42, 0.90, 6.10, 1.50)
ON CONFLICT (product_id) DO NOTHING;

-- 6. RECIPES & METRICS
INSERT INTO public.recipes (id, author_id, title, slug, description, status, published_at, dietary_tags, cube_tags) VALUES
('c1111111-1111-1111-1111-111111111111', 'e7b39a3f-e8b9-47bb-a951-40439d5e3111', 'Vegan Spicy Chili', 'vegan-spicy-chili', 'A hearty, slow-simmered vegan chili loaded with beans and vegetables, spiked with our Spicy Sauced Cube.', 'published', NOW() - INTERVAL '1 day', ARRAY['Vegan', 'Vegetarian', 'Gluten-Free']::TEXT[], ARRAY['spicy']::TEXT[]),
('c2222222-2222-2222-2222-222222222222', 'e7b39a3f-e8b9-47bb-a951-40439d5e3111', 'Gluten-Free Garlic Pasta', 'gf-garlic-pasta', 'Simple, elegant, and aromatic pasta tossed in garlic and herb olive oil using the Classic Sauced Cube.', 'published', NOW() - INTERVAL '12 hours', ARRAY['Gluten-Free', 'Vegetarian']::TEXT[], ARRAY['classic']::TEXT[])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recipe_metrics (recipe_id, prep_time_seconds, cook_time_seconds, servings, difficulty_level) VALUES
('c1111111-1111-1111-1111-111111111111', 900, 2700, 4, 'medium'),
('c2222222-2222-2222-2222-222222222222', 600, 900, 2, 'easy')
ON CONFLICT (recipe_id) DO NOTHING;

-- 7. CATEGORIES
INSERT INTO public.categories (id, parent_id, name) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'Dinner'),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Stews & Chilies'),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Pasta Dishes')
ON CONFLICT (id) DO NOTHING;


-- 8. INGREDIENTS & UNITS
INSERT INTO public.units (id, name, abbreviation) VALUES
('de111111-1111-1111-1111-111111111111', 'Grams', 'g'),
('de222222-2222-2222-2222-222222222222', 'Cups', 'cups'),
('de333333-3333-3333-3333-333333333333', 'Tablespoon', 'tbsp'),
('de444444-4444-4444-4444-444444444444', 'Teaspoon', 'tsp'),
('de555555-5555-5555-5555-555555555555', 'Piece', 'pc')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ingredients (id, name, default_unit_id) VALUES
('e1111111-1111-1111-1111-111111111111', 'Red Kidney Beans', 'de222222-2222-2222-2222-222222222222'),
('e2222222-2222-2222-2222-222222222222', 'Diced Tomatoes', 'de222222-2222-2222-2222-222222222222'),
('e3333333-3333-3333-3333-333333333333', 'Gluten-Free Spaghetti', 'de111111-1111-1111-1111-111111111111'),
('e4444444-4444-4444-4444-444444444444', 'Garlic Clove', 'de555555-5555-5555-5555-555555555555')
ON CONFLICT (id) DO NOTHING;

-- 9. RECIPE INGREDIENTS & PRODUCTS
INSERT INTO public.recipe_ingredients (id, recipe_id, ingredient_id, unit_id, quantity_decimal, quantity_numerator, quantity_denominator, preparation_state) VALUES
('44444444-4444-4444-4444-444444444411', 'c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'de222222-2222-2222-2222-222222222222', 2.00, 2, 1, 'rinsed and drained'),
('44444444-4444-4444-4444-444444444422', 'c1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222', 'de222222-2222-2222-2222-222222222222', 1.50, 3, 2, 'canned'),
('44444444-4444-4444-4444-444444444433', 'c2222222-2222-2222-2222-222222222222', 'e3333333-3333-3333-3333-333333333333', 'de111111-1111-1111-1111-111111111111', 200.00, 200, 1, 'dry'),
('44444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 'e4444444-4444-4444-4444-444444444444', 'de555555-5555-5555-5555-555555555555', 4.00, 4, 1, 'thinly sliced')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recipe_products (id, recipe_id, product_id, quantity) VALUES
('33333333-3333-3333-3333-333333333311', 'c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 1.00), -- Chili uses 1 Spicy Cube
('33333333-3333-3333-3333-333333333322', 'c2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 1.00)  -- Pasta uses 1 Classic Cube
ON CONFLICT (id) DO NOTHING;

-- 10. INSTRUCTION STEPS & MEDIA
INSERT INTO public.instruction_steps (id, recipe_id, step_number, instruction_text, is_active_cooking, timer_seconds) VALUES
('f1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 1, 'Sauté onions and garlic in olive oil until soft, then dissolve one Spicy Sauced Cube.', true, 300),
('f2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 2, 'Add kidney beans, diced tomatoes, and cover to simmer.', true, 2400),
('f3333333-3333-3333-3333-333333333333', 'c2222222-2222-2222-2222-222222222222', 1, 'Boil gluten-free pasta in salted water until al dente.', true, 600),
('f4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 2, 'Toss pasta in garlic olive oil with one dissolved Classic Sauced Cube.', true, 180)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.step_media (step_id, file_path) VALUES
('f1111111-1111-1111-1111-111111111111', 'videos/chili_step_1.mp4')
ON CONFLICT (step_id, file_path) DO NOTHING;

-- 11. USER ENGAGEMENT (Saved Recipes)
INSERT INTO public.saved_recipes (user_id, recipe_id, collection_name) VALUES
('e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'c1111111-1111-1111-1111-111111111111', 'Weeknight Favorites')
ON CONFLICT (user_id, recipe_id) DO NOTHING;

-- 12. SHOPPING LISTS & ITEMS
INSERT INTO public.shopping_lists (id, user_id, name, is_completed) VALUES
('11111111-1111-1111-1111-111111111111', 'e7b39a3f-e8b9-47bb-a951-40439d5e3222', 'Weekly Meal Prep Chili', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shopping_list_items (id, shopping_list_id, ingredient_id, product_id, quantity, is_checked_off) VALUES
('22222222-2222-2222-2222-222222222211', '11111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', NULL, 2.00, false),
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', NULL, 'b2222222-2222-2222-2222-222222222222', 1.00, false)
ON CONFLICT (id) DO NOTHING;
