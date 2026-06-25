# Recipe CRUD Design Recommendations

This document outlines the proposed design and implementation strategy for adding recipes, ingredients, and steps CRUD endpoints to the Python FastAPI backend (`backend_guide/app`).

---

## 1. Routing Strategy

To keep the codebase modular, clean, and aligned with standard FastAPI practices, we recommend organizing the CRUD endpoints into three dedicated router files within the API directory structure:

- **`app/api/v1/recipes.py`**: Handles all operations under `/recipes` and `/recipes/{id}`.
- **`app/api/v1/recipe_ingredients.py`**: Handles all operations under `/recipe_ingredients` and `/recipe_ingredients/{id}`.
- **`app/api/v1/recipe_steps.py`**: Handles all operations under `/recipe_steps` and `/recipe_steps/{id}`.

### Router Registration
These routers should be registered in `app/main.py` using prefix paths:
- `app.include_router(recipes.router, prefix="/recipes", tags=["Recipes"])`
- `app.include_router(recipe_ingredients.router, prefix="/recipe_ingredients", tags=["Recipe Ingredients"])`
- `app.include_router(recipe_steps.router, prefix="/recipe_steps", tags=["Recipe Steps"])`
And under the compatibility prefix `/api/v1` as well.

### Route Breakdown and Access Control
Based on `docs/api_spec.yaml` and RLS constraints:

| Endpoint | HTTP Method | Action | Auth / Role Requirement | DB Client Type |
|---|---|---|---|---|
| `/recipes` | `GET` | Retrieve list of recipes with pagination and filtering | Public or Authenticated | `user_client` |
| `/recipes` | `POST` | Create a new recipe | CMS Editor (`role = 'cms_editor'`) | `user_client` (with RLS update) or `service_client` |
| `/recipes/{id}` | `GET` | Retrieve a detailed recipe (with ingredients and steps) | Public or Authenticated | `user_client` |
| `/recipes/{id}` | `PUT` | Update a recipe | CMS Editor | `user_client` or `service_client` |
| `/recipes/{id}` | `DELETE` | Delete a recipe | CMS Editor | `user_client` or `service_client` |
| `/recipe_ingredients` | `GET` | List ingredients (paginated) | Public or Authenticated | `user_client` |
| `/recipe_ingredients` | `POST` | Add ingredient to recipe | CMS Editor | `user_client` or `service_client` |
| `/recipe_ingredients/{id}` | `GET` | Get ingredient details | Public or Authenticated | `user_client` |
| `/recipe_ingredients/{id}` | `PUT` | Update ingredient details | CMS Editor | `user_client` or `service_client` |
| `/recipe_ingredients/{id}` | `DELETE` | Remove ingredient | CMS Editor | `user_client` or `service_client` |
| `/recipe_steps` | `GET` | List steps (paginated) | Public or Authenticated | `user_client` |
| `/recipe_steps` | `POST` | Add step to recipe | CMS Editor | `user_client` or `service_client` |
| `/recipe_steps/{id}` | `GET` | Get step details | Public or Authenticated | `user_client` |
| `/recipe_steps/{id}` | `PUT` | Update step details | CMS Editor | `user_client` or `service_client` |
| `/recipe_steps/{id}` | `DELETE` | Remove step | CMS Editor | `user_client` or `service_client` |

---

## 2. Filtering & Full-Text Search Strategy

The database uses PostgreSQL GIN (Generalized Inverted Index) indexes to speed up array checks and full-text searches. Our FastAPI implementation must delegate these checks to the database layer to maintain high performance.

### 2.1 Array Tag Filtering
The table has two `TEXT[]` columns: `cube_tags` and `dietary_tags`, indexed with GIN.
- **`cube_tags` Filtering (AND logic)**:
  - Requirement: Filter recipes that contain *all* the requested cube tags.
  - PostgREST operator: `cs` (contains), mapping to `@>` in PostgreSQL.
  - SDK Implementation:
    ```python
    if cube_tags:
        # Expected cube_tags format: "tag1,tag2"
        tag_list = [t.strip() for t in cube_tags.split(",") if t.strip()]
        query = query.contains("cube_tags", tag_list)
    ```
