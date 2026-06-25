# Handoff Report: Milestone 3 — FastAPI Recipes & Steps Investigation

This report outlines the detailed investigation results and implementation strategy for Milestone 3 (FastAPI Recipes & Steps) for the SuperSauced backend application.

---

## 1. Observation

During our read-only investigation, the following files and content were directly observed:

### A. API Specification (`/home/freya/supersauced/docs/api_spec.yaml`)
- **GET /recipes** (Lines 105-140): Query parameters include `limit` (default 10), `offset` (default 0), `cube_tags` (comma-separated), and `dietary_tags` (comma-separated). It returns an array of `Recipe` objects and requires `BearerAuth` (JWT).
- **POST /recipes** (Lines 140-156): Expects a `Recipe` object in the request body, returns a `Recipe` object with 201 Created status, and requires `BearerAuth`.
- **GET /recipes/{id}** (Lines 158-173): Expects a UUID path parameter and returns a single `Recipe` object. No local security block is explicitly defined in the path specification.
- **PUT /recipes/{id}** (Lines 174-195): Expects a `Recipe` object in the request body and returns the updated `Recipe`.
- **DELETE /recipes/{id}** (Lines 196-207): Returns a 204 No Content status upon successful deletion.
- **Ingredients endpoints** (Lines 208-301): Paths `/recipe_ingredients` and `/recipe_ingredients/{id}` supporting GET, POST, PUT, DELETE with `RecipeIngredient` schemas.
- **Steps endpoints** (Lines 302-395): Paths `/recipe_steps` and `/recipe_steps/{id}` supporting GET, POST, PUT, DELETE with `RecipeStep` schemas.
- **Schemas**:
  - `Recipe` (Lines 448-535) requires `id`, `title`, `slug`, `difficulty`, `cube_tags`, `dietary_tags`, `is_published`, `created_at`, `updated_at`. `difficulty` is restricted to `1` (easy) to `3` (hard).
  - `RecipeIngredient` (Lines 536-573) requires `id`, `recipe_id`, `name`.
  - `RecipeStep` (Lines 574-610) requires `id`, `recipe_id`, `step_number`, `description`. `step_number` has a minimum of 1.

### B. Database Migration Files (`/home/freya/supersauced/backend_guide/database/migrations/`)
- **`00002_core_schema.sql`**: Defines the target tables:
  - `public.recipes` (Lines 15-33):
    ```sql
    CREATE TABLE IF NOT EXISTS public.recipes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        hero_image_url TEXT,
        difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
        cook_time_minutes INTEGER CHECK (cook_time_minutes >= 0),
        calories_per_serving INTEGER CHECK (calories_per_serving >= 0),
        protein_g INTEGER CHECK (protein_g >= 0),
        fat_g INTEGER CHECK (fat_g >= 0),
        carbs_g INTEGER CHECK (carbs_g >= 0),
        cube_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
        dietary_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
        servings_default INTEGER CHECK (servings_default > 0),
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - `public.recipe_ingredients` (Lines 36-44):
    ```sql
    CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
        quantity NUMERIC(10,1) CHECK (quantity >= 0.0),
        unit TEXT,
        name TEXT NOT NULL,
        notes TEXT,
        position INTEGER CHECK (position >= 0)
    );
    ```
  - `public.recipe_steps` (Lines 47-56):
    ```sql
    CREATE TABLE IF NOT EXISTS public.recipe_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL CHECK (step_number > 0),
        description TEXT NOT NULL,
        video_url TEXT,
        timer_seconds INTEGER CHECK (timer_seconds >= 0),
        tip TEXT,
        CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
    );
    ```
- **`00003_indexes.sql`**: Applies GIN indexes on arrays:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
  CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
  ```
- **`00004_rls_policies.sql`**: Enables RLS on all tables and defines only `SELECT` policies for recipes, ingredients, and steps (Lines 17-39):
  ```sql
  -- RLS Policies for recipes
  CREATE POLICY "Allow select published or cms_editor" ON public.recipes
      FOR SELECT USING (is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor');

  -- RLS Policies for recipe_ingredients
  CREATE POLICY "Allow select ingredients for published or cms_editor" ON public.recipe_ingredients
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM public.recipes
              WHERE public.recipes.id = recipe_ingredients.recipe_id
                AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
          )
      );

  -- RLS Policies for recipe_steps
  CREATE POLICY "Allow select steps for published or cms_editor" ON public.recipe_steps
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM public.recipes
              WHERE public.recipes.id = recipe_steps.recipe_id
                AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
          )
      );
  ```
  *Crucially, there are NO policies allowing `INSERT`, `UPDATE`, or `DELETE` for non-superuser roles (authenticated/anon users) on recipes, ingredients, or steps.*

