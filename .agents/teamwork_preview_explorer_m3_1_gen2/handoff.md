# Handoff Report: Directus CMS Mapping for Supabase Recipes Schema

## 1. Observation
We examined the repository files to identify the database schema for `recipes`, `recipe_ingredients`, and `recipe_steps` tables and design their mapping to Directus collections.

### A. Database Schemas in Conflict
Two different versions of the schema exist in the repository:
1. **Old Serial-based Schema (`docs/schema.sql` lines 18-54)**:
   - File path: `/home/freya/supersauced/docs/schema.sql`
   - Defines serial IDs and older column names:
     ```sql
     CREATE TABLE IF NOT EXISTS public.recipes (
         id serial PRIMARY KEY,
         user_id uuid REFERENCES public.user_profiles (id) ON DELETE CASCADE,
         title text NOT NULL CHECK (title <> ''),
         description text,
         difficulty int CHECK (difficulty BETWEEN 1 AND 5),
         cook_time int, -- minutes
         servings int,
         cube_tags text[] DEFAULT '{}'::text[],
         dietary_tags text[] DEFAULT '{}'::text[],
         created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
     );
     ```
     `recipe_ingredients` uses column `ingredient` (instead of `name`) and `sort_order` (instead of `position`):
     ```sql
     CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
         id serial PRIMARY KEY,
         recipe_id integer REFERENCES public.recipes (id) ON DELETE CASCADE,
         ingredient text NOT NULL CHECK (ingredient <> ''),
         quantity numeric(10,1),
         unit text,
         sort_order int,
         created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
     );
     ```
     `recipe_steps` uses column `instruction` (instead of `description`), `media_url` (instead of `video_url`), and `sort_order`:
     ```sql
     CREATE TABLE IF NOT EXISTS public.recipe_steps (
         id serial PRIMARY KEY,
         recipe_id integer REFERENCES public.recipes (id) ON DELETE CASCADE,
         step_number int NOT NULL CHECK (step_number > 0),
         instruction text NOT NULL CHECK (instruction <> ''),
         media_url text,
         sort_order int,
         created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE (recipe_id, step_number)
     );
     ```
   - In addition, `/home/freya/supersauced/docs/schema.sql` is corrupted starting at line 56 with ANSI escape codes:
     ```sql
     56: -- 5_user_profiles_fulltext ON public.user_profil [18D [K
     57: public.user_profiles USING gin (to_tsvector('english', username || ' ' || e [1D [K
     58: email));
     ```
     This corruption causes the verifier script to fail:
     ```
     Loading database schema (docs/schema.sql)...
     ERROR:  syntax error at or near "public"
     LINE 1: public.user_profiles USING gin (to_tsvector('english', usern...
     ```

2. **Active UUID-based Schema (`instructions.md` lines 134-179 & `docs/test_schema.sql`)**:
   - File path: `/home/freya/supersauced/instructions.md`
   - Defines UUID IDs, additional metrics columns, and updated field names:
     ```sql
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
         cube_tags TEXT[] DEFAULT '{}',
         dietary_tags TEXT[] DEFAULT '{}',
         is_published BOOLEAN DEFAULT FALSE,
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     );
     ```
     `recipe_ingredients` uses `name` (instead of `ingredient`) and `position` (instead of `sort_order`):
     ```sql
     CREATE TABLE public.recipe_ingredients (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
         quantity NUMERIC(10,1) NOT NULL,
         unit TEXT,
         name TEXT NOT NULL,
         notes TEXT,
         sort_order INTEGER -- (Note: test_schema.sql and proposed_schema.sql use position)
     );
     ```
     `recipe_steps` uses `description` (instead of `instruction`), `video_url` (instead of `media_url`), and `timer_seconds`/`tip`:
     ```sql
     CREATE TABLE public.recipe_steps (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
         step_number INTEGER NOT NULL,
         description TEXT NOT NULL,
         video_url TEXT,
         timer_seconds INTEGER,
         tip TEXT,
         UNIQUE (recipe_id, step_number)
     );
     ```
   - The validation test suite `/home/freya/supersauced/docs/test_schema.sql` (and `/home/freya/supersauced/docs/validate.sql`) targets this exact UUID-based schema. For instance, in `test_schema.sql` lines 128-138:
     ```sql
     INSERT INTO public.recipes (title, slug, difficulty, is_published)
     VALUES ('Test Recipe', 'test-recipe', 2, true)
     RETURNING id INTO v_recipe_id;

     INSERT INTO public.recipe_ingredients (recipe_id, quantity, unit, name, position)
     VALUES (v_recipe_id, 1.5, 'cups', 'Flour', 1);

     INSERT INTO public.recipe_steps (recipe_id, step_number, description)
     VALUES (v_recipe_id, 1, 'Mix ingredients');
     ```

