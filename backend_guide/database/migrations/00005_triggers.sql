-- Trigger function to populate user_profiles from auth.users on insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_onboarding_survey JSONB;
    v_sauce_log JSONB;
BEGIN
    -- Extract values from raw_user_meta_data if present
    IF NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN
        v_onboarding_survey := NEW.raw_user_meta_data -> 'onboarding_survey';
        v_sauce_log := NEW.raw_user_meta_data -> 'sauce_log';
    ELSE
        v_onboarding_survey := '{}'::jsonb;
        v_sauce_log := '{}'::jsonb;
    END IF;

    -- Standardize NULL/null values
    IF v_onboarding_survey IS NULL OR jsonb_typeof(v_onboarding_survey) = 'null' THEN
        v_onboarding_survey := '{}'::jsonb;
    END IF;
    IF v_sauce_log IS NULL OR jsonb_typeof(v_sauce_log) = 'null' THEN
        v_sauce_log := '{}'::jsonb;
    END IF;

    INSERT INTO public.user_profiles (
        id,
        email,
        username,
        full_name,
        avatar_url,
        onboarding_survey,
        sauce_log
    )
    VALUES (
        NEW.id,
        NEW.email,
        CASE 
            WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' 
            THEN NEW.raw_user_meta_data ->> 'username' 
            ELSE NULL 
        END,
        CASE 
            WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' 
            THEN NEW.raw_user_meta_data ->> 'full_name' 
            ELSE NULL 
        END,
        CASE 
            WHEN NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' 
            THEN NEW.raw_user_meta_data ->> 'avatar_url' 
            ELSE NULL 
        END,
        v_onboarding_survey,
        v_sauce_log
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute handle_new_user()
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_updated_at_column triggers
CREATE OR REPLACE TRIGGER set_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
