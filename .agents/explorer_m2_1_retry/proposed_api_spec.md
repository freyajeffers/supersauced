# Supabase/PostgREST API Specification (Super Sauced MVP)

This document provides recommendations and precise specifications for interacting with the Super Sauced backend database through the PostgREST API (used by `curl` or HTTP clients) and the Supabase JavaScript/TypeScript client SDK.

---

## 1. Global Request Context & Authentication

### Authentication Requirements
All endpoints require JWT-based authentication using **Bearer Tokens** managed by Supabase Auth, except where public read policies explicitly allow access (e.g., retrieving published recipes).

### Request Headers
For all PostgREST API requests, the following headers are required or recommended:

| Header Name | Value | Description |
| :--- | :--- | :--- |
| `apikey` | `<anon_key>` | The Supabase client anonymous API key. Required to route and authorize requests. |
| `Authorization` | `Bearer <JWT_access_token>` | The user's JWT access token (retrieved after authentication). |
| `Content-Type` | `application/json` | Required for `POST`, `PUT`, `PATCH` write operations. |
| `Prefer` | `return=representation` | (Optional) Instructs PostgREST to return the modified record in the response body. |
| `Prefer` | `count=exact` | (Optional) Instructs PostgREST to compute the total count and return it in the `Content-Range` header. |

---

## 2. Recipes Endpoints (`public.recipes`)

* **Role Permissions**: Public read SELECT for published recipes; `cms_editor` read SELECT for all (published and drafts).
* **Write Operations**: Denied (default block by RLS; managed via Directus CMS using `service_role`).

### Read Recipes (List)
Retrieves recipes from the curated library.

#### Endpoint
`GET /rest/v1/recipes`

#### Query Parameters
* `select`: Comma-separated list of columns to return (e.g. `*` or `id,title,slug,is_published`).
* `limit`: The maximum number of records to return.
* `offset`: The number of records to skip (for offset-based pagination).
* `order`: Sorting column and direction (e.g. `created_at.desc`).
* Filters: Dynamic conditions based on column types.

---

### Pagination: Limit & Offset
PostgREST supports offset-based pagination using `limit` and `offset` query parameters. Alternatively, it supports range-based pagination using the HTTP `Range` header.

#### PostgREST curl Syntax
Using query parameters:
```bash
curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipes?select=id,title,slug&limit=10&offset=20" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Prefer: count=exact"
```
*Response Header:* `Content-Range: 20-29/100` (records 20 to 29 of 100 total matches).

#### Supabase JS/TS SDK
The Supabase client library does **not** have a `.offset()` method. Pagination is achieved using the inclusive, zero-indexed `.range(from, to)` method:
```typescript
const limit = 10;
const offset = 20;

const { data, count, error } = await supabase
  .from('recipes')
  .select('id, title, slug', { count: 'exact' })
  .range(offset, offset + limit - 1)
  .order('created_at', { ascending: false });
```

---

### Multi-Tag Array Filtering
Recipes are tagged with arrays: `cube_tags` (SKU/cubes, e.g. `'{SKU-001,SKU-002}'`) and `dietary_tags` (lifestyles, e.g. `'{vegan,gluten-free}'`). GIN indexes are applied to optimize these queries.

#### A. Overlaps (`&&`)
Matches recipes that have **any** of the specified tags in common with the query array. Useful for "or-like" tag matching (e.g., show recipes matching *either* SKU-001 *or* SKU-002).

* **PostgREST Operator**: `ov`
* **PostgREST curl Syntax**:
  ```bash
  # Filter for recipes matching SKU-001 or SKU-002
  curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipes?cube_tags=ov.{SKU-001,SKU-002}" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Authorization: Bearer USER_ACCESS_TOKEN"
  ```
* **Supabase JS/TS SDK**:
  ```typescript
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .overlaps('cube_tags', ['SKU-001', 'SKU-002']);
  ```

#### B. Contains (`@>`)
Matches recipes that contain **all** of the specified tags. Useful for "and-like" tag matching (e.g., show recipes that are *both* vegan *and* gluten-free).

* **PostgREST Operator**: `cs`
* **PostgREST curl Syntax**:
  ```bash
  # Filter for recipes that are BOTH vegan AND gluten-free
  curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipes?dietary_tags=cs.{vegan,gluten-free}" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Authorization: Bearer USER_ACCESS_TOKEN"
  ```
* **Supabase JS/TS SDK**:
  ```typescript
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .contains('dietary_tags', ['vegan', 'gluten-free']);
  ```

#### C. Contained-By (`<@`)
Matches recipes where **every** element in the recipe's tag array exists in the specified query array. Useful for filtering recipes based on a user's strict list of allowed ingredients or preferences (e.g., show only recipes whose dietary requirements are subset elements of `['vegan', 'gluten-free', 'keto']`).

