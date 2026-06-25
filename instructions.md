Based on the Technical Recommendation Document and the Backend Architecture Recommendation, here is a comprehensive prompt you can provide to Antigravity to initiate the planning and development of the backend.

-----

**Prompt for Antigravity: Backend Architecture & Development Plan**

**Objective:**
Develop the backend infrastructure for the Super Sauced B2C mobile app (MVP) to be deployed within a 6-week timeframe. The goal is to establish a direct-to-consumer digital channel that captures first-party data and provides a frictionless recipe discovery and cooking experience.

**Core Technology Stack:**

  * **Database:** Supabase (PostgreSQL 16+).
  * **CMS:** Directus (Headless CMS) connected directly to the Supabase PostgreSQL database.
  * **Authentication:** Supabase Auth (Apple/Google Sign-In, Email Magic Links).
  * **Media Storage:** Cloudinary for optimized step-by-step videos; Supabase Storage for hero images.
  * **Data Fetching:** TanStack Query (React Query) for frontend-to-backend sync.

**Key Requirements & Architectural Guidelines:**

  * **Separation of Concerns:** Follow the "Display Shelf" model. Shopify remains the source of truth for commerce and raw recipe content; Supabase acts as the "Display Shelf" for app-specific states (Sauce Log, saved recipes, dietary profiles).
  * **Security:** Implement Row Level Security (RLS) on all tables to ensure users can only access their own data (e.g., profiles, saved recipes).
  * **Data Model:** Implement a relational schema with the following core tables:
      * `auth.users` (Managed by Supabase)
      * `public.users`: Linked to `auth.users` with an `ON DELETE CASCADE` rule.
      * `public.user_profiles`: CRM engine for dietary preferences, discovery channel, and "Sauce Log" (inventory).
      * `recipes`: Title, description, hero image URL, difficulty, macros, and tags.
      * `recipe_ingredients`: Linked to recipes; use strict decimal types for quantities to ensure accurate scaling.
      * `recipe_steps`: Linked to recipes; includes step number, description, Cloudinary video URL, and optional timers.
  * **Performance:** Optimize for "Speed to Meal"—ensure filtering (by cube/SKU, cook time, and dietary tags) is lightning-fast using GIN indexes on array types.

**Immediate Deliverables:**

1.  **Finalized Schema:** A SQL schema definition for the core tables mentioned above, including Foreign Key constraints and RLS policies.
2.  **API Specifications:** Documentation for REST/GraphQL endpoints generated via PostgREST for mobile integration.
3.  **Content Workflow:** Setup and documentation for the Directus-to-Supabase connection to enable the content team to begin recipe entry.
4.  **Auth Integration:** Configuration of Apple/Google OAuth and Magic Link flows.

**Timeline Constraint:**
The MVP must be testable by non-developers by Week 4. Priority for the 6-week launch is iOS (App Store).

To begin the planning and development of the Super Sauced backend, Antigravity requires the following comprehensive context derived from the project's core documentation.
1. Project Mission & Objective

    Product: Super Sauced B2C Mobile App.1
    MVP Goal: A functional 6-week launch focusing on a core user loop: Browse → Search/Filter → View Recipe → Guided Cooking → Save/Share.2
    CUJ (Core User Journey): "Speed to Meal"—users must find a dinner idea in under 30 seconds.1

2. Core Technical Stack

    Database: Supabase (PostgreSQL).1
    CMS: Directus (Headless CMS) connected directly to the Supabase DB.1
    Auth: Supabase Auth (Apple, Google, and Email Magic Links).1
    Media: Cloudinary (Videos) and Supabase Storage (Hero Images).1
    Frontend Sync: TanStack Query (React Query).1

3. Relational Database Schema
The backend must implement a relational architecture to support dynamic scaling and fast filtering.3

    user_profiles: CRM engine tracking dietary preferences and "Sauce Log" (inventory).3
    recipes: Core content including cube_tags[] and dietary_tags[].1
    recipe_ingredients: Must use strict NUMERIC types (not floats) for accurate serving size scaling.3
    recipe_steps: Linked to recipes with step numbers, descriptions, and Cloudinary URLs.1

4. Performance & Security Requirements

    Indexing: GIN indexes are required on cube_tags and dietary_tags for lightning-fast search.3
    Data Integrity: ON DELETE CASCADE rules must be enforced to prevent orphaned data when content is deleted via CMS.3
    Security: Row Level Security (RLS) must be configured from day one so users only access their own profile and saved data.1
    Offline Mode: Not supported for MVP; the app requires an active connection.1

5. Key Backend Features (Phase 1)

    Authentication: SSO via Apple/Google and passwordless magic links.1
    Content Admin: Directus interface for the content team to manage recipes without engineering help.1
    Data Fetching: Support for optimistic UI updates (e.g., hearting a recipe updates the UI before DB confirmation).1
    Analytics: Integration with PostHog or Firebase for tracking saves, hearts, and filter usage.1

