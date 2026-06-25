# Milestone 3 Handoff Report: FastAPI Recipes & Steps Implementation Strategy

This report details the findings and recommended strategy for implementing the FastAPI routes, schemas, and tests for Milestone 3 (Recipes, Ingredients, Steps).

## 1. Observation

During read-only investigation, the following files and lines were observed:

1. **API Spec (`/home/freya/supersauced/docs/api_spec.yaml`)**:
   - `paths` (lines 104-395) define:
     - GET, POST `/recipes`
     - GET, PUT, DELETE `/recipes/{id}`
     - GET, POST `/recipe_ingredients`
     - GET, PUT, DELETE `/recipe_ingredients/{id}`
     - GET, POST `/recipe_steps`
     - GET, PUT, DELETE `/recipe_steps/{id}`
   - `schemas` (lines 448-610) define models:
     - `Recipe` (required properties: `id`, `title`, `slug`, `difficulty`, `cube_tags`, `dietary_tags`, `is_published`, `created_at`, `updated_at`)
     - `RecipeIngredient` (required properties: `id`, `recipe_id`, `name`)
     - `RecipeStep` (required properties: `id`, `recipe_id`, `step_number`, `description`)

2. **Database Migrations (`/home/freya/supersauced/backend_guide/database/migrations/`)**:
   - `00002_core_schema.sql` defines:
     - Table `public.recipes` (lines 15-33) with GIN indexable fields `cube_tags` and `dietary_tags` defaulting to `'{}'::text[]` and constraints.
     - Table `public.recipe_ingredients` (lines 36-44) with `recipe_id` referencing `recipes(id) ON DELETE CASCADE`.
     - Table `public.recipe_steps` (lines 46-56) with `recipe_id` referencing `recipes(id) ON DELETE CASCADE` and unique constraint: `CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED`.
   - `00003_indexes.sql` defines:
     - GIN indexes `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` on `public.recipes` (lines 2-3).
   - `00004_rls_policies.sql` defines select policies:
     - Recipes (lines 18-19): `is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor'`.
     - Ingredients (lines 22-29) & Steps (lines 32-39): Allow select if parent recipe is published OR the user role is `'cms_editor'`.
     - **Important**: No write (INSERT, UPDATE, DELETE) policies are defined for recipes, ingredients, or steps.

3. **FastAPI Code base (`/home/freya/supersauced/backend_guide/app/`)**:
   - `api/deps.py` defines standard dependencies:
     - `get_current_user` (lines 51-59) returning a `CurrentUser` model.
     - `get_user_client` (lines 61-65) creating a user-scoped client that enforces RLS.
     - `get_service_client` (lines 67-69) creating a service-role client that bypasses RLS.
   - `api/v1/user_profiles.py` demonstrates standard query patterns (lines 27, 47, 87, 117): e.g. `user_client.from_("user_profiles").select("*").eq("id", id).execute()`.
   - `main.py` (lines 26-28) registers routers under `/` and `/api/v1/` prefixes.

4. **Existing Test Failures (Observed from pytest run)**:
   - `tests/test_deps.py::test_current_user_model` fails because it passes a token string directly to `get_current_user` instead of decoded claims dict (which the dependency expects).
   - `tests/test_auth_extended.py::test_signup_error_path` fails with `422` instead of `400` because the payload password `"pwd"` is too short for validation.
   - `tests/test_user_profiles_extended.py::test_profile_crud` fails with `405 Method Not Allowed` because it POSTs to `/user_profiles` directly, which has no POST route defined in the app.

---

## 2. Logic Chain

