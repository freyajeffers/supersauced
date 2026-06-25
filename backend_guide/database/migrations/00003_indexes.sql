-- Apply GIN indexes on recipes
CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));

-- Apply GIN index on user_profiles for full-text search
CREATE INDEX IF NOT EXISTS idx_user_profiles_fulltext ON public.user_profiles USING GIN (to_tsvector('english', coalesce(username, '') || ' ' || email));
