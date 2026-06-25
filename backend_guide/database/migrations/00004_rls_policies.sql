-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Allow select own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- RLS Policies for recipes
CREATE POLICY "Allow select published or cms_editor" ON public.recipes
    FOR SELECT USING (is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor');

-- RLS Policies for recipe_ingredients
CREATE POLICY "Allow select ingredients for published or cms_editor" ON public.recipe_ingredients
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = recipe_ingredients.recipe_id
              AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
        )
    );

-- RLS Policies for recipe_steps
CREATE POLICY "Allow select steps for published or cms_editor" ON public.recipe_steps
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = recipe_steps.recipe_id
              AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
        )
    );
