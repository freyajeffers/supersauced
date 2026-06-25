# Design Analysis & Strategy: Recipes, Ingredients, and Steps CRUD Endpoints

This document outlines the recommended design strategy for implementing CRUD endpoints for recipes, ingredients, and steps in the Python FastAPI backend, integrating with Supabase's PostgREST layer.

---

## 1. Routing Strategy & API Design

### 1.1 Endpoint Architecture
To maintain consistency with the existing codebase and conform to `docs/api_spec.yaml` and `docs/api_spec.md`, the endpoints should be mapped across three distinct FastAPI routers: `/recipes`, `/recipe_ingredients`, and `/recipe_steps`.

#### Recipes Router (`/recipes`)
* **`GET /recipes`**: List recipes. Supports pagination (`limit` and `offset` query parameters), tag filtering (`cube_tags` and `dietary_tags` query parameters), and full-text search (`search` query parameter). Returns a list of `Recipe` objects.
* **`POST /recipes`**: Create a new recipe. Requires `cms_editor` authentication. Returns the created `Recipe` object.
* **`GET /recipes/{id}`**: Retrieve detailed recipe by UUID. Performs single-request nested resource embedding of steps and ingredients (N+1 query optimization). Returns a `DetailedRecipe` object.
* **`PUT /recipes/{id}`**: Update all fields of an existing recipe. Requires `cms_editor` authentication. Returns the updated `Recipe` object.
* **`PATCH /recipes/{id}`**: Partially update fields of an existing recipe. Requires `cms_editor` authentication. Returns the updated `Recipe` object.
* **`DELETE /recipes/{id}`**: Delete a recipe. Requires `cms_editor` authentication. Returns a `204 No Content` status.

#### Recipe Ingredients Router (`/recipe_ingredients`)
* **`GET /recipe_ingredients`**: List recipe ingredients.
* **`POST /recipe_ingredients`**: Add a new ingredient to a recipe. Requires `cms_editor` authentication.
* **`GET /recipe_ingredients/{id}`**: Retrieve a single ingredient by UUID.
* **`PUT /recipe_ingredients/{id}` / `PATCH /recipe_ingredients/{id}`**: Update ingredient fields. Requires `cms_editor` authentication.
* **`DELETE /recipe_ingredients/{id}`**: Delete an ingredient. Requires `cms_editor` authentication. Returns a `204 No Content` status.

#### Recipe Steps Router (`/recipe_steps`)
* **`GET /recipe_steps`**: List recipe steps.
* **`POST /recipe_steps`**: Add a new step to a recipe. Requires `cms_editor` authentication.
* **`GET /recipe_steps/{id}`**: Retrieve a single step by UUID.
* **`PUT /recipe_steps/{id}` / `PATCH /recipe_steps/{id}`**: Update step fields. Requires `cms_editor` authentication.
* **`DELETE /recipe_steps/{id}`**: Delete a step. Requires `cms_editor` authentication. Returns a `204 No Content` status.

### 1.2 Pydantic Schemas Design
Standard schemas ensure request validation is handled at the application boundary:

* **Recipe Schemas**:
  * `RecipeBase`: Shared attributes (`title`, `slug`, `description`, `hero_image_url`, `difficulty`, `cook_time_minutes`, `calories_per_serving`, `protein_g`, `fat_g`, `carbs_g`, `cube_tags`, `dietary_tags`, `servings_default`, `is_published`).
  * `RecipeCreate`: Extends `RecipeBase`. Requires `title`, `slug`, `difficulty`. Validation constraints: `difficulty` must be an integer between 1 and 3; other fields must validate against non-negative constraint.
  * `RecipeUpdate`: Extends `RecipeBase` but makes all fields optional for partial updates (`PATCH`).
  * `Recipe`: Extends `RecipeBase`. Adds database-generated fields (`id` as UUID, `created_at`, `updated_at`).
  * `DetailedRecipe`: Extends `Recipe`. Adds nested collections: `recipe_ingredients: List[RecipeIngredient]` and `recipe_steps: List[RecipeStep]`. This is specifically designed for `GET /recipes/{id}` to avoid the N+1 database querying issue.

* **Recipe Ingredient Schemas**:
  * `RecipeIngredientBase`: Shared attributes (`recipe_id`, `quantity`, `unit`, `name`, `notes`, `position`).
  * `RecipeIngredientCreate`: Extends `RecipeIngredientBase`. Requires `recipe_id` and `name`. Validation: `quantity` must be >= 0.0, `position` must be >= 0.
  * `RecipeIngredientUpdate`: Extends `RecipeIngredientBase` but with all fields optional.
  * `RecipeIngredient`: Extends `RecipeIngredientBase`. Adds `id`.

