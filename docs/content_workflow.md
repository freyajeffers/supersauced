# Content Workflow & Integration Guide

This guide establishes the complete Content Workflow, Database Mapping, Role-Based Access Control (RBAC), and Media Asset Pipeline for the Super Sauced platform. It details the integration between Directus CMS, Supabase (PostgreSQL), Cloudinary, and the mobile client application (React Native / Expo).

---

## Table of Contents

1. [Directus CMS to Supabase Database Mapping](#1-directus-cms-to-supabase-database-mapping)
2. [Role-Based Access Control (RBAC) Setup](#2-role-based-access-control-rbac-setup)
3. [Media Storage Pipeline Specifications](#3-media-storage-pipeline-specifications)
4. [Directus CMS Media Integrations](#4-directus-cms-media-integrations)
5. [CDN Preloading Mechanics for Guided Cooking](#5-cdn-preloading-mechanics-for-guided-cooking)

---

## 1. Directus CMS to Supabase Database Mapping

Directus CMS interfaces directly with Supabase via PostgreSQL database reflection. The CMS maps database tables to **Collections** and columns to **Fields**. Standard UI controls and validation constraints must be configured in Directus to guarantee that all entered data satisfies the Supabase schema requirements.

### 1.1 Collections & Fields Schema Mapping

Below is the exact field-by-field mapping between the Supabase PostgreSQL database tables and the Directus CMS dashboard interface.

#### A. Recipes Collection (`recipes` / `public.recipes`)

* **Database Table**: `public.recipes`
* **Primary Key**: `id` (UUID, auto-generated via `gen_random_uuid()`)

| Database Column | Directus Field Name | Type | UI Interface | Constraints & UI Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. Read-only. |
| `title` | `title` | String | Text Input | Required. Max length: 255. |
| `slug` | `slug` | String | Text Input | Required, Unique. Auto-slugified from `title` via Directus Flows. |
| `description` | `description` | Text | Text Area | Optional recipe overview. |
| `hero_image_url` | `hero_image_url` | String | Text Input | Supabase Storage URL. Direct string input. |
| `difficulty` | `difficulty` | Integer | Dropdown (Choices) | Required. Choices: `1` (Easy), `2` (Medium), `3` (Hard). |
| `cook_time_minutes` | `cook_time_minutes` | Integer | Numeric Input | Optional. Min value: `0`. |
| `calories_per_serving` | `calories_per_serving` | Integer | Numeric Input | Optional. Min value: `0`. |
| `protein_g` | `protein_g` | Integer | Numeric Input | Optional. Min value: `0`. |
| `fat_g` | `fat_g` | Integer | Numeric Input | Optional. Min value: `0`. |
| `carbs_g` | `carbs_g` | Integer | Numeric Input | Optional. Min value: `0`. |
| `cube_tags` | `cube_tags` | Array | Tags Input | Stored as `TEXT[]`. Choices correspond to product SKUs. |
| `dietary_tags` | `dietary_tags` | Array | Tags Input | Stored as `TEXT[]`. Choices correspond to lifestyle labels. |
| `servings_default` | `servings_default` | Integer | Numeric Input | Optional. Min value: `1`. |
| `is_published` | `is_published` | Boolean | Toggle (Switch) | Default: `false`. Controls visibility on production apps. |
| `created_at` | `created_at` | Timestamp | Datetime (Read-only) | Automatically populated on insert. |
| `updated_at` | `updated_at` | Timestamp | Datetime (Read-only) | Automatically updated via database trigger. |
| -- | `ingredients` | O2M Relation | One-to-Many | Inline nested grid linking `recipe_ingredients`. |
| -- | `steps` | O2M Relation | One-to-Many | Inline nested grid linking `recipe_steps`. |

#### B. Recipe Ingredients Collection (`recipe_ingredients` / `public.recipe_ingredients`)

* **Database Table**: `public.recipe_ingredients`
* **Primary Key**: `id` (UUID, auto-generated)
* **Relationship**: Many-to-One (M2O) to `recipes` (`recipe_id`)

| Database Column | Directus Field Name | Type | UI Interface | Constraints & UI Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. Read-only. |
| `recipe_id` | `recipe_id` | M2O Relation | Relationship | References parent `recipes.id`. Hidden in inline grid. |
| `quantity` | `quantity` | Decimal / Float | Numeric Input | Required. Set step to `0.1` in Directus configuration. Min: `0.0`. |
| `unit` | `unit` | String | Dropdown / Choices | Optional. Choices: `cups`, `tsp`, `tbsp`, `g`, `oz`, `pieces`, `ml`. |
| `name` | `name` | String | Text Input | Required. Name of the ingredient (e.g., "Kosher Salt"). |
| `notes` | `notes` | Text | Text Input | Optional preparation notes (e.g., "finely chopped"). |
| `position` | `position` | Integer | Sort (Hidden) | Bound to Directus O2M sort index to track display order. |

#### C. Recipe Steps Collection (`recipe_steps` / `public.recipe_steps`)

* **Database Table**: `public.recipe_steps`
* **Primary Key**: `id` (UUID, auto-generated)
* **Relationship**: Many-to-One (M2O) to `recipes` (`recipe_id`)

| Database Column | Directus Field Name | Type | UI Interface | Constraints & UI Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. Read-only. |
| `recipe_id` | `recipe_id` | M2O Relation | Relationship | References parent `recipes.id`. Hidden in inline grid. |
| `step_number` | `step_number` | Integer | Numeric Input | Required. Step sequence number. Min: `1`. |
| `description` | `description` | Text | Text Area | Required. Cooking instructions. |
| `video_url` | `video_url` | String | Text Input | Optional Cloudinary streaming URL. |
| `timer_seconds` | `timer_seconds` | Integer | Numeric Input | Optional timer. Min: `0`. |
| `tip` | `tip` | Text | Text Input | Optional tip or technique advice. |

---

### 1.2 Directus UI and Validation Setup Guidelines

1. **Strict Decimal Precision**:
    To support exact scaling (e.g., multiplying quantities for serving adjustments), the database type of `recipe_ingredients.quantity` is defined as `NUMERIC(10,1)`. In the Directus field interface settings, configure the Numeric input to use a decimal step of `0.1` and disable automatic rounding. This prevents common floating-point errors (e.g., rendering `0.300000004` instead of `0.3`) in the mobile user interface.
2. **O2M Nesting and Sorting**:
    The relations `ingredients` and `steps` within the `recipes` collection must be configured as **One-to-Many (O2M)** nested tables.
    * Ensure "Allow Reordering" is enabled.
    * For `recipe_ingredients`, bind the Directus Sort field to the database column `position`.
    * Moving rows dynamically updates this column value to preserve presentation order.
3. **Deferrable Unique Constraint**:
    The `recipe_steps` table enforces a unique index on `(recipe_id, step_number)` to prevent duplicate step indices. This is declared in the database as:

    ```sql
    CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
    ```

    This deferral is critical. When a Content Editor rearranges step rows (e.g., swapping Step 1 and Step 2), Directus issues update commands in a batch within a single transaction. Deferring the constraint checking to the transaction commit prevents transient uniqueness violations during the update steps.

---

## 2. Role-Based Access Control (RBAC) Setup

To enforce editorial integrity and maintain draft privacy, access rules are configured at both the CMS application layer (Directus) and the database storage layer (Supabase Row-Level Security).

```
                      ┌──────────────────────┐
                      │    Directus CMS      │
                      └──────────┬───────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
      ┌─────────────────────────┐ ┌─────────────────────────┐
      │  Content Creator/Author │ │ Content Editor/Publisher│
      ├─────────────────────────┤ ├─────────────────────────┤
      │ • Can only edit drafts  │ │ • Can publish content   │
      │ • Can read all recipes  │ │ • Full CRUD access      │
      └─────────────────────────┘ └─────────────────────────┘
                                 │ (Writes bypass DB RLS via admin keys)
                                 ▼
                     ┌───────────────────────┐
                     │ Supabase PostgreSQL DB│
                     ├───────────────────────┤
                     │ RLS Policies Active:  │
                     │ • Anon/User: Pub only │
                     │ • QA/Editor: All      │
                     └───────────────────────┘
```

### 2.1 CMS Layer (Directus Permissions)

Three system roles govern operations within the CMS:

#### A. Administrator (System Default)

* **Permissions**: Full read, write, create, and delete privileges on all collections, including system metadata and schema definitions.

#### B. Content Creator / Author

Designed for writers/creators who input recipe data. They can write drafts but cannot publish them or edit already-published content.

* **`recipes` Collection**:
  * **Create**: Allowed.
  * **Read (Filter JSON)**: Authors can read all published recipes or any draft recipe they created.

        ```json
        {
          "_or": [
            {
              "is_published": { "_eq": false },
              "user_created": { "_eq": "$CURRENT_USER" }
            },
            {
              "is_published": { "_eq": true } }
          ]
        }
        ```

  * **Update (Filter JSON)**: Authors can only edit drafts they created. The `is_published` field must be configured as **Read-Only** for this role in field-level settings.

        ```json
        {
          "is_published": { "_eq": false },
          "user_created": { "_eq": "$CURRENT_USER" }
        }
        ```

  * **Delete (Filter JSON)**: Authors can only delete drafts they created.

        ```json
        {
          "is_published": { "_eq": false },
          "user_created": { "_eq": "$CURRENT_USER" }
        }
        ```

* **`recipe_ingredients` & `recipe_steps` Collections**:
  * **Create (Validation Filter JSON)**: Creators can only add ingredients/steps to drafts they own.

        ```json
        {
          "recipe_id": {
            "is_published": { "_eq": false },
            "user_created": { "_eq": "$CURRENT_USER" }
          }
        }
        ```

  * **Read (Filter JSON)**:

        ```json
        {
          "recipe_id": {
            "_or": [
              {
                "is_published": { "_eq": false },
                "user_created": { "_eq": "$CURRENT_USER" }
              },
              {
                "is_published": { "_eq": true }
              }
            ]
          }
        }
        ```

  * **Update / Delete (Filter JSON)**:

        ```json
        {
          "recipe_id": {
            "is_published": { "_eq": false },
            "user_created": { "_eq": "$CURRENT_USER" }
          }
        }
        ```

#### C. Content Editor / Publisher

Designed for reviewers who approve, modify, and publish draft content.

* **`recipes`, `recipe_ingredients`, `recipe_steps`**: Full CRUD access. Can update all columns and set `is_published = true`.
* **System Collections**: Read-only. Restricts configuration tampering.

---

### 2.2 Database Layer (Supabase RLS Policies)

The Supabase PostgreSQL database enforces **Row-Level Security (RLS)** to protect the API endpoints generated by PostgREST.

1. **Anonymous & Authenticated Users**: Represent standard mobile consumers who are restricted to accessing only published recipes.
2. **Staging / QA App Users (`cms_editor`)**: Represent preview builds. The client signs in via an identity provider or custom claim, generating a JWT where `auth.jwt() ->> 'role'` is `'cms_editor'`. These builds are allowed to view draft recipes.

#### SQL DDL for RLS Policies

```sql
-- 1. Enable RLS on all tables
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Recipes Table Policies
CREATE POLICY "Allow public SELECT on published recipes"
    ON public.recipes FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

CREATE POLICY "Allow editors to SELECT all recipes"
    ON public.recipes FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'cms_editor');

-- 3. Recipe Ingredients Table Policies
CREATE POLICY "Allow public SELECT on published recipe ingredients"
    ON public.recipe_ingredients FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = public.recipe_ingredients.recipe_id
              AND public.recipes.is_published = true
        )
    );

CREATE POLICY "Allow editors to SELECT all recipe ingredients"
    ON public.recipe_ingredients FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'cms_editor'
    );

-- 4. Recipe Steps Table Policies
CREATE POLICY "Allow public SELECT on published recipe steps"
    ON public.recipe_steps FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.recipes
            WHERE public.recipes.id = public.recipe_steps.recipe_id
              AND public.recipes.is_published = true
        )
    );

CREATE POLICY "Allow editors to SELECT all recipe steps"
    ON public.recipe_steps FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'cms_editor'
    );

-- 5. User Profiles (CRM) Policies (Access restricted to own profile only)
CREATE POLICY "Allow select own profile" ON public.user_profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Allow insert own profile" ON public.user_profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow update own profile" ON public.user_profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

---

## 3. Media Storage Pipeline Specifications

To optimize mobile performance and satisfy the core user journey constraint ("Speed to Meal"), video assets and static image assets are stored on distinct platforms.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             Media Pipelines                                │
└────────────────────────────────────────────────────────────────────────────┘
         │                                                      │
         ▼ (Step-by-Step Videos)                                ▼ (Hero Images)
┌──────────────────────────────────┐                  ┌──────────────────────┐
│          Cloudinary CDN          │                  │   Supabase Storage   │
├──────────────────────────────────┤                  ├──────────────────────┤
│  • MP4 H.264 / AVC Codec         │                  │  • Public Bucket     │
│  • AAC-LC Audio Codec            │                  │  • Caching: 1 Year   │
│  • Max Resolution: 720p / 1080p  │                  │  • Max size: 5MB     │
│  • Size Limit: 10MB              │                  │  • WebP, Jpeg, Png   │
│  • dynamic f_auto, q_auto parameters                └──────────────────────┘
└──────────────────────────────────┘
```

### 3.1 Cloudinary Video Specifications (Guided Cooking)

Step-by-step videos play in the mobile Guided Cooking screen. To ensure playback starts in under 3 seconds and prevents streaming interruptions, videos must comply with the following standards:

* **Format & Container**: `MP4` (with progressive download support) and `HLS` (`.m3u8` playlist) for adaptive streaming.
* **Video Codec**: H.264 (AVC) - Main Profile, Level 4.1.
* **Audio Codec**: AAC-LC (Stereo, 48kHz, 128kbps).
* **Resolution**: 720p preferred (`720x1280` vertical or `720x720` square) for vertical devices. Maximum: `1080p`.
* **File Size Limit**: 10 MB per step video.
* **Public ID Convention**: `recipes/{recipe-slug}/steps/step-{step-number}`.
* **Dynamic Compression Parameters**:
    Mobile applications must load videos using Cloudinary's dynamic optimization URL parameters to reduce bandwidth consumption:
  * `f_auto`: Delivers optimal formats based on client capabilities (e.g., WebM for Android, HEVC/MP4 for iOS).
  * `q_auto`: Controls compression dynamically to output high quality at minimal byte sizes.
  * `vc_h264`: Assures output codec matches H.264.
  * **Optimized URL Example**:
        `https://res.cloudinary.com/your-cloud-name/video/upload/f_auto,q_auto,vc_h264/recipes/classic-marinara/steps/step-1.mp4`

---

### 3.2 Supabase Storage Specifications (Hero Images)

Static recipe headers are fetched directly from a public Supabase Storage bucket.

* **Bucket Name**: `recipe-hero-images`
* **Access Level**: Public (Read access is granted to all anonymous traffic).
* **Allowed File Types**: `image/jpeg`, `image/png`, `image/webp`.
* **Max File Size Limit**: 5 MB.
* **CDN Caching Header**:
    The bucket metadata forces Cloudflare CDN to cache the assets permanently on edge servers:

    ```
    Cache-Control: public, max-age=31536000, immutable
    ```

---

## 4. Directus CMS Media Integrations

### 4.1 Database Connection and API Authentication

* **Direct Sync**: Directus bypasses RLS for write operations using administrative PostgreSQL credentials, connecting via environment variables:

    ```env
    DB_CLIENT="pg"
    DB_HOST="aws-0-us-west-1.pooler.supabase.com"
    DB_PORT=5432
    DB_DATABASE="postgres"
    DB_USER="postgres.your-project-id"
    DB_PASSWORD="your-secure-db-password"
    DB_SSL="true"
    ```

* **API Tokens**: Directus exposes metadata to staging/QA tools using a static bearer token (`DIRECTUS_KEY`) configured in Directus settings.

---

### 4.2 Supabase Storage S3 Adaptor Configuration

Directus writes files directly to the Supabase Storage bucket by using the S3 driver in its `.env` configuration file:

```env
# Directus Storage Driver Configuration for Supabase S3 Compatibility
STORAGE_LOCATIONS="supabase"
STORAGE_SUPABASE_DRIVER="s3"
STORAGE_SUPABASE_KEY="your-supabase-service-role-key"
STORAGE_SUPABASE_SECRET="your-supabase-service-role-key"
STORAGE_SUPABASE_BUCKET="recipe-hero-images"
STORAGE_SUPABASE_ENDPOINT="https://your-supabase-project.supabase.co/storage/v1/s3"
STORAGE_SUPABASE_REGION="us-east-1"
STORAGE_SUPABASE_ROOT="/"
```

---

### 4.3 Cloudinary Automated Video Upload Hook

Content creators paste Cloudinary CDN video URLs directly into the `recipe_steps.video_url` field. To automate this, a custom Directus action hook can intercept uploads to directus files, push videos to Cloudinary, and save the resulting Cloudinary URL:

```javascript
// Directus Extension: extensions/hooks/cloudinary-upload/index.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = ({ action }) => {
  action('files.upload', async ({ payload, accountability }, { database }) => {
    // Intercept if file type is video
    if (payload.type && payload.type.startsWith('video/')) {
      try {
        // Upload temporary Directus file to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(payload.filepath, {
          resource_type: "video",
          folder: "recipes",
          use_filename: true,
          unique_filename: true
        });

        // The secure Cloudinary URL is returned
        console.log(`Successfully uploaded video to Cloudinary: ${uploadResult.secure_url}`);
        
        // This URL can be pasted into the recipe_steps.video_url field
        return {
          ...payload,
          embed: uploadResult.secure_url
        };
      } catch (error) {
        console.error("Cloudinary upload hook failed:", error);
      }
    }
  });
};
```

---

## 5. CDN Preloading Mechanics for Guided Cooking

During Guided Cooking, latency spikes when switching steps will disrupt the user's cooking flow. To guarantee zero-buffer transitions, the React Native mobile application uses a **sliding window caching logic**.

### 5.1 Sliding Window Preload Strategy

While the user is cooking at Step $N$, the application maintains a cache window of size 3:

1. **Step $N$ (Active)**: Video plays immediately from the cached stream.
2. **Step $N+1$ (Forward Preload)**: App preloads the video to the local cache directory.
3. **Step $N-1$ (Backward Cache)**: App holds the previous video file in the cache in case the user navigates back.

```
       [Step N-1] <=====> [Step N] <=====> [Step N+1]
      (Cached / Prev)    (Active Play)    (Preloading / Next)
```

---

### 5.2 Preloading Code (React Native + Expo FileSystem)

The class below manages the local caching directories and handles download requests in the background:

```typescript
// utils/VideoCacheManager.ts
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';

interface PreloadQueue {
  currentUrl: string;
  nextUrl?: string;
  prevUrl?: string;
}

export class VideoCacheManager {
  private static cacheDir = `${FileSystem.cacheDirectory}video-cache/`;

  /**
   * Initializes the video cache directory.
   */
  public static async init(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
        console.log("Video cache directory initialized successfully.");
      }
    } catch (error) {
      console.error("Failed to initialize video cache directory:", error);
    }
  }

  /**
   * Downloads a video from a remote URL to the local file system cache.
   * If the file is already cached, it returns the local file URI immediately.
   * 
   * @param url The remote CDN video URL.
   * @returns The local file URI or the fallback remote URL if download fails.
   */
  public static async preloadVideo(url: string): Promise<string> {
    if (!url) return '';
    
    // Create a safe, unique filename using the URL
    const filename = encodeURIComponent(url);
    const localUri = `${this.cacheDir}${filename}`;

    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        return localUri;
      }

      // Download file to disk asynchronously
      console.log(`Preloading video in background: ${url}`);
      const downloadRes = await FileSystem.downloadAsync(url, localUri);
      console.log(`Video preloaded to local cache: ${downloadRes.uri}`);
      return downloadRes.uri;
    } catch (error) {
      console.warn("Failed to preload video to local disk cache, falling back to remote:", error);
      return url; // Fallback to streaming directly from CDN
    }
  }

  /**
   * Updates the preloading window when the active step transitions.
   * 
   * @param queue The queue containing active, next, and previous steps.
   */
  public static async updateQueue(queue: PreloadQueue): Promise<void> {
    // Initiate background downloads for predicted steps
    if (queue.nextUrl) {
      this.preloadVideo(queue.nextUrl); 
    }
    if (queue.prevUrl) {
      this.preloadVideo(queue.prevUrl);
    }
  }

  /**
   * Clear old cached items to prevent disk bloat.
   */
  public static async clearCache(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.cacheDir);
        await this.init();
      }
    } catch (error) {
      console.error("Failed to clear video cache:", error);
    }
  }
}
```