### C. Existing FastAPI Application Code
- **`app/api/deps.py`**: Exports client factories:
  - `get_user_client(token)`: constructs client authenticated with user's JWT (applies RLS policies).
  - `get_service_client()`: constructs client authenticated with the service role key (bypasses RLS policies).
  - `get_current_user(claims)`: parses JWT claims (`sub`, `email`, and `role`).
- **`app/api/v1/user_profiles.py`**: Establishes standards:
  - Select and modification requests query Supabase database using `user_client.from_("table")` syntax.
  - Partial updates use `.model_dump(exclude_unset=True)`.
  - Non-existent objects/denied selections are handled by returning 404 if data payload lists are empty.
- **`tests/conftest.py`**: Setup mocking:
  - Dependencies `get_service_client` and `get_user_client` are overridden with `mock_service_client` and `mock_user_client` fixtures in mock-enabled test suites.

---

## 2. Logic Chain

1. **Write Authorization & RLS Interactions**:
   - The tables `recipes`, `recipe_ingredients`, and `recipe_steps` have Row Level Security enabled.
   - The database migration `00004_rls_policies.sql` defines only `SELECT` RLS policies. It contains no `INSERT`, `UPDATE`, or `DELETE` policies for standard users.
   - Consequently, any write operation (POST, PUT, DELETE) executed with a user-scoped client (`get_user_client`) will be blocked by PostgreSQL's default-deny RLS behavior.
   - To bypass this restriction for content authors, writes must be performed using the service-role client (`get_service_client`), which is initialized using the `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS.
   - However, since we are using a service client that bypasses RLS, the backend application itself must guarantee security by validating that the user is authorized. The `SELECT` policy check `(auth.jwt() ->> 'role') = 'cms_editor'` indicates that content editors carry the role `'cms_editor'`.
   - Therefore, the routes for POST, PUT, and DELETE on recipes, ingredients, and steps must enforce:
     ```python
     if current_user.role != "cms_editor":
         raise HTTPException(status_code=403, detail="Only cms_editor users can modify content.")
     ```
     Once verified, they must perform the database writes using the `service_client` dependency rather than the `user_client` dependency.

2. **Read Operations**:
   - For GET operations (`GET /recipes`, `GET /recipes/{id}`, etc.), we want RLS to naturally filter results. Specifically, a regular user should only see published recipes, whereas a `'cms_editor'` should see both published and unpublished recipes.
   - Since the database has SELECT policies defined, we can retrieve data using the standard `user_client` dependency (`get_user_client`). PostgREST will evaluate the user's role and publication status automatically.

3. **Array Tags Filtering**:
   - Comma-separated strings representing multiple tags are passed via query parameters `cube_tags` and `dietary_tags` for `GET /recipes`.
   - Standard REST conventions dictate that filtering by multiple tags implies an `AND` operation (e.g. finding a recipe that matches *all* selected dietary tags, such as both "vegan" and "gluten-free").
   - Under the Supabase Python client, we can translate this to the PostgREST contains query (`.contains(column, value)`), passing a parsed list of tag strings. If the requirements instead dictate an `OR` operation, we would use the overlaps query (`.overlaps(column, value)`). The `contains` query matches PostgreSQL's array containment operator `@>`.

---

## 3. Caveats

- **Supabase Client Package Availability**: The mock environment uses minimal stubs in `deps.py` for code execution without a live Supabase server. In mock test execution, `from_` and method chaining are completely mocked.
- **Consistency of Client Invocations**: We assume the use of `from_("recipes")` is required rather than `table("recipes")` to match `user_profiles.py` structure.
- **CMS Editor Roles**: We assume the exact string `'cms_editor'` matches the JWT role claim populated in Supabase auth metadata.

---

## 4. Conclusion & Recommended Strategy

We recommend creating/modifying the following backend files using the structures detailed below:

### A. Schemas: `/home/freya/supersauced/backend_guide/app/schemas/recipe.py`
Create a consolidated schema file containing models for recipes, ingredients, and steps.

```python
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field