* **Recipe Step Schemas**:
  * `RecipeStepBase`: Shared attributes (`recipe_id`, `step_number`, `description`, `video_url`, `timer_seconds`, `tip`).
  * `RecipeStepCreate`: Extends `RecipeStepBase`. Requires `recipe_id`, `step_number`, and `description`. Validation: `step_number` must be > 0, `timer_seconds` must be >= 0.
  * `RecipeStepUpdate`: Extends `RecipeStepBase` but with all fields optional.
  * `RecipeStep`: Extends `RecipeStepBase`. Adds `id`.

---

## 2. Filtering Strategy (GIN Index Checks)

### 2.1 Array-based Tag Filtering
The `recipes` table stores `cube_tags` and `dietary_tags` as native PostgreSQL arrays (`TEXT[]`). Standard string match queries (`LIKE`/`ILIKE`) are highly inefficient for arrays. Instead, the design must utilize PostgreSQL array operators:

1. **`cube_tags` (Containment Filtering)**:
   * **Behavior**: Find recipes that have *all* requested `cube_tags`.
   * **Delegation**: Map to PostgREST's `.contains("cube_tags", list_of_tags)` filter (maps to SQL `@>` operator).
   * **Index Performance**: Directly leverages the GIN index `idx_recipes_cube_tags` on the database level, allowing for O(log N) lookup instead of O(N) scans.
2. **`dietary_tags` (Overlap Filtering)**:
   * **Behavior**: Find recipes that match *any* of the requested `dietary_tags`.
   * **Delegation**: Map to PostgREST's `.overlaps("dietary_tags", list_of_tags)` filter (maps to SQL `&&` operator).
   * **Index Performance**: Directly leverages the GIN index `idx_recipes_dietary_tags`, avoiding sequential table scans.

#### Comparison: Delegation vs. Emulation
* **Delegation (Recommended)**: Passing these array filters directly to the database via the Supabase Client. This offloads computation to PostgreSQL and utilizes GIN indexes.
* **Emulation**: Fetching all recipes to FastAPI and filtering in-memory using Python list comprehensions (e.g. `[r for r in db_recipes if all(t in r.cube_tags for t in query_tags)]`).
  * *Drawback*: Requires loading the entire database table into memory, leading to massive memory usage and CPU degradation at scale. It completely bypasses database indexes.

### 2.2 Full-Text Search (FTS) Strategy
The database migration `00003_indexes.sql` creates a GIN index on recipes fulltext:
```sql
CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));
```
However, the client-side code in `docs/api_spec.md` tries to query:
```typescript
query = query.textSearch('fts', searchTerm.trim());
```
This is a schema mismatch: the `recipes` table lacks a physical or computed column named `fts`. Querying it directly will cause PostgREST to return a "column does not exist" error.

#### Proposed Design Strategy for FTS:
1. **Schema Correction (Delegation)**: Add a generated column `fts` to the `recipes` table to match the GIN index and enable clean PostgREST delegation.
   ```sql
   ALTER TABLE public.recipes 
   ADD COLUMN fts tsvector GENERATED ALWAYS AS (
       to_tsvector('english', title || ' ' || coalesce(description, ''))
   ) STORED;
   
   CREATE INDEX IF NOT EXISTS idx_recipes_fts ON public.recipes USING GIN (fts);
   ```
2. **FastAPI Query Mapping**: Once the generated column is added, FastAPI can delegate full-text search queries by invoking `.text_search("fts", query_string)` using the Supabase client. This utilizes PostgreSQL's native dictionaries, stemming, stop-word removal, and GIN index structures.
3. **Application-level Emulation Fallback**:
   * If database schema modifications are not possible, FastAPI must emulate search by querying `title` and `description` using `.ilike()` or regex.
   * *Drawback*: Emulation is significantly slower, does not support word stemming (e.g. matching "cooking" with "cook"), ignores standard English stop words, and cannot utilize the GIN index.

---

## 3. Resource Embedding & N+1 Query Optimization

### 3.1 Resolving the N+1 Query Pattern
When retrieving a recipe details page (`GET /recipes/{id}`), we need the parent recipe, all associated ingredients (`recipe_ingredients`), and all cooking steps (`recipe_steps`).

A naive FastAPI implementation would make three database round-trips:
1. Query `recipes` by ID.
2. Query `recipe_ingredients` where `recipe_id = id`.
3. Query `recipe_steps` where `recipe_id = id`.

This creates N+1 database connections (or 1 + 2*N queries when listing multiple recipes).

### 3.2 PostgREST Declarative Embedding
PostgREST allows fetching associated child relations in a single HTTP request using resource embedding. Since the schema includes foreign keys linking `recipe_ingredients` and `recipe_steps` to `recipes(id)`, the FastAPI backend can fetch the entire tree in a single database operation:
```python
# Conceptual Supabase python SDK query for resource embedding
res = user_client.from_("recipes").select("*, recipe_ingredients(*), recipe_steps(*)").eq("id", recipe_id).single().execute()
```
This translates into a single optimized SQL join returned as a nested JSON structure directly from PostgreSQL, reducing network latency and connection overhead.