* **PostgREST Operator**: `cd`
* **PostgREST curl Syntax**:
  ```bash
  curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipes?dietary_tags=cd.{vegan,gluten-free,keto}" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Authorization: Bearer USER_ACCESS_TOKEN"
  ```
* **Supabase JS/TS SDK**:
  ```typescript
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .containedBy('dietary_tags', ['vegan', 'gluten-free', 'keto']);
  ```

---

## 3. Recipe Ingredients Endpoints (`public.recipe_ingredients`)

* **Role Permissions**: Public read SELECT if associated recipe is published; `cms_editor` read SELECT for all.
* **Write Operations**: Denied for all client roles.

### Load Ingredients by Recipe ID
Loads ingredients required for a specific recipe, ordered by their sequence position.

#### Endpoint
`GET /rest/v1/recipe_ingredients`

#### Query Parameters
* `recipe_id`: Must equal the target recipe UUID (`eq.<recipe_uuid>`).
* `order`: Must sort by `position` ascending (`position.asc`).

#### PostgREST curl Syntax
```bash
curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipe_ingredients?recipe_id=eq.b53e7d58-9271-482d-862d-0b7a8a652a9f&order=position.asc" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN"
```

#### Supabase JS/TS SDK
```typescript
const { data: ingredients, error } = await supabase
  .from('recipe_ingredients')
  .select('id, quantity, unit, name, notes, position')
  .eq('recipe_id', recipeId)
  .order('position', { ascending: true });
```

### Handling PostgreSQL `NUMERIC` Type in Javascript/Typescript
Postgres `NUMERIC(10,1)` holds high-precision fixed-point numbers. PostgREST converts `NUMERIC` columns into **JSON numbers** or **JSON strings** depending on the configuration. In standard Supabase clients, it is typically returned as a JS `number`, or as a JS `string` if floating-point overflow could occur.

#### Client-Side Risks & Best Practices
1. **Implicit Casting**: Always guarantee type safety by explicitly parsing the value returned by the database using `Number(item.quantity)` or `parseFloat(item.quantity)` before performing arithmetic.
2. **Serving Size Scaling**: If a recipe is designed for 4 servings (`servings_default = 4`) and the user adjusts the servings to 6 (`target_servings = 6`), scale each ingredient quantity mathematically:
   ```typescript
   const scalingFactor = targetServings / recipe.servings_default;
   const rawQuantity = Number(ingredient.quantity);
   const scaledQuantity = rawQuantity * scalingFactor;
   ```
