# Recipe CRUD Endpoints: Design Analysis & Recommendations

## 1. Executive Summary
This document provides a design strategy for implementing recipes, ingredients, and steps CRUD endpoints in the Python FastAPI backend of SuperSauced. To ensure high performance, security, and developer ergonomics, we recommend a **database-delegated architecture**: offloading array filtering and full-text search to PostgreSQL GIN indexes, using PostgREST resource embedding to eliminate N+1 query overhead, and delegating read/write security checks to database-level Row Level Security (RLS) policies.

---

## 2. API Endpoint & Routing Design

We recommend creating three distinct routers registered under `app/api/v1/`:
1. `/recipes` & `/recipes/{id}` in `app/api/v1/recipes.py`
2. `/recipe_ingredients` & `/recipe_ingredients/{id}` in `app/api/v1/recipe_ingredients.py`
3. `/recipe_steps` & `/recipe_steps/{id}` in `app/api/v1/recipe_steps.py`

### 2.1 Endpoint Specification Directory

| Route | Method | Purpose | Auth & Role Required |
|---|---|---|---|
| **`/recipes`** | **GET** | List/Search recipes with pagination and tag filters | None (Anonymous) or Authenticated. Filters only return `is_published = true` unless user is a `cms_editor`. |
| **`/recipes`** | **POST** | Create a new recipe | Authenticated (`role = 'cms_editor'`) |
| **`/recipes/{id}`** | **GET** | Retrieve a single recipe, supports embedding steps & ingredients | None (Anonymous) or Authenticated. Non-editors are restricted to published recipes. |
| **`/recipes/{id}`** | **PUT / PATCH** | Update a recipe | Authenticated (`role = 'cms_editor'`) |
| **`/recipes/{id}`** | **DELETE** | Delete a recipe | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_ingredients`** | **GET** | List ingredients (filterable by `recipe_id` query param) | None (Anonymous) or Authenticated (if parent recipe is published or user is editor) |
| **`/recipe_ingredients`** | **POST** | Add an ingredient to a recipe | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_ingredients/{id}`** | **GET** | Get a single ingredient | None (Anonymous) or Authenticated (subject to parent RLS) |
| **`/recipe_ingredients/{id}`** | **PUT / PATCH** | Update ingredient properties | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_ingredients/{id}`** | **DELETE** | Delete an ingredient | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_steps`** | **GET** | List steps (filterable by `recipe_id` query param) | None (Anonymous) or Authenticated (subject to parent RLS) |
| **`/recipe_steps`** | **POST** | Add a step to a recipe | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_steps/{id}`** | **GET** | Get a single step | None (Anonymous) or Authenticated (subject to parent RLS) |
| **`/recipe_steps/{id}`** | **PUT / PATCH** | Update step properties | Authenticated (`role = 'cms_editor'`) |
| **`/recipe_steps/{id}`** | **DELETE** | Delete a step | Authenticated (`role = 'cms_editor'`) |

### 2.2 Optional Authentication Dependency
Because GET endpoints must allow public, unauthenticated access to published recipes but allow CMS editors to view unpublished ones, FastAPI's default `HTTPBearer(auto_error=True)` dependency is inadequate. We recommend implementing an optional token provider:

* **Optional Bearer Token Extractor**:
  ```python
  reusable_oauth2_optional = HTTPBearer(auto_error=False)

  def get_token_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(reusable_oauth2_optional)) -> Optional[str]:
      return credentials.credentials if credentials else None
  ```

* **User Client Dependency**:
  ```python
  def get_user_client_optional(token: Optional[str] = Depends(get_token_optional)) -> Any:
      client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
      if token:
          client.postgrest.auth(token)
      return client
  ```

### 2.3 Pydantic Schemas

#### Recipe Schemas (`app/schemas/recipe.py`)
```python
from typing import List, Optional
from pydantic import BaseModel, Field

class RecipeBase(BaseModel):
    title: str
    slug: str
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    difficulty: int = Field(..., ge=1, le=3)
    cook_time_minutes: Optional[int] = Field(None, ge=0)
    calories_per_serving: Optional[int] = Field(None, ge=0)
    protein_g: Optional[int] = Field(None, ge=0)
    fat_g: Optional[int] = Field(None, ge=0)
    carbs_g: Optional[int] = Field(None, ge=0)
    cube_tags: List[str] = Field(default_factory=list)
    dietary_tags: List[str] = Field(default_factory=list)
    servings_default: Optional[int] = Field(None, ge=1)
    is_published: bool = False

class RecipeCreate(RecipeBase):
    pass

class RecipeUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    difficulty: Optional[int] = Field(None, ge=1, le=3)
    cook_time_minutes: Optional[int] = Field(None, ge=0)
    calories_per_serving: Optional[int] = Field(None, ge=0)
    protein_g: Optional[int] = Field(None, ge=0)
    fat_g: Optional[int] = Field(None, ge=0)
    carbs_g: Optional[int] = Field(None, ge=0)
    cube_tags: Optional[List[str]] = None
    dietary_tags: Optional[List[str]] = None
    servings_default: Optional[int] = Field(None, ge=1)
    is_published: Optional[bool] = None