1. **Authentication & Write Authorization**:
   - RLS select policies exist for reading recipes/ingredients/steps, meaning user-scoped clients (which use the user's JWT) will naturally enforce these policies when querying.
   - However, since **no write policies** (INSERT, UPDATE, DELETE) exist on `recipes`, `recipe_ingredients`, or `recipe_steps` in `00004_rls_policies.sql`, any attempt to write using a user-scoped client will trigger a PostgreSQL permission denied/RLS violation.
   - Therefore, all write operations (POST, PUT, DELETE) must be executed using the service-role client (`get_service_client`).
   - To prevent unauthorized writes, authorization checks must be performed at the FastAPI layer using `Depends(get_current_user)` to verify that `current_user.role == "cms_editor"`. Standard authenticated users (role `"authenticated"`) or anonymous users must be rejected with HTTP `403 Forbidden`.

2. **Optional Authentication for GET Routes**:
   - GET `/recipes/{id}`, GET `/recipe_ingredients/{id}`, and GET `/recipe_steps/{id}` do not specify `security` in the API spec, making them public.
   - However, they must still support RLS-scoped reads so that `cms_editor` users can preview unpublished recipes, while anonymous users are restricted to published ones.
   - Therefore, a custom dependency `get_optional_user_client` should be implemented in `app/api/deps.py` that extracts the authorization header if present, configures the Supabase client accordingly, and defaults to the anonymous role client if missing.

3. **Tags Array Filtering (GET `/recipes`)**:
   - The query parameters `cube_tags` and `dietary_tags` are comma-separated strings of tags.
   - They must be parsed into a clean list of strings: `[tag.strip() for tag in tags_str.split(",") if tag.strip()]`.
   - PostgREST has `.contains(col, val)` mapping to the `@>` (contains) operator. Since tag searches usually represent strict inclusion (e.g. finding recipes that have all requested dietary tags), `contains` is the most appropriate search operator for these arrays.
   - If OR logic is required for cube tags (match any tag), `.overlaps(col, val)` mapping to `&&` (overlaps) can be used instead. We will design the code to use `.contains()` for both.

---

## 3. Caveats

- **Existing test failures**: The existing test suite contains code quality bugs (e.g. incorrect dependency mock calls, bad schemas, and missing environment variables) that cause test failures. The new test designs must avoid these pitfalls by ensuring valid mock inputs and proper dependency matching.
- **Database Write Policies**: If future database migrations introduce RLS insert/update/delete policies for the `cms_editor` role, the backend could shift to using `get_user_client` for writes. However, under the current schema, using the service role client is strictly required.

---

## 4. Conclusion & Implementation Strategy

### A. Pydantic Schemas

Create the following files under `/home/freya/supersauced/backend_guide/app/schemas/`:

#### 1. `/home/freya/supersauced/backend_guide/app/schemas/recipe.py`
```python
from typing import List, Optional
from pydantic import BaseModel, Field

class RecipeBase(BaseModel):
    title: str
    slug: str
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    difficulty: int = Field(..., ge=1, le=3, description="Difficulty rating from 1 to 3")
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
    id: str
    created_at: str
    updated_at: str

    model_config = {
        "from_attributes": True
    }
```

#### 2. `/home/freya/supersauced/backend_guide/app/schemas/recipe_ingredient.py`
```python
from typing import Optional
from pydantic import BaseModel, Field

class RecipeIngredientBase(BaseModel):
    recipe_id: str
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: str
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredientCreate(RecipeIngredientBase):
    pass

class RecipeIngredientUpdate(BaseModel):
    recipe_id: Optional[str] = None
    quantity: Optional[float] = Field(None, ge=0.0)
    unit: Optional[str] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)

class RecipeIngredient(RecipeIngredientBase):
    id: str

    model_config = {
        "from_attributes": True
    }
```

#### 3. `/home/freya/supersauced/backend_guide/app/schemas/recipe_step.py`
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

class RecipeStep(RecipeStepBase):
    id: str

    model_config = {
        "from_attributes": True
    }
```

And expose them in `/home/freya/supersauced/backend_guide/app/schemas/__init__.py`:
```python
# Pydantic validation schemas
from .recipe import Recipe, RecipeCreate, RecipeUpdate
from .recipe_ingredient import RecipeIngredient, RecipeIngredientCreate, RecipeIngredientUpdate
from .recipe_step import RecipeStep, RecipeStepCreate, RecipeStepUpdate
```

---

### B. Dependency Additions

Add the following to `/home/freya/supersauced/backend_guide/app/api/deps.py`:
```python
reusable_oauth2_optional = HTTPBearer(auto_error=False)

def get_optional_user_client(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(reusable_oauth2_optional)
) -> Any:
    """
    Dependency injecting a user-scoped Supabase client if a token is present,
    or an anonymous client if no token is provided.
    """
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    if credentials:
        client.postgrest.auth(credentials.credentials)
    return client
```

---

### C. Router Structure

Create three routers under `/home/freya/supersauced/backend_guide/app/api/v1/`:

#### 1. `recipes.py`
```python
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
try:
    from supabase import Client
except Exception:
    class Client:
        pass

from app.api.deps import get_user_client, get_service_client, get_current_user, get_optional_user_client
from app.schemas.auth import CurrentUser
from app.schemas.recipe import Recipe, RecipeCreate, RecipeUpdate

router = APIRouter()

@router.get("", response_model=List[Recipe])
def list_recipes(
    limit: int = 10,
    offset: int = 0,
    cube_tags: Optional[str] = None,
    dietary_tags: Optional[str] = None,
    user_client: Client = Depends(get_user_client) # Authenticated per spec
):
    try:
        query = user_client.from_("recipes").select("*")
        if cube_tags:
            tags = [t.strip() for t in cube_tags.split(",") if t.strip()]
            if tags:
                query = query.contains("cube_tags", tags)
        if dietary_tags:
            tags = [t.strip() for t in dietary_tags.split(",") if t.strip()]
            if tags:
                query = query.contains("dietary_tags", tags)
        query = query.range(offset, offset + limit - 1)
        res = query.execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("", response_model=Recipe, status_code=status.HTTP_201_CREATED)
def create_recipe(
    body: RecipeCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        res = service_client.from_("recipes").insert(body.model_dump()).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create recipe")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/{id}", response_model=Recipe)
def get_recipe(
    id: str,
    user_client: Client = Depends(get_optional_user_client)
):
    try:
        res = user_client.from_("recipes").select("*").eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/{id}", response_model=Recipe)
def update_recipe(
    id: str,
    body: RecipeUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    try:
        res = service_client.from_("recipes").update(update_data).eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client)
):
    if current_user.role != "cms_editor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        service_client.from_("recipes").delete().eq("id", id).execute()
        return None
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
```

#### 2. `recipe_ingredients.py`
Follows standard structure, querying `recipe_ingredients` table. Supports optional `recipe_id` query parameter for list GET route. Writes utilize `get_service_client` and require `cms_editor`.

#### 3. `recipe_steps.py`
Querying `recipe_steps` table. Handles unique constraints gracefully:
```python
    except Exception as e:
        error_msg = str(e)
        if "unique_recipe_step" in error_msg or "duplicate key" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Step number must be unique for this recipe"
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)
```

---

### D. Main App Registration

In `app/main.py`:
```python
from app.api.v1 import auth, user_profiles, functions, recipes, recipe_ingredients, recipe_steps