## 2. Logic Chain
1. We directly observed that `docs/test_schema.sql` and `instructions.md` contain references to `recipes` using `id` as a UUID, `slug`, and `is_published`, `recipe_ingredients` using `name` and `position` (or `sort_order`), and `recipe_steps` using `description` and `video_url`.
2. Conversely, `docs/schema.sql` contains an older serial-based schema that is syntactically corrupted and fails compilation.
3. Therefore, the **UUID-based schema** is the active target schema that represents the system's finalized state.
4. Directus CMS interfaces directly with Supabase via PostgreSQL reflection, mapping database tables to **Collections** and columns to **Fields**.
5. To configure Directus, we need to map:
   - Primary Keys: UUID field type, mapped to a hidden/system input interface.
   - Text/Numeric columns: Text Input/Textarea/Numeric interfaces with constraints (e.g. `NUMERIC(10,1)` needs decimal configuration with step `0.1`).
   - Tags array columns (`cube_tags`, `dietary_tags`): Stored as `TEXT[]` and represented in Directus as multi-select or tags input interfaces.
   - Booleans (`is_published`): Represented as a toggle interface.
   - Foreign Keys (`recipe_id`): Mapped to a Many-to-One (M2O) relationship in Directus, and represented as a One-to-Many (O2M) nested table (or repeater/builder interface) on the parent `recipes` collection.
6. The proposed section for `docs/content_workflow.md` must clearly document this mapping so that developers can easily configure the Directus admin panel.

## 3. Caveats
- **Schema State**: `docs/schema.sql` is currently corrupted and defines a serial schema. We assume that the database implementation team (Milestone 1) will overwrite `docs/schema.sql` with the corrected UUID schema before the CMS team configures Directus.
- **Mapping Coverage**: The mapping layouts provided below focus on the **UUID-based schema** (the system target) but include notes pointing out differences in the serial-based columns in case a fallback is required.
- **Directus File Handling**: Hero images and videos are stored in external CDNs / storage (Supabase Storage and Cloudinary). The Directus mapping stores the direct URL string, not a local Directus file relation.

## 4. Conclusion (Proposed Content Workflow Mapping Section)
We propose appending the following section to `/home/freya/supersauced/docs/content_workflow.md` under a new header:

