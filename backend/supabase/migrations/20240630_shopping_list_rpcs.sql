-- 20240630_shopping_list_rpcs.sql – PostgreSQL RPCs for complex shopping‑list calculations

/*
  add_recipe_to_shopping_list(user_id UUID, recipe_id UUID)
  --------------------------------------------------------
  Inserts all ingredients of the given recipe into the caller's
  shopping list (creating one if none exists).  If an ingredient
  already exists, its quantity is summed.
*/
CREATE OR REPLACE FUNCTION public.add_recipe_to_shopping_list(
    p_user_id   UUID,
    p_recipe_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_list_id   UUID;
    rec         RECORD;
BEGIN
    -- Find or create a shopping list for the user
    SELECT id INTO v_list_id FROM shopping_lists WHERE user_id = p_user_id LIMIT 1;
    IF v_list_id IS NULL THEN
        INSERT INTO shopping_lists (user_id, created_at) VALUES (p_user_id, now()) RETURNING id INTO v_list_id;
    END IF;

    -- Upsert each ingredient
    FOR rec IN SELECT ingredient_id, quantity, unit FROM recipe_ingredients WHERE recipe_id = p_recipe_id LOOP
        INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit)
            VALUES (v_list_id, rec.ingredient_id, rec.quantity, rec.unit)
        ON CONFLICT (shopping_list_id, ingredient_id, unit)
        DO UPDATE SET quantity = shopping_list_items.quantity + EXCLUDED.quantity;
    END LOOP;
END;
$$;

/*
  consolidate_shopping_list(user_id UUID)
  ---------------------------------------
  Merges duplicate items (same ingredient & unit) across all
  the user's pending lists, summing their quantities into a
  single list entry per ingredient/unit.
*/
CREATE OR REPLACE FUNCTION public.consolidate_shopping_list(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_list_id UUID;
BEGIN
    SELECT id INTO v_list_id FROM shopping_lists WHERE user_id = p_user_id LIMIT 1;
    IF v_list_id IS NULL THEN
        RETURN; -- nothing to consolidate
    END IF;

    WITH summed AS (
        SELECT ingredient_id, unit, SUM(quantity) AS qty
        FROM shopping_list_items
        WHERE shopping_list_id = v_list_id
        GROUP BY ingredient_id, unit
    )
    DELETE FROM shopping_list_items WHERE shopping_list_id = v_list_id;

    INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, quantity, unit)
    SELECT v_list_id, ingredient_id, qty, unit FROM summed;
END;
$$;

-- RLS policies for user isolation (example for shopping_lists & items)

-- Enable row level security
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

-- Allow users to SELECT/INSERT/UPDATE/DELETE only their own lists
CREATE POLICY shopping_lists_user_isolation ON shopping_lists
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY shopping_items_user_isolation ON shopping_list_items
    USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid()))
    WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid()));

-- Similar RLS for recipes (public read, cms_editor write) – placeholder example
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipes_public_read ON recipes
    FOR SELECT USING (is_published = true);
CREATE POLICY recipes_cms_editor_write ON recipes
    FOR ALL TO cms_editor USING (true);

-- RLS for user_profiles (owner only)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_owner ON user_profiles
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
