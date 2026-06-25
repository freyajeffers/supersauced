# API Specification – Supabase / PostgREST

This document defines the RESTful API endpoints exposed automatically by the Supabase PostgREST layer based on the database schema. It includes routing, query paradigms, authentication mechanics, and TypeScript SDK integrations.

---

## 1. Core Architecture & Base URL

The API is generated dynamically by PostgREST directly from the PostgreSQL `public` schema. All RLS (Row Level Security) rules are evaluated at the database level for every incoming request.

**Base URL Structure:**

```
https://<PROJECT_REF>.supabase.co/rest/v1
```

**Note:** Replace `<PROJECT_REF>` with your actual Supabase project reference.

### Required Headers

Every API request must include the following headers:

- `apikey`: The Supabase Anon/Public Key (or Service Role Key for administrative bypass).
- `Authorization`: `Bearer <ACCESS_TOKEN>` containing the logged-in user's JWT (issued by Supabase Auth / GoTrue).

---

## 2. Authentication & Row-Level Security (RLS)

- **Unauthenticated / Anonymous Access**: Direct requests to public resources (like published recipes) are allowed depending on the table's SELECT policies.
- **Authenticated Access**: The `Authorization: Bearer <JWT>` header carries claims about the user. PostgREST maps this to the database session context:
  - `auth.uid()` evaluates to the `sub` claim (user UUID) in the JWT.
  - `auth.jwt() ->> 'role'` evaluates to the user's role metadata (e.g. `'cms_editor'`).
- **RLS Policy Mapping**:
  - `user_profiles`: Access is restricted. A user can only select, insert, or update their own profile (`auth.uid() = id`).
  - `recipes`: Any user can view recipes if `is_published = true`. CMS editors (`auth.jwt() ->> 'role' = 'cms_editor'`) can view all recipes.
  - `recipe_ingredients` and `recipe_steps`: Select is permitted only if the referenced recipe is published or the user is a CMS editor.

---

## 3. API Endpoint Directory

All endpoints support pagination using standard query parameters:

- `limit`: Specifies the number of rows to return (defaults to 10/100, max determined by API limits).
- `offset`: Specifies the row offset for page offsets.

### 3.1 User Profiles (`/user_profiles`)

| Method | Path | Description | Required Role/Auth |
| --- | --- | --- | --- |
| **GET** | `/user_profiles` | Query user profiles (paginated, filterable) | Authenticated (returns own profile unless bypass) |
| **POST** | `/user_profiles` | Create a profile manually | Authenticated (must match `auth.uid()`) |
| **GET** | `/user_profiles?id=eq.{id}` | Get a single profile by UUID | Authenticated (must match `auth.uid()`) |
| **PATCH / PUT** | `/user_profiles?id=eq.{id}` | Update profile properties | Authenticated (must match `auth.uid()`) |
| **DELETE** | `/user_profiles?id=eq.{id}` | Delete profile | Authenticated (must match `auth.uid()`) |

#### JSON Schema for Payload (User Profile)

```json
{
  "id": "39de95a2-218e-4365-93e3-6a193cd35dc6",
  "email": "user@example.com",
  "username": "sauceboss",
  "full_name": "Sauce Boss",
  "avatar_url": "https://example.com/avatar.jpg",
  "onboarding_survey": {
    "preferences": ["spicy", "garlic"],
    "experience_level": "intermediate"
  },
  "sauce_log": {
    "saved_recipes": ["d3b07384-d113-4ec5-a5d7-be7be5a6dc68"],
    "last_cooked": []
  }
}
```

---

### 3.2 Recipes (`/recipes`)

| Method | Path | Description | Required Role/Auth |
| --- | --- | --- | --- |
| **GET** | `/recipes` | Retrieve list of recipes | Public (returns published) or CMS Editor (all) |
| **POST** | `/recipes` | Create a new recipe | CMS Editor (`role = 'cms_editor'`) |
| **GET** | `/recipes?id=eq.{id}` | Retrieve a single recipe by UUID | Public or CMS Editor |
| **PATCH / PUT** | `/recipes?id=eq.{id}` | Update recipe fields | CMS Editor |
| **DELETE** | `/recipes?id=eq.{id}` | Delete recipe | CMS Editor |

---

### 3.3 Recipe Ingredients (`/recipe_ingredients`)

