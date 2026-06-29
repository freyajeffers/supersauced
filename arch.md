In a Supabase architecture, the general rule of thumb is: **Use PostgREST for all direct database CRUD operations protected by Row Level Security (RLS)**, and **use Edge Functions for external API integrations, webhooks, and complex business logic.**

Based on the highly detailed Super Sauced database schema we created, here is the exact breakdown of which API endpoints should be handled by PostgREST versus Supabase Edge Functions.

---

### 1. Handled by PostgREST (The Auto-Generated API)
Because Supabase instantly generates a RESTful API (and GraphQL) for your Postgres database, you do not need to write backend code for standard data fetching or manipulation. You simply apply **Row Level Security (RLS)** policies to these tables to ensure users can only access what they are allowed to.

**Content Discovery (Read-Only for Users)**
*   `GET /recipes` (Fetch recipes, filter by category, search by title)
*   `GET /recipes?select=*,recipe_ingredients(*),instruction_steps(*)` (Fetch a full recipe with its nested ingredients and steps in one query)
*   `GET /products` (Fetch available Super Sauced cubes)
*   `GET /categories` (Fetch recipe categories)

**User Data & Preferences (CRUD with RLS)**
*   `GET, PATCH /user_profiles` (Users updating their bio, name, or avatar ID)
*   `GET, PATCH /user_settings` (Toggling metric/imperial or push notifications)
*   `GET, POST, DELETE /user_dietary_prefs` (Managing their own allergies/diets)

**User Engagement (CRUD with RLS)**
*   `GET, POST, DELETE /saved_recipes` (Bookmarking or un-bookmarking a recipe)
*   `POST /recipe_reviews` (Submitting a rating/review for a recipe)
*   `POST /cooking_history` (Logging that they cooked a meal)

**Shopping Lists (CRUD with RLS)**
*   `GET, POST, PATCH, DELETE /shopping_lists` (Managing their lists)
*   `GET, POST, PATCH, DELETE /shopping_list_items` (Checking off items or manually adding ingredients)

---

### 2. Handled by Supabase Edge Functions
Edge functions are required whenever you need to hide secret API keys, interact with third-party services, or execute complex multi-step logic that shouldn't live on the client.

**1. `sync-directus-content` (Webhook Receiver)**
*   **Why:** You are using Directus as a Headless CMS. When your content team publishes a new Recipe or Product in Directus, Directus needs to send a webhook to Supabase to update the Postgres database.
*   **Logic:** Receives the Directus JSON payload, validates a secret webhook token, and performs the necessary `INSERT` or `UPDATE` into the `recipes`, `products`, or `categories` tables.

**2. `generate-cloudinary-signature` (Media Uploads)**
*   **Why:** To allow users to upload their own avatars or photos for recipe reviews, they need to upload directly from their mobile app/browser to Cloudinary. You cannot put your Cloudinary Secret Key in the frontend code.
*   **Logic:** The client calls this Edge Function, the function uses your Cloudinary Secret to generate a signed upload token, and returns it to the client. The client then uploads the file directly to Cloudinary.

**3. `handle-new-user-signup` (Auth Trigger)**
*   **Why:** When a user signs up via Supabase Auth, you need to initialize their profile and settings.
*   **Logic:** Triggered automatically by a Supabase Auth Webhook. It inserts a new row into `user_profiles` and `user_settings`, and could optionally trigger a welcome email via an external service like Resend or SendGrid.

**4. `send-push-notification` (App Timers & Engagement)**
*   **Why:** If a user starts a recipe timer (e.g., "Let simmer for 20 mins"), or if you want to send a marketing notification ("New Vegan Pesto Cube available!").
*   **Logic:** Integrates with Apple APNs, Firebase Cloud Messaging (FCM), or OneSignal to dispatch notifications to the user's mobile device.

---

### 3. Handled by PostgreSQL RPCs (Remote Procedure Calls)
There is a middle ground. Sometimes you have complex database logic that *doesn't* require external APIs, but is too complex for a single PostgREST query. Instead of an Edge Function, you should write a Postgres SQL Function and call it via PostgREST (`POST /rpc/function_name`).

**1. `add_recipe_to_shopping_list`**
*   **Why:** If a user clicks "Add Recipe to Groceries", the database needs to fetch all `recipe_ingredients`, check if the user already has a pending shopping list, and insert all items. Doing this on the client requires multiple round-trip API calls. An RPC handles it in one database transaction.

**2. `consolidate_shopping_list`**
*   **Why:** If a user adds two different recipes that both require "Olive Oil", you don't want two separate list items. An RPC can run the math to combine "1 tbsp Olive Oil" and "2 tbsp Olive Oil" into a single row.

### Summary Checklist for Antigravity Agent
If you are passing this to your Antigravity AI, you can give it this exact prompt:

> *"Use PostgREST and configure RLS policies for all standard CRUD operations on recipes, profiles, and shopping lists. Create Supabase Edge Functions in the `/supabase/functions/` directory for `sync-directus`, `cloudinary-sign`, and `user-onboarding`. Create Postgres RPCs for complex shopping list math."*