```markdown
## Directus CMS to Supabase Database Mapping Specification

To allow the content team to enter and manage recipes, the Directus CMS must reflect the Supabase PostgreSQL database tables. Directus automatically inspects the database schema and generates the collections, but the user interfaces (interfaces, dropdowns, validation) must be configured as specified below.

### 1. Collections Overview

The CMS maps to the database via three core collections:
*   **Recipes (`recipes`)**: Represents the primary recipe metadata.
*   **Recipe Ingredients (`recipe_ingredients`)**: Line items mapping ingredients to recipes (One-to-Many from Recipes).
*   **Recipe Steps (`recipe_steps`)**: Step-by-step instructions for guided cooking (One-to-Many from Recipes).

---

### 2. Collection Configuration: Recipes (`recipes`)
*   **Database Table**: `public.recipes`
*   **Primary Key**: `id` (UUID, auto-generated)

| Database Column | Directus Field | Type | Interface | Constraints & UI Setup |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. |
| `title` | `title` | String | Text Input | Required. Character limit: 255. |
| `slug` | `slug` | String | Text Input | Required, Unique. Automatically slugified from title via Directus flows. |
| `description` | `description` | Text | Text Area | Optional description of the recipe. |
| `hero_image_url` | `hero_image_url` | String | Text Input | Stored in Supabase Storage. Enter direct URL. |
| `difficulty` | `difficulty` | Integer | Dropdown (Choices) | Required. Allowed values: `1` (Easy), `2` (Medium), `3` (Hard). |
| `cook_time_minutes` | `cook_time_minutes` | Integer | Numeric Input | Optional. Must be >= 0. |
| `servings_default` | `servings_default` | Integer | Numeric Input | Optional. Must be > 0. |
| `calories_per_serving` | `calories_per_serving` | Integer | Numeric Input | Optional. Must be >= 0. |
| `protein_g` | `protein_g` | Integer | Numeric Input | Optional. |
| `fat_g` | `fat_g` | Integer | Numeric Input | Optional. |
| `carbs_g` | `carbs_g` | Integer | Numeric Input | Optional. |
| `cube_tags` | `cube_tags` | CSV / Array | Tags / Select Multiple | Stored as `TEXT[]`. Add choices matching Cube SKU tags. |
| `dietary_tags` | `dietary_tags` | CSV / Array | Tags / Select Multiple | Stored as `TEXT[]`. Add choices matching dietary preferences. |
| `is_published` | `is_published` | Boolean | Toggle (Switch) | Default: `false`. Controls public visibility in mobile app. |
| `created_at` | `created_at` | Timestamp | Datetime | System Created (Read-only). |
| `updated_at` | `updated_at` | Timestamp | Datetime | System Updated (Read-only). |
| -- | `ingredients` | O2M Relation | One-to-Many | Shows nested `recipe_ingredients` items with drag-to-sort enabled. |
| -- | `steps` | O2M Relation | One-to-Many | Shows nested `recipe_steps` items with drag-to-sort enabled. |

*Note for Serial-based fallback: If the database uses serial IDs, map `id` to Integer Primary Key, rename `cook_time_minutes` to `cook_time`, `servings_default` to `servings`, and omit `slug`, `is_published`, and macro columns (`calories_per_serving`, `protein_g`, `fat_g`, `carbs_g`).*

---

### 3. Collection Configuration: Recipe Ingredients (`recipe_ingredients`)
*   **Database Table**: `public.recipe_ingredients`
*   **Primary Key**: `id` (UUID, auto-generated)
*   **Relationship**: Many-to-One (M2O) to `recipes` (`recipe_id`)

| Database Column | Directus Field | Type | Interface | Constraints & UI Setup |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. |
| `recipe_id` | `recipe_id` | M2O Relation | Relationship | References `recipes.id`. Hidden in nested view. |
| `name` | `name` | String | Text Input | Required. Name of the ingredient (e.g., "Kosher Salt"). |
| `quantity` | `quantity` | Decimal / Float | Numeric Input | Required. Map to Postgres `NUMERIC(10,1)`. Configure step to `0.1` in Directus UI. |
| `unit` | `unit` | String | Text Input / Dropdown | Optional. Choice suggestions: `cups`, `tsp`, `tbsp`, `g`, `oz`, `pieces`. |
| `notes` | `notes` | Text | Text Input | Optional. (e.g., "room temperature", "chopped"). |
| `position` | `position` | Integer | Sort (Hidden) | Used by Directus drag-and-drop to maintain ingredient listing order. |

*Note for Serial-based fallback: If using the serial schema, rename `name` to `ingredient`, rename `position` to `sort_order`, and omit `notes`.*

---

### 4. Collection Configuration: Recipe Steps (`recipe_steps`)
*   **Database Table**: `public.recipe_steps`
*   **Primary Key**: `id` (UUID, auto-generated)
*   **Relationship**: Many-to-One (M2O) to `recipes` (`recipe_id`)

| Database Column | Directus Field | Type | Interface | Constraints & UI Setup |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | UUID | Primary Key (Hidden) | Automatically generated. |
| `recipe_id` | `recipe_id` | M2O Relation | Relationship | References `recipes.id`. Hidden in nested view. |
| `step_number` | `step_number` | Integer | Numeric Input | Required. Represents step order (1, 2, 3, etc.). Unique per recipe. |
| `description` | `description` | Text | Text Area | Required. Instruction details for the cook. |
| `video_url` | `video_url` | String | Text Input | Cloudinary CDN video URL. |
| `timer_seconds` | `timer_seconds` | Integer | Numeric Input | Optional timer for the step in seconds. Must be >= 0. |
| `tip` | `tip` | Text | Text Input | Optional tip or variance information. |

*Note for Serial-based fallback: If using the serial schema, rename `description` to `instruction`, rename `video_url` to `media_url`, add `sort_order`, and omit `timer_seconds` and `tip`.*

---

### 5. Directus Admin UI and Validation Guidelines
1.  **O2M Repeaters**: Configure the `ingredients` and `steps` fields in the `recipes` collection to display as inline O2M items. Enabling the drag-and-drop sort option maps directly to `position` (or `sort_order`), adjusting list ordering dynamically.
2.  **Strict Decimal Precision**: In the `recipe_ingredients` editor, configure the `quantity` interface to accept decimal steps of `0.1`. This maps to the `NUMERIC(10,1)` column, enforcing scaling accuracy and preventing floating-point rounding display bugs.
3.  **Deferrable Unique Constraint**: Uniqueness validation on `(recipe_id, step_number)` is enforced in the database as `DEFERRABLE INITIALLY DEFERRED`. This allows Directus to execute batch updates (e.g. swapping step numbers during sort reordering) inside a transaction without violating uniqueness midway.
```

## 5. Verification Method
We can verify this mapping against the active database schema using the following steps:
1. **Schema Check**:
   Confirm that the active database table structures match the UUID schema defined in `instructions.md`.
   Verify the table names and types:
   ```bash
   # If database verifier container is running:
   docker exec -it <container_name> psql -U postgres -d postgres -c "\d public.recipes"
   docker exec -it <container_name> psql -U postgres -d postgres -c "\d public.recipe_ingredients"
   docker exec -it <container_name> psql -U postgres -d postgres -c "\d public.recipe_steps"
   ```
2. **Compile Test Suite**:
   Once the syntax error in `docs/schema.sql` is resolved, run:
   ```bash
   ./docs/verify_schema.sh
   ```
   This will verify that the fields (`is_published`, `slug`, `name`, `position`, `description`, `timer_seconds`) are correctly set up and pass the functional validation test suites.
3. **Invalidation Condition**:
   If the database schema falls back to using serial integer IDs (instead of UUIDs), the fallback column names (`ingredient` instead of `name`, `instruction` instead of `description`, etc.) must be used instead, invalidating the primary mapping table.