### 3.3 Sorting Nested Resources
According to `docs/api_spec.md` requirements:
* Recipe steps must be sorted chronologically by `step_number`.
* Recipe ingredients must be sorted by `position`.

There are two strategies to implement this sorting:
1. **Database-level Sorting (Recommended)**: Pass the order commands to the nested tables directly within the Supabase query:
   ```python
   query = (
       user_client.from_("recipes")
       .select("*, recipe_ingredients(*), recipe_steps(*)")
       .eq("id", recipe_id)
       .order("step_number", foreign_table="recipe_steps")
       .order("position", foreign_table="recipe_ingredients")
   )
   ```
   This ensures the database handles the sorting and returns pre-ordered JSON arrays, reducing application-level CPU usage.
2. **Application-level Sort (Fallback)**: If the installed version of the Supabase Python SDK does not support sorting on nested tables (via `foreign_table`), the FastAPI backend must sort the nested lists programmatically before returning the response schema:
   ```python
   # Programmatic sorting fallback
   recipe_data = res.data[0]
   recipe_data["recipe_steps"] = sorted(recipe_data.get("recipe_steps") or [], key=lambda s: s["step_number"])
   recipe_data["recipe_ingredients"] = sorted(recipe_data.get("recipe_ingredients") or [], key=lambda i: i.get("position") or 0)
   ```

---

## 4. RLS Delegation & Security Architecture

### 4.1 Row-Level Security (RLS) Mechanics
FastAPI must operate as a secure intermediary rather than a security bypass.
1. **Authorization Token Extraction**: The FastAPI router uses `Depends(get_token)` to extract the incoming JWT Bearer token from the `Authorization` header.
2. **User-scoped Client Dependency**: FastAPI uses `Depends(get_user_client)` to instantiate a user-scoped Supabase client initialized with this JWT.
3. **Database-level RLS Enforcement**: When FastAPI uses this user-scoped client, the database evaluates the token claims (`auth.uid()` and `auth.jwt() ->> 'role'`).

### 4.2 Security Policy Gap Analysis
Upon reviewing the database migration `00004_rls_policies.sql`, RLS policies are only defined for `SELECT` operations on recipes, recipe ingredients, and steps:
* Recipes Select Policy: `is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor'`
* Ingredients & Steps Select Policy: Allowed only if the parent recipe is published or the user is a `cms_editor`.

#### Critical Vulnerability:
There are **no write (INSERT, UPDATE, DELETE) policies** defined for `recipes`, `recipe_ingredients`, and `recipe_steps`.
* **Effect**: Since RLS is enabled on these tables, and PostgreSQL defaults to denying access when no matching policies exist, **CMS Editors will be blocked from creating, modifying, or deleting recipes** through the API when using the standard authenticated client.
* **Workaround Risk**: A common anti-pattern is using the service-role client (`get_service_client()`) to perform write operations, bypassing RLS. This shifts authentication responsibility back to the application layer and increases security risks (e.g. privilege escalation).

#### Recommended RLS Strategy:
1. **DB-Level Policies (Recommended)**: Define proper write policies in PostgreSQL for authenticated users with the `cms_editor` role.
   ```sql
   -- Write policy for recipes
   CREATE POLICY "Allow writes for cms_editor" ON public.recipes
       FOR ALL TO authenticated
       USING ((auth.jwt() ->> 'role') = 'cms_editor')
       WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');

   -- Write policy for ingredients
   CREATE POLICY "Allow writes for cms_editor" ON public.recipe_ingredients
       FOR ALL TO authenticated
       USING (
           (auth.jwt() ->> 'role') = 'cms_editor' AND 
           EXISTS (SELECT 1 FROM public.recipes WHERE public.recipes.id = recipe_ingredients.recipe_id)
       );

   -- Write policy for steps
   CREATE POLICY "Allow writes for cms_editor" ON public.recipe_steps
       FOR ALL TO authenticated
       USING (
           (auth.jwt() ->> 'role') = 'cms_editor' AND 
           EXISTS (SELECT 1 FROM public.recipes WHERE public.recipes.id = recipe_steps.recipe_id)
       );
   ```
2. **Defense-in-Depth validation in FastAPI**: In addition to RLS, FastAPI routes should restrict write endpoints early by checking user roles using a dependency:
   ```python
   # FastAPI defense-in-depth dependency
   def require_cms_editor(current_user: CurrentUser = Depends(get_current_user)):
       if current_user.role != "cms_editor":
           raise HTTPException(
               status_code=status.HTTP_403_FORBIDDEN,
               detail="Forbidden: Only CMS editors can perform this action."
           )
   ```
   This stops unauthorized write attempts before they execute SQL operations, reducing load on the database.