| Method | Path | Description | Required Role/Auth |
| --- | --- | --- | --- |
| **GET** | `/recipe_ingredients` | Retrieve ingredients list | Public (if parent recipe is published) |
| **POST** | `/recipe_ingredients` | Add ingredient to recipe | CMS Editor |
| **PATCH** | `/recipe_ingredients?id=eq.{id}` | Update ingredient properties | CMS Editor |
| **DELETE** | `/recipe_ingredients?id=eq.{id}` | Delete ingredient | CMS Editor |

---

### 3.4 Recipe Steps (`/recipe_steps`)

| Method | Path | Description | Required Role/Auth |
| --- | --- | --- | --- |
| **GET** | `/recipe_steps` | Retrieve steps list | Public (if parent recipe is published) |
| **POST** | `/recipe_steps` | Add instruction step | CMS Editor |
| **PATCH** | `/recipe_steps?id=eq.{id}` | Update step | CMS Editor |
| **DELETE** | `/recipe_steps?id=eq.{id}` | Delete step | CMS Editor |

---

## 4. TypeScript / Supabase SDK Query Patterns

This section provides production-grade, complete TypeScript implementations for client-side applications.

### 4.1 Fetching the Recipe Library with Complex Tag Filtering

Because `cube_tags` and `dietary_tags` are stored as PostgreSQL native arrays (`text[]`), standard string match filters will not work. We must use PostgREST array operators:

- **`cs` (contains)**: Matches if the array column contains all elements in the search parameter.
- **`cd` (contained by)**: Matches if the array column is contained by the search parameter.
- **`ov` (overlaps)**: Matches if the array column shares at least one common element with the search parameter.

Here is the TypeScript implementation for searching/filtering:

```typescript
import { createClient } from '@supabase/supabase-js';

// Define DB Types based on docs/schema.sql
export interface Recipe {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  difficulty: 1 | 2 | 3;
  cook_time_minutes: number | null;
  calories_per_serving: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  cube_tags: string[];
  dietary_tags: string[];
  servings_default: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const supabaseUrl = 'https://your-supabase-instance.supabase.co';
const supabaseAnonKey = 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface FetchRecipesParams {
  searchTerm?: string;
  cubeTags?: string[];
  dietaryTags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Fetch recipes with array-based tags filtering and full-text search.
 */
export async function fetchRecipeLibrary({
  searchTerm,
  cubeTags = [],
  dietaryTags = [],
  limit = 10,
  offset = 0
}: FetchRecipesParams) {
  let query = supabase
    .from('recipes')
    .select('*')
    .eq('is_published', true);

  // 1. Text Search (matches GIN index on title + description)
  if (searchTerm && searchTerm.trim() !== '') {
    // textSearch uses the PostgreSQL to_tsvector under the hood
    query = query.textSearch('fts', searchTerm.trim());
  }

  // 2. Filter by cube_tags array using the .contains (cs) array operator
  // This ensures the recipe has ALL the requested cube tags
  if (cubeTags.length > 0) {
    query = query.contains('cube_tags', cubeTags);
  }

  // 3. Filter by dietary_tags array using the .overlaps (ov) array operator
  // This matches recipes that have ANY of the requested dietary tags
  if (dietaryTags.length > 0) {
    query = query.overlaps('dietary_tags', dietaryTags);
  }

  // 4. Pagination & Sorting
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching recipes:', error.message);
    throw error;
  }

  return { recipes: data as Recipe[], count };
}
```

---

### 4.2 Single-Request Nested Resource Fetching (N+1 Optimization)

To avoid the performance degradation of N+1 database queries (fetching a recipe, then initiating individual network requests to fetch its steps and ingredients), Supabase / PostgREST supports declarative joins using resource embedding.

By defining relationships through foreign key references (`recipe_ingredients.recipe_id -> recipes.id` and `recipe_steps.recipe_id -> recipes.id`), a single SELECT query can fetch the entire tree.