- **`dietary_tags` Filtering (OR logic)**:
  - Requirement: Filter recipes that contain *any* of the requested dietary tags.
  - PostgREST operator: `ov` (overlaps), mapping to `&&` in PostgreSQL.
  - SDK Implementation:
    ```python
    if dietary_tags:
        # Expected dietary_tags format: "tag1,tag2"
        tag_list = [t.strip() for t in dietary_tags.split(",") if t.strip()]
        query = query.overlaps("dietary_tags", tag_list)
    ```

### 2.2 Full-Text Search (FTS) delegation
The database has a functional GIN index:
`CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));`
Since this index is functional and not linked to a named table column, standard PostgREST `.text_search()` queries on `/recipes` will fail unless the database defines a `tsvector` column. We propose two design patterns:

- **Option A: Add a Stored Generated Column (Recommended)**
  Modify the migrations to add a generated column `fts` of type `tsvector`:
  ```sql
  ALTER TABLE public.recipes 
  ADD COLUMN fts tsvector GENERATED ALWAYS AS (
      to_tsvector('english', title || ' ' || coalesce(description, ''))
  ) STORED;
  
  CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (fts);
  ```
  In FastAPI, delegate the search directly via the SDK:
  ```python
  if search_term:
      query = query.text_search("fts", search_term)
  ```
  *Pros*: Extremely clean, fully integrated with Supabase/PostgREST standards, supports standard pagination.
  