class RecipeResponse(RecipeBase):
    id: str
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True
```

#### Ingredient Schemas (`app/schemas/recipe_ingredient.py`)
```python
from typing import Optional
from pydantic import BaseModel, Field
from decimal import Decimal

class RecipeIngredientBase(BaseModel):
    recipe_id: str
    quantity: Optional[Decimal] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredientCreate(RecipeIngredientBase):
    pass

class RecipeIngredientUpdate(BaseModel):
    recipe_id: Optional[str] = None
    quantity: Optional[Decimal] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredientResponse(RecipeIngredientBase):
    id: str
    class Config:
        from_attributes = True
```

#### Step Schemas (`app/schemas/recipe_step.py`)
```python
from typing import Optional
from pydantic import BaseModel, Field

class RecipeStepBase(BaseModel):
    recipe_id: str
    step_number: int = Field(..., ge=1)
    description: str
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None

class RecipeStepCreate(RecipeStepBase):
    pass

class RecipeStepUpdate(BaseModel):
    recipe_id: Optional[str] = None
    step_number: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None

class RecipeStepResponse(RecipeStepBase):
    id: str
    class Config:
        from_attributes = True
```

#### Detailed Recipe Response (`app/schemas/recipe.py` - continuation)
```python
from app.schemas.recipe_ingredient import RecipeIngredientResponse
from app.schemas.recipe_step import RecipeStepResponse

class DetailedRecipeResponse(RecipeResponse):
    recipe_steps: List[RecipeStepResponse] = []
    recipe_ingredients: List[RecipeIngredientResponse] = []