6. Development Timeline (6-Week MVP)

    Week 2 (Current): Finalize data model and technical recommendations.2
    Week 3: Connect app to structured data and create fetch functions.4
    Week 4: Internal build for non-developer testing; freeze MVP scope.2
    Jun 23, 2026: Current project date; development is in active phase.

The schema for the Super Sauced MVP incorporates several critical architectural decisions to meet the product's performance and reliability goals:

### **1. "Speed to Meal" via GIN Indexing**

  * **Decision**: Applied **Generalized Inverted Indexes (GIN)** to the `cube_tags` and `dietary_tags` array columns.
  * **Impact**: Enables lightning-fast set intersections. Users can filter recipes by complex combinations (e.g., "High-Protein" + "Vegan" + "Spicy Cube") with sub-100ms response times, fulfilling the CUJ of finding a meal in under 30 seconds.

### **2. Precision Scaling with Numeric Types**

  * **Decision**: Used `NUMERIC(10,1)` for ingredient quantities instead of standard floating-point numbers.
  * **Impact**: Prevents common binary floating-point errors (e.g., showing "0.300000004" instead of "0.3"). This ensures the **Serving Size Adjuster** displays accurate, clean decimals for cooks.

### **3. Relational Integrity & Automated Cleanup**

  * **Decision**: Implemented strict **Foreign Key** constraints with `ON DELETE CASCADE` across the `recipes`, `recipe_ingredients`, and `recipe_steps` tables.
  * **Impact**: Ensures data integrity when the content team manages recipes via the **Directus CMS**. Deleting a recipe automatically purges its associated steps and ingredients, preventing "orphaned" data from bloating the database.

### **4. "Display Shelf" Architecture**

  * **Decision**: Separated commerce data (Shopify) from app-specific states (Supabase).
  * **Impact**: Supabase acts as a high-performance "Display Shelf." By mirroring only what the app needs for the core loop—such as the **Sauce Log** and **Saved Recipes**—the system remains resilient even if Shopify's API experiences latency.

### **5. Optimized Content Delivery**

  * **Decision**: Decoupled media storage by using **Cloudinary** for step videos and **Supabase Storage** for hero images, with URLs stored directly in the relational tables.
  * **Impact**: **Guided Mode** can preload video content via a CDN while the database handles the text-based metadata, ensuring the UI remains responsive on mobile connections.

As a Senior Backend Architect, I have designed the PostgreSQL schema to meet the high-performance requirements of the Super Sauced MVP. This schema prioritizes "Speed to Meal" via specialized indexing and ensures data integrity through strict typing and relational constraints.

### **Core Database Schema**

``` sql
-- 1. EXTENSIONS
-- Enable pg_trgm for fuzzy search and btree_gin for indexing
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 2. USER PROFILES TABLE
-- Acts as the CRM engine and identity link to auth.users
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    dietary_preferences TEXT[] DEFAULT '{}',
    discovery_channel TEXT,
    sauce_log JSONB DEFAULT '{}', -- Tracks cube inventory per SKU
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. RECIPES TABLE
-- The primary content table for the curated recipe library
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    hero_image_url TEXT,
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 3),
    cook_time_minutes INTEGER,
    calories_per_serving INTEGER,
    protein_g INTEGER,
    fat_g INTEGER,
    carbs_g INTEGER,
    cube_tags TEXT[] DEFAULT '{}', -- Cube/SKU tags for filtering
    dietary_tags TEXT[] DEFAULT '{}', -- Lifestyle/dietary tags
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. RECIPE INGREDIENTS TABLE
-- Uses NUMERIC(10,1) to ensure precision for ingredient scaling
CREATE TABLE public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    quantity NUMERIC(10,1) NOT NULL, -- Prevents floating-point math errors
    unit TEXT,
    name TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER
);

-- 5. RECIPE STEPS TABLE
-- Structures the Guided Mode flow with video CDN links and timers
CREATE TABLE public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    video_url TEXT, -- Optimized Cloudinary CDN URL
    timer_seconds INTEGER,
    tip TEXT,
    UNIQUE (recipe_id, step_number)
);

```

### **Architectural Recommendations for Performance**

  * **Speed to Meal Indexing**: I have implemented **GIN (Generalized Inverted Index)** on the `cube_tags` and `dietary_tags` arrays. This allows the database to perform high-speed set intersections when users filter for complex combinations like "Vegetarian" + "High Protein" + "Super Spicy Cube".
    ``` sql
    CREATE INDEX idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
    CREATE INDEX idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
    
    ```
  * **Data Integrity**: Foreign key constraints with `ON DELETE CASCADE` ensure that when a recipe is deleted via the Directus CMS, all associated ingredients and steps are automatically purged, preventing orphaned data.
  * **Scaling Accuracy**: By using the `NUMERIC` type for quantities, the app will display clean values (e.g., "0.3 cups") instead of fragmented floating-point numbers (e.g., "0.300000004") which can confuse users during cooking.
  * **Security**: Before launch, **Row Level Security (RLS)** must be applied to `user_profiles` to ensure users can only access their specific dietary preferences and Sauce Log data.

