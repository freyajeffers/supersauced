# Handoff Report — Milestone 3: FastAPI Recipes & Steps Implementation Strategy

## 1. Observation
- **API Specification (`/home/freya/supersauced/docs/api_spec.yaml`)**:
  - GET `/recipes` requires `BearerAuth` (lines 105-110). Query parameters include `limit` (default 10), `offset` (default 0), `cube_tags` (string), and `dietary_tags` (string).
  - GET `/recipes/{id}` is public/unauthenticated (no security element, lines 158-173).
  - POST, PUT, DELETE operations on `/recipes` (lines 140-156, 174-207) and `/recipes/{id}` require `BearerAuth`.
  - Same patterns are repeated for `/recipe_ingredients` and `/recipe_steps` (lines 208-395).
  - The schema definitions for `Recipe`, `RecipeIngredient`, and `RecipeStep` are detailed under components (lines 448-610).
- **Database Migrations (`/home/freya/supersauced/backend_guide/database/migrations/`)**:
  - `00002_core_schema.sql` defines:
    - `public.recipes` (lines 15-33) with fields `cube_tags TEXT[]` and `dietary_tags TEXT[]` defaulting to `'{}'::text[]`.
    - `public.recipe_ingredients` (lines 36-44) references `public.recipes` with `ON DELETE CASCADE`.
    - `public.recipe_steps` (lines 47-56) references `public.recipes` with `ON DELETE CASCADE` and a deferred unique constraint on `(recipe_id, step_number)`.
  - `00003_indexes.sql` defines:
    - GIN indexes `idx_recipes_cube_tags` and `idx_recipes_dietary_tags` (lines 2-3).
  - `00004_rls_policies.sql` defines:
    - Row-level security on all tables (lines 1-5).
    - SELECT policies (lines 18-39):
      - Recipes: `is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor'`.
      - Ingredients & Steps: `EXISTS` check on recipe matching the same select conditions.
      - **Crucial Observation**: There are no write policies (INSERT, UPDATE, DELETE) defined for recipes, ingredients, or steps.
- **Fastapi Application Structure**:
  - `app/api/deps.py` defines `get_user_client` (using anon key + user token) and `get_service_client` (using service role key). `get_token` uses `HTTPBearer` which enforces authentication.
  - `app/main.py` defines router registrations and prefixes.

---

## 2. Logic Chain
1. **Pydantic Schemas Design**:
   - Pydantic V2 model config should be used (`model_config = {"from_attributes": True}`) to match `user_profile.py`.
   - Separate models are required for Read (`Recipe`, `RecipeIngredient`, `RecipeStep`), Create (`RecipeCreate`, `RecipeIngredientCreate`, `RecipeStepCreate`), and Update (`RecipeUpdate`, `RecipeIngredientUpdate`, `RecipeStepUpdate`) to separate DB-generated fields (`id`, `created_at`, `updated_at`) from user input, and allow optional updates.
2. **Endpoint Routing & main.py Registration**:
   - Routers should be separated into `app/api/v1/recipes.py`, `app/api/v1/recipe_ingredients.py`, and `app/api/v1/recipe_steps.py`.
   - In `app/main.py`, they must be registered both at the root level (`/recipes`) and under `/api/v1/recipes` to ensure API spec compliance and client compatibility.
3. **Tags Array Filtering**:
   - In PostgreSQL, array filtering can match any tag (overlaps) or all tags (contains).
   - In python-postgrest, this maps to `.overlaps()` (OR logic) or `.contains()` (AND logic).
   - The values parsed from comma-separated strings should be stripped and passed as a python list:
     - `ctags = [t.strip() for t in cube_tags.split(",") if t.strip()]`
     - Query construction: `query = query.overlaps("cube_tags", ctags)` (or `contains` depending on the desired matching logic).
4. **Authentication & Write Authorization**:
   - Because single-item GET routes (e.g. `GET /recipes/{id}`) are unauthenticated but still respect RLS (users with no token see only published; `cms_editor` sees unpublished), we must define a new FastAPI dependency `get_optional_user_client` that wraps `HTTPBearer(auto_error=False)`:
     ```python
     reusable_oauth2_optional = HTTPBearer(auto_error=False)
     def get_optional_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(reusable_oauth2_optional)) -> Optional[str]:
         return credentials.credentials if credentials else None

     def get_optional_user_client(token: Optional[str] = Depends(get_optional_token)) -> Any:
         client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
         if token:
             client.postgrest.auth(token)
         return client
     ```
   - Since no RLS write policies exist in the database, writing with the standard user-scoped client will fail.
   - Therefore, all write endpoints (POST, PUT, DELETE) must:
     1. Authenticate the user and verify they have the role `cms_editor` via FastAPI deps (`current_user.role == "cms_editor"`). Raise `403 Forbidden` if not.
     2. Execute the write operation using the service role client (`get_service_client()`), which bypasses database RLS.
5. **Testing Architecture (pytest)**:
   - Create test files: `tests/test_recipes.py`, `tests/test_recipe_ingredients.py`, `tests/test_recipe_steps.py`.
   - Override `get_optional_user_client` in tests using a fixture similar to `override_deps` in `conftest.py`.
   - Mock Supabase queries flexibly by having mock client methods return the same builder instance for easy chaining.

---

## 3. Caveats
- **User Role Storage**: We assume the database auth user metadata or JWT claim holds the role `cms_editor` inside `role` claim (`auth.jwt() ->> 'role'`).
- **Tag Filtering Logic**: We assume `overlaps` (any matching tag) is the preferred behavior for search filtering, but have provided `contains` (all matching tags) as a parallel option.

---

## 4. Conclusion
The implementation strategy is solid and bridges the gap between Row Level Security rules and FastAPI path handlers. Use `get_optional_user_client` for single GET endpoints, standard `get_user_client` for paginated list endpoints, and application-level role validation + `get_service_client` for write endpoints (POST, PUT, DELETE).

---

## 5. Verification Method
1. **Running Tests**: Run existing and new test suites:
   `export $(grep -v '^#' .env | xargs) && .venv/bin/pytest`
2. **Files to Inspect**:
   - Schemas: `/home/freya/supersauced/backend_guide/app/schemas/`
   - Routers: `/home/freya/supersauced/backend_guide/app/api/v1/`
   - Registration: `/home/freya/supersauced/backend_guide/app/main.py`
   - Test Files: `/home/freya/supersauced/backend_guide/tests/`
3. **Invalidation Conditions**: If write requests from users with roles other than `cms_editor` succeed, or if unauthenticated requests can view unpublished recipes, the implementation is incorrect.
