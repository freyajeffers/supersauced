-- Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_recipes ENABLE ROW LEVEL SECURITY;

-- user_profiles Policies
CREATE POLICY "Allow select own profile" ON public.user_profiles
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow update own profile" ON public.user_profiles
    FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow delete own profile" ON public.user_profiles
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- saved_recipes Policies
CREATE POLICY "Allow select own saved recipes" ON public.saved_recipes
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow insert own saved recipes" ON public.saved_recipes
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow update own saved recipes" ON public.saved_recipes
    FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow delete own saved recipes" ON public.saved_recipes
    FOR DELETE USING ((SELECT auth.uid()) = user_id);
