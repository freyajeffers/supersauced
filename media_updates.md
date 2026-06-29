@agent We are replacing Cloudinary with Bunny.net (Bunny Storage + Bunny Optimizer) in our Super Sauced project to save on bandwidth costs. 

Please execute the following tasks to update our stack:

### 1. Database Migration (via Supabase MCP)
We need to remove the Cloudinary-specific media table and replace foreign keys with simple string paths. Please generate and execute the SQL to:
- Drop the `media_assets` table (and remove any foreign key constraints pointing to it).
- Update `user_profiles`: Add `avatar_path VARCHAR(255)` (replace `avatar_media_id`).
- Update `product_media`: Add `file_path VARCHAR(255)` (replace `media_id`).
- Update `recipe_media`: Add `file_path VARCHAR(255)` (replace `media_id`).
- Update `step_media`: Add `file_path VARCHAR(255)` (replace `media_id`).

### 2. Frontend Image Utility (TypeScript)
Write a TypeScript utility function `getBunnyImageUrl(path: string, width?: number)` for our frontend. 
- It should take a relative file path (e.g., `recipes/kale-pesto.jpg`).
- It should prepend our Bunny Pull Zone URL (use `NEXT_PUBLIC_BUNNY_URL` or similar env var).
- If a `width` is provided, it should append Bunny Optimizer query parameters (e.g., `?width=500&aspect_ratio=1:1`).

### 3. Supabase Edge Function: Secure Avatar Upload
Because we cannot expose our Bunny API keys on the frontend, write a Supabase Edge Function named `upload-user-avatar`.
- It should accept a `multipart/form-data` image from the client.
- It must verify the user's Supabase Auth JWT to ensure they are logged in.
- It should use the `fetch` API to make a `PUT` request to the Bunny Storage API (using a `BUNNY_STORAGE_API_KEY` secret) to save the file to a `/users/avatars/{user_id}.jpg` path.
- Finally, it should use the Supabase Admin client to update the `avatar_path` in the `user_profiles` table for that user.

### 4. Directus CMS Configuration Instructions
Generate a `.env.example` snippet showing the S3 configuration variables required to connect Directus natively to Bunny Storage so our content team can upload recipe media directly via the CMS.