```

---

## 3. Filtering & GIN Index Delegation Strategy

To guarantee rapid search query execution, the application must avoid fetching massive result sets to do in-memory (application-level) filtering. We strongly advocate for **Delegation to PostgreSQL** through native database operators that utilize GIN indexes.

### 3.1 Tag Filtering Delegation
- **`cube_tags` (Containment - ALL match)**: 
  The schema requires that filtered recipes contain *all* requested `cube_tags`. We delegate this via the PostgREST containment operator `cs`, which translates to the `@>` (contains) operator in SQL.
  * *Python Supabase Client Implementation*:
    ```python
    if cube_tags:
        query = query.contains("cube_tags", cube_tags)
    ```
- **`dietary_tags` (Overlap - ANY match)**: 
  The search schema specifies matching recipes that have *any* of the requested `dietary_tags`. We delegate this via the PostgREST overlap operator `ov`, which translates to the `&&` (overlaps) operator in SQL.
  * *Python Supabase Client Implementation*:
    ```python
    if dietary_tags:
        query = query.overlaps("dietary_tags", dietary_tags)
    ```

Both containment (`@>`) and overlaps (`&&`) directly utilize the GIN indexes `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` created in migration `00003_indexes.sql`.

### 3.2 Full-Text Search (FTS) Delegation Options
The index created in migration `00003_indexes.sql` is:
```sql
CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));
```
Because PostgREST's `.text_search()` operator is applied to columns rather than arbitrary database expressions, we recommend the following strategies:

#### Option A: Generated Column Strategy (Recommended)
Add a stored generated column to `public.recipes` mapping the text search vector, and index it:
```sql
-- DDL Migration
ALTER TABLE public.recipes 
ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || coalesce(description, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_recipes_fts ON public.recipes USING GIN (fts);
```
With the `fts` column defined, the FastAPI router cleanly delegates queries:
```python
if search_query:
    query = query.text_search("fts", search_query)
```
This is the standard and most performant Supabase integration practice.

#### Option B: Database RPC Function Strategy (Bypasses Schema Modifications)
If direct column modifications are restricted, create a database function to encapsulate search queries:
```sql
CREATE OR REPLACE FUNCTION search_recipes(search_term TEXT)
RETURNS SETOF public.recipes AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.recipes
    WHERE to_tsvector('english', title || ' ' || coalesce(description, '')) @@ websearch_to_tsquery('english', search_term);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
FastAPI routes can execute this via RPC, chaining tags and pagination parameters which PostgREST dynamically compiles into a nested SQL execution statement:
```python
query = user_client.rpc("search_recipes", {"search_term": search_query})
if cube_tags:
    query = query.contains("cube_tags", cube_tags)
if dietary_tags:
    query = query.overlaps("dietary_tags", dietary_tags)
res = query.range(offset, offset + limit - 1).execute()
```

#### Option C: Fallback to Application-Level Wildcard (Not Recommended)
Using ILIKE patterns across columns (e.g. `title.ilike.%term%`) using standard PostgREST operators is an option:
```python
query = query.or_(f"title.ilike.%{search_query}%,description.ilike.%{search_query}%")
```
* **Critical Warning**: This strategy **does not use** the GIN full-text index and results in full-table sequential scans. Performance degrades linearly ($O(N)$) as the database grows, leading to severe latency spikes and high database CPU usage under load. FTS should always be delegated to the database via Option A or B.

---

## 4. Resource Embedding & N+1 Optimization

Fetching a recipe, then making separate SQL or HTTP calls to fetch ingredients and steps is a massive performance bottleneck.

### 4.1 Single-Query Resource Embedding
PostgREST allows client-directed resource embedding (declarative joins) via the `select` parameter:
```python
# FastAPI Route Controller for GET /recipes/{id}
res = user_client.from_("recipes").select(
    "*, recipe_steps(*), recipe_ingredients(*)"
).eq("id", recipe_id).single().execute()
```
PostgreSQL processes this internally, utilizing the primary-foreign key relationships (`recipe_ingredients.recipe_id -> recipes.id`), and returning the data structure nested inside a single JSON string in one round trip.

### 4.2 Dynamic Embedding Query Flags
FastAPI endpoint GET `/recipes/{id}` and GET `/recipes` should accept flags to dynamically construct selection fields:
```python
@router.get("/{id}", response_model=DetailedRecipeResponse)
def get_recipe(
    id: str,
    include_ingredients: bool = False,
    include_steps: bool = False,
    user_client: Client = Depends(get_user_client_optional)
):
    select_fields = ["*"]
    if include_ingredients:
        select_fields.append("recipe_ingredients(*)")
    if include_steps:
        select_fields.append("recipe_steps(*)")
        
    res = user_client.from_("recipes").select(",".join(select_fields)).eq("id", id).single().execute()
    # Sort children and return
```

### 4.3 Nested Sorting Strategy
- **Steps** must be ordered chronologically by `step_number`.
- **Ingredients** must be ordered by their `position`.

Sorting can be offloaded to PostgreSQL using PostgREST syntax:
```python
query = query.order("step_number", foreignTable="recipe_steps").order("position", foreignTable="recipe_ingredients")
```
Alternatively, sorting can be handled safely and efficiently in memory in the FastAPI route controller since step/ingredient count per recipe is small ($N < 50$):
```python
data = res.data
if "recipe_steps" in data and data["recipe_steps"]:
    data["recipe_steps"].sort(key=lambda s: s.get("step_number") or 0)
if "recipe_ingredients" in data and data["recipe_ingredients"]:
    data["recipe_ingredients"].sort(key=lambda i: i.get("position") or 0)
```

---

## 5. Row-Level Security (RLS) & Auth Delegation

Supabase secures data at the storage level. All CRUD operations performed by `user_client` must be validated against PostgreSQL RLS rules.

### 5.1 Current RLS Context
Currently, the database defines:
- **`user_profiles`**: Can only select, insert, or update their own profile (`auth.uid() = id`).
- **`recipes`**: Any user can select if `is_published = true`. CMS editors can select all.
- **`recipe_ingredients` & `recipe_steps`**: Select allowed if the parent recipe `is_published = true` or the user is `cms_editor`.

### 5.2 The Write Operations Security Gap & Resolution
Currently, there are **no policies** defined in `00004_rls_policies.sql` for `INSERT`, `UPDATE`, or `DELETE` on the `recipes`, `recipe_ingredients`, or `recipe_steps` tables. In Supabase/PostgreSQL, when RLS is enabled and no explicit policy is present, writes are denied by default.

We recommend two architectural strategies to handle writes safely:

#### Strategy A: Database-Level Write RLS (Recommended)
Add DB migration policies to grant edit access to the `cms_editor` role:
```sql
-- DDL Migration
CREATE POLICY "CMS editors can create recipes" ON public.recipes
    FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');

CREATE POLICY "CMS editors can update recipes" ON public.recipes
    FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'role') = 'cms_editor') WITH CHECK ((auth.jwt() ->> 'role') = 'cms_editor');

CREATE POLICY "CMS editors can delete recipes" ON public.recipes
    FOR DELETE TO authenticated USING ((auth.jwt() ->> 'role') = 'cms_editor');
```
*(Define matching policies for `recipe_ingredients` and `recipe_steps`).*

* **FastAPI Endpoint Execution**: The endpoints inject `user_client = Depends(get_user_client)` and execute the write operations directly. The database enforces the role verification, translating unauthorized access into standard database errors that the router maps to `403 Forbidden`.

#### Strategy B: FastAPI-Level Emulated Guards & Service Role
If database migrations cannot be applied, FastAPI must act as the security boundary:
1. Inject the parsed user claims: `current_user: CurrentUser = Depends(get_current_user)`.
2. Inspect the user claims:
   ```python
   if current_user.role != "cms_editor":
       raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CMS Editor permissions required.")
   ```
3. Inject the service‑role client: `service_client = Depends(get_service_client)`.
4. Perform the database update using `service_client`, which bypasses PostgreSQL RLS.

* **Trade-Offs**: Strategy A is the preferred approach as it honors the single‑source‑of‑truth principle for security, preventing raw PostgreSQL or PostgREST access from bypassing the role verification checks. Strategy B should only be used as a fallback if database schema changes are prohibited.