# Main paths
app.include_router(recipes.router, prefix="/recipes", tags=["Recipes"])
app.include_router(recipe_ingredients.router, prefix="/recipe_ingredients", tags=["Ingredients"])
app.include_router(recipe_steps.router, prefix="/recipe_steps", tags=["Steps"])

# v1 paths
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["Recipes (v1)"])
app.include_router(recipe_ingredients.router, prefix="/api/v1/recipe_ingredients", tags=["Ingredients (v1)"])
app.include_router(recipe_steps.router, prefix="/api/v1/recipe_steps", tags=["Steps (v1)"])
```

---

## 5. Verification Method

To verify the correct execution, the following tests should be implemented under `/home/freya/supersauced/backend_guide/tests/`:

### 1. Mocking Helper (Add to tests)
```python
def make_mock_client(data):
    client = MagicMock()
    query = MagicMock()
    res = MagicMock()
    res.data = data
    
    # Fluent interface mapping
    query.select.return_value = query
    query.eq.return_value = query
    query.contains.return_value = query
    query.overlaps.return_value = query
    query.range.return_value = query
    query.insert.return_value = query
    query.update.return_value = query
    query.delete.return_value = query
    query.execute.return_value = res
    
    client.from_.return_value = query
    return client
```

### 2. Mock Test Cases
Implement files like `tests/test_recipes_m3.py`:

- **Test Tag Filtering**:
  ```python
  def test_list_recipes_filter_tags(test_client, mock_user_client, generate_jwt):
      token = generate_jwt(sub="user-123", email="u@example.com", role="authenticated")
      mock_client = make_mock_client([{"id": "r1", "title": "Recipe 1"}])
      
      # Inject
      app.dependency_overrides[get_user_client] = lambda: mock_client
      
      headers = {"Authorization": f"Bearer {token}"}
      resp = test_client.get("/recipes?cube_tags=spicy,sweet", headers=headers)
      assert resp.status_code == 200
      mock_client.from_.return_value.contains.assert_called_with("cube_tags", ["spicy", "sweet"])
  ```

- **Test Write Forbidden**:
  ```python
  def test_create_recipe_forbidden(test_client, generate_jwt):
      token = generate_jwt(sub="user-123", email="u@example.com", role="authenticated")
      payload = {
          "title": "New Recipe", "slug": "new-recipe", "difficulty": 2
      }
      headers = {"Authorization": f"Bearer {token}"}
      resp = test_client.post("/recipes", json=payload, headers=headers)
      assert resp.status_code == 403
  ```

- **Test Write Success (Editor)**:
  ```python
  def test_create_recipe_editor(test_client, mock_service_client, generate_jwt):
      token = generate_jwt(sub="editor-123", email="editor@example.com", role="cms_editor")
      mock_client = make_mock_client([{"id": "r1", "title": "New Recipe"}])
      
      app.dependency_overrides[get_service_client] = lambda: mock_client
      
      payload = {
          "title": "New Recipe", "slug": "new-recipe", "difficulty": 2
      }
      headers = {"Authorization": f"Bearer {token}"}
      resp = test_client.post("/recipes", json=payload, headers=headers)
      assert resp.status_code == 201
      assert resp.json()["title"] == "New Recipe"
  ```

### Execution Command
Verify the execution by running the following command in `/home/freya/supersauced/backend_guide`:
```bash
SUPABASE_JWT_SECRET=test-secret-at-least-32-characters-long SUPABASE_SERVICE_ROLE_KEY=service-role-key-placeholder pytest tests/test_recipes_m3.py
```
This isolates the newly created tests and executes them inside a mocked environment.