# --- Recipes ---
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

class Recipe(RecipeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }

# --- Ingredients ---
class RecipeIngredientBase(BaseModel):
    recipe_id: UUID
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredientCreate(RecipeIngredientBase):
    pass

class RecipeIngredientUpdate(BaseModel):
    recipe_id: Optional[UUID] = None
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredient(RecipeIngredientBase):
    id: UUID

    model_config = {
        "from_attributes": True
    }

# --- Steps ---
class RecipeStepBase(BaseModel):
    recipe_id: UUID
    step_number: int = Field(..., ge=1)
    description: str
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None

class RecipeStepCreate(RecipeStepBase):
    pass

class RecipeStepUpdate(BaseModel):
    recipe_id: Optional[UUID] = None
    step_number: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    video_url: Optional[str] = None
    timer_seconds: Optional[int] = Field(None, ge=0)
    tip: Optional[str] = None

class RecipeStep(RecipeStepBase):
    id: UUID

    model_config = {
        "from_attributes": True
    }
```

Update `/home/freya/supersauced/backend_guide/app/schemas/__init__.py` to export these new models.

---

### B. Routers
Create the following router files under `/home/freya/supersauced/backend_guide/app/api/v1/`:

#### 1. `/home/freya/supersauced/backend_guide/app/api/v1/recipes.py`
```python
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.deps import get_user_client, get_service_client, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.recipe import Recipe, RecipeCreate, RecipeUpdate

router = APIRouter()

@router.get("", response_model=List[Recipe])
def list_recipes(
    limit: int = 10,
    offset: int = 0,
    cube_tags: Optional[str] = None,
    dietary_tags: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Any = Depends(get_user_client)
):
    # Query builder with pagination range
    query = user_client.from_("recipes").select("*").range(offset, offset + limit - 1)
    
    # Comma-separated parsing and mapping to contains filters (Postgres GIN index query)
    if cube_tags:
        tags_list = [t.strip() for t in cube_tags.split(",") if t.strip()]
        if tags_list:
            query = query.contains("cube_tags", tags_list)
            
    if dietary_tags:
        tags_list = [t.strip() for t in dietary_tags.split(",") if t.strip()]
        if tags_list:
            query = query.contains("dietary_tags", tags_list)
            
    try:
        res = query.execute()
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch recipes: {str(e)}"
        )

@router.get("/{id}", response_model=Recipe)
def get_recipe(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Any = Depends(get_user_client)
):
    try:
        res = user_client.from_("recipes").select("*").eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or access denied."
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch recipe: {str(e)}"
        )

@router.post("", response_model=Recipe, status_code=status.HTTP_201_CREATED)
def create_recipe(
    body: RecipeCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Any = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only cms_editor users can modify recipes."
        )
    try:
        res = service_client.from_("recipes").insert(body.model_dump()).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipe creation failed."
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recipe creation error: {str(e)}"
        )

@router.put("/{id}", response_model=Recipe)
def update_recipe(
    id: str,
    body: RecipeUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Any = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only cms_editor users can modify recipes."
        )
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No update fields provided."
        )
    try:
        res = service_client.from_("recipes").update(update_data).eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or update failed."
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recipe update error: {str(e)}"
        )

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Any = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only cms_editor users can modify recipes."
        )
    try:
        res = service_client.from_("recipes").delete().eq("id", id).execute()
        # PostgREST delete completes successfully without data when returning empty array
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recipe deletion error: {str(e)}"
        )