```typescript
export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  position: number | null;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  step_number: number;
  description: string;
  video_url: string | null;
  timer_seconds: number | null;
  tip: string | null;
}

export interface DetailedRecipe extends Recipe {
  recipe_steps: RecipeStep[];
  recipe_ingredients: RecipeIngredient[];
}

/**
 * Fetch a single recipe with all associated ingredients and steps in one HTTP request.
 */
export async function getRecipeDetails(recipeId: string): Promise<DetailedRecipe> {
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_steps (
        id,
        recipe_id,
        step_number,
        description,
        video_url,
        timer_seconds,
        tip
      ),
      recipe_ingredients (
        id,
        recipe_id,
        quantity,
        unit,
        name,
        notes,
        position
      )
    `)
    .eq('id', recipeId)
    .single();

  if (error) {
    console.error(`Error fetching recipe details for id ${recipeId}:`, error.message);
    throw error;
  }

  // Ensure steps are sorted chronologically by step_number
  const sortedSteps = (data.recipe_steps || []).sort(
    (a: RecipeStep, b: RecipeStep) => a.step_number - b.step_number
  );
  
  // Ensure ingredients are sorted by position
  const sortedIngredients = (data.recipe_ingredients || []).sort(
    (a: RecipeIngredient, b: RecipeIngredient) => (a.position ?? 0) - (b.position ?? 0)
  );

  return {
    ...data,
    recipe_steps: sortedSteps,
    recipe_ingredients: sortedIngredients
  } as DetailedRecipe;
}
```

---

### 4.3 Saved Recipes & Likes Synchronization Patterns

To toggle or synchronize whether a user has "saved" or "liked" a recipe, you can implement one of the following architectural patterns depending on your scalability requirements.

#### Pattern A: JSONB State Synchronization (Direct columns in `user_profiles`)

Since our schema includes `sauce_log JSONB` and `onboarding_survey JSONB` directly inside the `user_profiles` table, we can manage the array of saved recipe IDs within the `sauce_log` jsonb structure.

This avoids creating a separate join table and keeps the user's lightweight app state consolidated.

```typescript
/**
 * Toggle a recipe in the user's saved array stored inside the 'sauce_log' JSONB column.
 */
export async function toggleSavedRecipeJsonb(userId: string, recipeId: string): Promise<string[]> {
  // 1. Fetch current sauce_log
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('sauce_log')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch user profile: ${fetchError.message}`);
  }

  // Parse current saved_recipes list or default to empty array
  const sauceLog = (profile?.sauce_log || {}) as Record<string, any>;
  const savedRecipes: string[] = Array.isArray(sauceLog.saved_recipes) 
    ? sauceLog.saved_recipes 
    : [];

  // Toggle the recipe ID
  const existsIndex = savedRecipes.indexOf(recipeId);
  if (existsIndex > -1) {
    savedRecipes.splice(existsIndex, 1); // remove
  } else {
    savedRecipes.push(recipeId); // add
  }

  // Update updated sauce_log back to database
  const updatedSauceLog = {
    ...sauceLog,
    saved_recipes: savedRecipes
  };

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ 
      sauce_log: updatedSauceLog,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to update saved recipes: ${updateError.message}`);
  }

  return savedRecipes;
}
```

#### Pattern B: Relational Join Table (Recommended for production scale)

For high-performance applications with massive user engagement, querying/indexing jsonb elements can become inefficient. We recommend migrating the schema to add a relational join table `user_saved_recipes` mapping user profiles to recipes.

**Migration DDL Schema:**

```sql
CREATE TABLE IF NOT EXISTS public.user_saved_recipes (
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, recipe_id)
);

-- Enable RLS
ALTER TABLE public.user_saved_recipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own saves" ON public.user_saved_recipes
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**TypeScript SDK Implementation:**

```typescript
/**
 * Toggle a saved recipe utilizing a relational join table (user_saved_recipes).
 */
export async function toggleSavedRecipeRelational(userId: string, recipeId: string): Promise<boolean> {
  // 1. Check if the save already exists
  const { data, error: checkError } = await supabase
    .from('user_saved_recipes')
    .select('recipe_id')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to verify save state: ${checkError.message}`);
  }

  if (data) {
    // Save exists, remove it (unsave)
    const { error: deleteError } = await supabase
      .from('user_saved_recipes')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId);

    if (deleteError) {
      throw new Error(`Failed to unsave recipe: ${deleteError.message}`);
    }
    return false; // return new state (not saved)
  } else {
    // Save doesn't exist, insert it (save)
    const { error: insertError } = await supabase
      .from('user_saved_recipes')
      .insert({ user_id: userId, recipe_id: recipeId });

    if (insertError) {
      throw new Error(`Failed to save recipe: ${insertError.message}`);
    }
    return true; // return new state (saved)
  }
}

/**
 * Fetch all saved recipes for a user using resource embedding.
 */
export async function getSavedRecipes(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('user_saved_recipes')
    .select(`
      recipes (
        id,
        title,
        slug,
        description,
        hero_image_url,
        difficulty,
        cook_time_minutes,
        cube_tags,
        dietary_tags
      )
    `)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch saved recipes: ${error.message}`);
  }

  // Filter out any null entries (e.g. if a recipe was deleted/unpublished)
  return (data || [])
    .map((item: any) => item.recipes)
    .filter((recipe): recipe is Recipe => recipe !== null);
}
```