3. **Display Rounding**: To prevent floating-point calculation artifacts (e.g. `0.3 * 1.5 = 0.45000000000000007`), always round scaled outputs to a single decimal place (matching the database's `NUMERIC(10,1)` constraint) for UI display:
   ```typescript
   // Option A: Round to 1 decimal place using built-in methods
   const displayQuantity = Math.round(scaledQuantity * 10) / 10;
   
   // Option B: Format as string with exactly 1 decimal place
   const displayString = scaledQuantity.toFixed(1);
   ```

---

## 4. Recipe Steps Endpoints (`public.recipe_steps`)

* **Role Permissions**: Public read SELECT if associated recipe is published; `cms_editor` read SELECT for all.
* **Write Operations**: Denied for all client roles.

### Load Steps by Recipe ID
Loads the cooking steps for Guided Cooking, ordered by their sequence step number.

#### Endpoint
`GET /rest/v1/recipe_steps`

#### Query Parameters
* `recipe_id`: Must equal the target recipe UUID (`eq.<recipe_uuid>`).
* `order`: Must sort by `step_number` ascending (`step_number.asc`).

#### PostgREST curl Syntax
```bash
curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/recipe_steps?recipe_id=eq.b53e7d58-9271-482d-862d-0b7a8a652a9f&order=step_number.asc" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN"
```

#### Supabase JS/TS SDK
```typescript
const { data: steps, error } = await supabase
  .from('recipe_steps')
  .select('id, step_number, description, video_url, timer_seconds, tip')
  .eq('recipe_id', recipeId)
  .order('step_number', { ascending: true });
```

---

## 5. User Profiles Endpoints (`public.user_profiles`)

* **Role Permissions**: Owner-only access (`auth.uid() = id`) for SELECT, INSERT, UPDATE, DELETE.
* **Write Operations**: Allowed only for the owning user (or `service_role`).

### Query Own Profile
Gets the logged-in user's profile containing onboarding choices and sauce inventory.

#### Endpoint
`GET /rest/v1/user_profiles`

#### PostgREST curl Syntax
```bash
curl -X GET "https://<supabase-instance>.supabase.co/rest/v1/user_profiles" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN"
```
*Note: Due to RLS `USING (auth.uid() = id)` constraint, this query naturally filters and returns ONLY the authenticated user's record.*

#### Supabase JS/TS SDK
```typescript
const { data: profile, error } = await supabase
  .from('user_profiles')
  .select('id, onboarding_survey, sauce_log, created_at')
  .single(); // Directly loads the single owner profile object
```

---

### Update Preferences (`onboarding_survey` JSONB)
Allows the user to store onboarding survey data.

#### Method & Endpoint
`PATCH /rest/v1/user_profiles?id=eq.auth.uid()`

#### Full JSONB Replacement (Default PostgREST behavior)
Replaces the entire `onboarding_survey` object with a new object.
* **curl Syntax**:
  ```bash
  curl -X PATCH "https://<supabase-instance>.supabase.co/rest/v1/user_profiles?id=eq.7c6b45a2-8ff2-45e0-94d0-4bf69ba0123e" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Authorization: Bearer USER_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d '{
      "onboarding_survey": {
        "dietary_preferences": ["vegan", "gluten-free"],
        "cooking_frequency": "weekly",
        "experience_level": "intermediate"
      }
    }'
  ```
* **Supabase JS/TS SDK**:
  ```typescript
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      onboarding_survey: {
        dietary_preferences: ['vegan', 'gluten-free'],
        cooking_frequency: 'weekly',
        experience_level: 'intermediate'
      }
    })
    .eq('id', userId);
  ```

#### Partial JSONB Updates (Merge)
PostgREST `PATCH` requests replace the specified column values entirely. If the client sends a `PATCH` with only a subset of the JSONB keys, the other keys inside that JSONB column are lost.

* **Option A: Client-side Merge (Simulated)**
  The client first retrieves the current `onboarding_survey`, merges the keys in JS/TS, and saves it:
  ```typescript
  const { data: profile } = await supabase.from('user_profiles').select('onboarding_survey').single();
  const updatedSurvey = {
    ...profile.onboarding_survey,
    cooking_frequency: 'daily' // update key
  };
  
  await supabase.from('user_profiles').update({ onboarding_survey: updatedSurvey }).eq('id', userId);
  ```
  *Caveat: Prone to minor race conditions if multiple clients update preferences simultaneously.*

* **Option B: RPC Atomic Merge (Recommended)**
  Define a PostgreSQL function to handle merging using the jsonb concatenation operator (`||`):
  ```sql
  CREATE OR REPLACE FUNCTION public.update_onboarding_survey(new_survey jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_updated jsonb;
  BEGIN
    UPDATE public.user_profiles
    SET onboarding_survey = COALESCE(onboarding_survey, '{}'::jsonb) || new_survey
    WHERE id = auth.uid()
    RETURNING onboarding_survey INTO v_updated;
    
    RETURN v_updated;
  END;
  $$;
  ```
  Then call it via the SDK:
  ```typescript
  const { data: updatedSurvey, error } = await supabase.rpc('update_onboarding_survey', {
    new_survey: { cooking_frequency: 'daily' }
  });
  ```

---

### Update Inventory (`sauce_log` JSONB)
Tracks the user's SKU inventory count. For example, `{"sku_sauce_001": 3, "sku_sauce_002": 5}`.

#### Method & Endpoint
`PATCH /rest/v1/user_profiles?id=eq.auth.uid()`

#### Full replacement
* **Supabase JS/TS SDK**:
  ```typescript
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      sauce_log: {
        "sku_sauce_001": 3,
        "sku_sauce_002": 5
      }
    })
    .eq('id', userId);
  ```

#### Incrementing / Decrementing SKU Inventory (Atomic RPC)
Because inventory changes are frequent and require strict accuracy (preventing race conditions and negative inventory), performing atomic updates in the database is highly recommended.

```sql
CREATE OR REPLACE FUNCTION public.increment_sauce_inventory(sku_key text, qty_change integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_qty integer;
  v_new_qty integer;
  v_result jsonb;
BEGIN
  -- 1. Read current quantity for SKU (default to 0 if SKU or sauce_log is missing)
  v_current_qty := COALESCE(
    (SELECT (sauce_log->>sku_key)::integer FROM public.user_profiles WHERE id = auth.uid()),
    0
  );
  
  -- 2. Calculate new quantity
  v_new_qty := v_current_qty + qty_change;
  IF v_new_qty < 0 THEN
    v_new_qty := 0; -- inventory floor
  END IF;

  -- 3. Write back using jsonb_set and return updated sauce_log
  UPDATE public.user_profiles
  SET sauce_log = jsonb_set(
    COALESCE(sauce_log, '{}'::jsonb),
    ARRAY[sku_key],
    to_jsonb(v_new_qty)
  )
  WHERE id = auth.uid()
  RETURNING sauce_log INTO v_result;

  RETURN v_result;
END;
$$;
```

#### Supabase JS/TS SDK invocation
```typescript
// Increment "sku_sauce_001" by +1
const { data: updatedInventory, error } = await supabase.rpc('increment_sauce_inventory', {
  sku_key: 'sku_sauce_001',
  qty_change: 1
});
```