- **Option B: RPC DB Function (Alternative)**
  If schema changes are forbidden, expose a PostgreSQL RPC function:
  ```sql
  CREATE OR REPLACE FUNCTION search_recipes(search_term TEXT)
  RETURNS SETOF public.recipes AS $$
  BEGIN
      RETURN QUERY
      SELECT * FROM public.recipes
      WHERE to_tsvector('english', title || ' ' || coalesce(description, '')) @@ websearch_to_tsquery('english', search_term)
      ORDER BY ts_rank(to_tsvector('english', title || ' ' || coalesce(description, '')), websearch_to_tsquery('english', search_term)) DESC;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
  In FastAPI, call it using the SDK `rpc` method:
  ```python
  res = user_client.rpc("search_recipes", {"search_term": search_term}).execute()
  ```
  *Pros*: Works with existing schema without column additions.
  *Cons*: Harder to combine with other arbitrary filters (like `cube_tags` and `dietary_tags`) dynamically in a single query.

---

## 3. Resource Embedding & N+1 Query Optimization

To avoid N+1 queries (fetching recipes, then running separate SQL statements to get ingredients and steps), we leverage PostgREST’s declarative joins.

### 3.1 Declarative Joins via `select`
Using the `recipe_id` foreign keys, PostgREST allows nested serialization in a single database roundtrip.
- **Detailed Recipe (Single item GET)**:
  ```python
  res = user_client.from_("recipes").select(
      "*, recipe_ingredients(*), recipe_steps(*)"
  ).eq("id", id).single().execute()
  ```
- **Sorting Embedded Lists at Database Level**:
  To ensure steps are ordered chronologically and ingredients by their position, order filters must specify the foreign target:
  ```python
  query = query.order("step_number", foreign_table="recipe_steps", ascending=True)
  query = query.order("position", foreign_table="recipe_ingredients", ascending=True)
  ```

### 3.2 Pydantic Schemas for Nested Serialization
The Pydantic response models should reflect the embedded structure.

- **Base Models**:
  ```python
  from typing import List, Optional
  from pydantic import BaseModel, HttpUrl, Field
  from uuid import UUID
  from datetime import datetime

  class RecipeStepBase(BaseModel):
      id: UUID
      recipe_id: UUID
      step_number: int = Field(..., ge=1)
      description: str
      video_url: Optional[HttpUrl] = None
      timer_seconds: Optional[int] = Field(None, ge=0)
      tip: Optional[str] = None

  class RecipeIngredientBase(BaseModel):
      id: UUID
      recipe_id: UUID
      quantity: Optional[float] = Field(None, ge=0.0)
      unit: Optional[str] = None
      name: str
      notes: Optional[str] = None
      position: Optional[int] = Field(None, ge=0)
  ```

- **Recipe Detail Model (Includes embedded arrays)**:
  ```python
  class RecipeBase(BaseModel):
      id: UUID
      title: str
      slug: str
      description: Optional[str] = None
      hero_image_url: Optional[HttpUrl] = None
      difficulty: int = Field(..., ge=1, le=3)
      cook_time_minutes: Optional[int] = Field(None, ge=0)
      calories_per_serving: Optional[int] = Field(None, ge=0)
      protein_g: Optional[int] = Field(None, ge=0)
      fat_g: Optional[int] = Field(None, ge=0)
      carbs_g: Optional[int] = Field(None, ge=0)
      cube_tags: List[str] = Field(default_factory=list)
      dietary_tags: List[str] = Field(default_factory=list)
      servings_default: Optional[int] = Field(None, ge=1)
      is_published: bool
      created_at: datetime
      updated_at: datetime

  class RecipeDetailResponse(RecipeBase):
      recipe_steps: List[RecipeStepBase] = Field(default_factory=list)
      recipe_ingredients: List[RecipeIngredientBase] = Field(default_factory=list)

      model_config = {
          "from_attributes": True
      }
  ```

---

## 4. Row-Level Security (RLS) Delegation Strategy

Supabase maps the application’s authenticated user to database sessions. We must delegate access control to PostgreSQL RLS policies where possible to ensure robust, declarative security.

### 4.1 Read Operations (SELECT)
The current database policies for recipes, ingredients, and steps are:
- `is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor'`
By using the **`get_user_client`** dependency (which passes the user's JWT bearer token to PostgREST), the database evaluates this policy dynamically:
- Anonymous/Standard Users: Can only view recipes with `is_published = true`.
- CMS Editors: Can view all recipes.
FastAPI endpoints should simply execute `.select()` using `user_client` and return the result. No logic checks for publication status are needed in python.

### 4.2 Write Operations (INSERT, UPDATE, DELETE)
Crucially, `00004_rls_policies.sql` does not define policies for writes (INSERT/UPDATE/DELETE) on recipes, recipe_ingredients, or recipe_steps.
Under RLS, this default-denies all writes from standard connections. We suggest two options:

- **Option A: RLS Write Policies + User Client (Recommended)**
  Extend migrations to grant write rights to `cms_editor` role:
  ```sql
  CREATE POLICY "Allow write for cms_editor" ON public.recipes
      FOR ALL USING ((auth.jwt() ->> 'role') = 'cms_editor')
      WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');
      
  CREATE POLICY "Allow write for cms_editor" ON public.recipe_ingredients
      FOR ALL USING ((auth.jwt() ->> 'role') = 'cms_editor')
      WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');
      
  CREATE POLICY "Allow write for cms_editor" ON public.recipe_steps
      FOR ALL USING ((auth.jwt() ->> 'role') = 'cms_editor')
      WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');
  ```
  FastAPI can then use `user_client` for write operations (identical to the pattern in `user_profiles.py`). If a non-editor attempts a write, PostgreSQL rejects it, and FastAPI raises a `400 Bad Request` or parses it to a `403 Forbidden`.
  *Pros*: Keeps permission logic centralized in PostgreSQL schema, consistent with `user_profiles` architecture.

- **Option B: Application Role Verification + Service Client (Bypass RLS)**
  If DB migrations cannot be updated with new policies, FastAPI must enforce authorization at the router level:
  ```python
  @router.post("")
  def create_recipe(
      body: RecipeCreate,
      current_user: CurrentUser = Depends(get_current_user),
      service_client: Client = Depends(get_service_client)
  ):
      if current_user.role != "cms_editor":
          raise HTTPException(
              status_code=status.HTTP_403_FORBIDDEN, 
              detail="Only CMS editors can create recipes."
          )
      res = service_client.from_("recipes").insert(body.model_dump()).execute()
      return res.data[0]
  ```
  *Pros*: Does not require SQL migrations.
  *Cons*: Risky if developer forgets role verification checks in routes. The service-role client bypasses all security rules.
