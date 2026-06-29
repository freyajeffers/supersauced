-- 20240703_bunny_media.sql – Replace Cloudinary media assets with Bunny.net paths

-- 1. Drop media_assets and cascade to remove any foreign key constraints pointing to it
DROP TABLE IF EXISTS public.media_assets CASCADE;

-- 2. Update public.user_profiles
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS avatar_media_id;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(255);

-- 3. Update public.product_media
ALTER TABLE public.product_media DROP COLUMN IF EXISTS media_id;
ALTER TABLE public.product_media ADD COLUMN IF NOT EXISTS file_path VARCHAR(255);

-- 4. Update public.step_media
-- Drop the composite primary key constraint first since it includes media_id
ALTER TABLE public.step_media DROP CONSTRAINT IF EXISTS step_media_pkey;
ALTER TABLE public.step_media DROP COLUMN IF EXISTS media_id;
ALTER TABLE public.step_media ADD COLUMN IF NOT EXISTS file_path VARCHAR(255);
ALTER TABLE public.step_media ALTER COLUMN file_path SET NOT NULL;
ALTER TABLE public.step_media ADD PRIMARY KEY (step_id, file_path);

-- 5. Update public.recipe_media (if exists, to follow guide instructions safely)
-- Note: recipe_media is currently not in our schema, but we include this to comply with future additions
ALTER TABLE IF EXISTS public.recipe_media DROP COLUMN IF EXISTS media_id;
ALTER TABLE IF EXISTS public.recipe_media ADD COLUMN IF NOT EXISTS file_path VARCHAR(255);