```

#### 2. `/home/freya/supersauced/backend_guide/app/api/v1/recipe_ingredients.py`
Follows identical security checks, pagination, and client structures as `recipes.py` but for ingredients.
- GET `/recipe_ingredients`: returns list of ingredients from `recipe_ingredients` table using user client.
- GET `/recipe_ingredients/{id}`: returns a single ingredient.
- POST `/recipe_ingredients`: creates an ingredient using the service client if user role is `cms_editor`.
- PUT `/recipe_ingredients/{id}`: updates an ingredient using the service client if user role is `cms_editor`.
- DELETE `/recipe_ingredients/{id}`: deletes an ingredient using the service client if user role is `cms_editor`.

#### 3. `/home/freya/supersauced/backend_guide/app/api/v1/recipe_steps.py`
Follows identical security checks, pagination, and client structures as `recipes.py` but for steps.
- GET `/recipe_steps`: returns list of steps from `recipe_steps` table using user client.
- GET `/recipe_steps/{id}`: returns a single step.
- POST `/recipe_steps`: creates a step using the service client if user role is `cms_editor`.
- PUT `/recipe_steps/{id}`: updates a step using the service client if user role is `cms_editor`.
- DELETE `/recipe_steps/{id}`: deletes a step using the service client if user role is `cms_editor`.

#### Main Registration (`/home/freya/supersauced/backend_guide/app/main.py`)
In `main.py`, include the following router additions:
```python
from app.api.v1 import auth, user_profiles, functions, recipes, recipe_ingredients, recipe_steps

# ...

# Standard Router Registrations
app.include_router(recipes.router, prefix="/recipes", tags=["Recipes"])
app.include_router(recipe_ingredients.router, prefix="/recipe_ingredients", tags=["Recipe Ingredients"])
app.include_router(recipe_steps.router, prefix="/recipe_steps", tags=["Recipe Steps"])

# v1 Compatibility Router Registrations
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["Recipes (v1)"])
app.include_router(recipe_ingredients.router, prefix="/api/v1/recipe_ingredients", tags=["Recipe Ingredients (v1)"])
app.include_router(recipe_steps.router, prefix="/api/v1/recipe_steps", tags=["Recipe Steps (v1)"])
```

---

### C. Detailed Pytest Suite Plans
Three test files should be added under `/home/freya/supersauced/backend_guide/tests/`:
1. `tests/test_recipes.py`
2. `tests/test_recipe_ingredients.py`
3. `tests/test_recipe_steps.py`

#### Plan for `tests/test_recipes.py`:
- **`test_list_recipes_success`**: Mock `mock_user_client` to return list of recipes. Query `GET /recipes` with standard JWT token. Assert 200 OK and that correct database filters (limit/offset) are passed.
- **`test_list_recipes_filtering_tags`**: Query `GET /recipes?cube_tags=sweet,sour&dietary_tags=vegan`. Assert that the user client `contains` method is called with `["sweet", "sour"]` on `cube_tags` and `["vegan"]` on `dietary_tags`.
- **`test_get_recipe_by_id_success`**: Mock query response, execute `GET /recipes/{id}`. Assert 200 OK.
- **`test_get_recipe_by_id_not_found`**: Mock empty list return, assert 404 NOT FOUND.
- **`test_create_recipe_cms_editor`**: Generate JWT with `"role": "cms_editor"`. Mock `mock_service_client` insert response. Call `POST /recipes`. Assert 201 CREATED and verification of payload insertion.
- **`test_create_recipe_authenticated_forbidden`**: Generate JWT with `"role": "authenticated"`. Call `POST /recipes`. Assert 403 FORBIDDEN.
- **`test_update_recipe_cms_editor`**: Generate editor JWT, mock update execution on `mock_service_client`. Call `PUT /recipes/{id}`. Assert 200 OK.
- **`test_update_recipe_forbidden`**: Generate regular user JWT, call `PUT /recipes/{id}`. Assert 403 FORBIDDEN.
- **`test_delete_recipe_cms_editor`**: Generate editor JWT, mock delete execution on `mock_service_client`. Call `DELETE /recipes/{id}`. Assert 204 NO CONTENT.
- **`test_delete_recipe_forbidden`**: Generate regular user JWT, call `DELETE /recipes/{id}`. Assert 403 FORBIDDEN.

Procedures for ingredients and steps tests should mimic the recipes layout, checking validation rules (such as step `step_number` >= 1 validation, recipe associations, and `cms_editor` role authorization).

---

## 5. Verification Method

To verify the implementation of the strategy once code is written:
1. Navigate to `/home/freya/supersauced/backend_guide`
2. Execute the test runner command:
   ```bash
   poetry run pytest tests/
   ```
   or
   ```bash
   pytest tests/
   ```
3. Look for the execution of the new test modules:
   - `tests/test_recipes.py`
   - `tests/test_recipe_ingredients.py`
   - `tests/test_recipe_steps.py`
4. Confirm all new unit and integration tests compile and pass successfully.
