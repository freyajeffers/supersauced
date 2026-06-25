# Handoff Report - Recipe CRUD Design Strategy

This report synthesizes the analysis and design recommendations for implementing the recipes, ingredients, and steps CRUD endpoints in Python FastAPI.

---

## 1. Observation

During the read-only investigation, the following files and code snippets were observed:

### A. Database Schema
In `backend_guide/database/migrations/00002_core_schema.sql`, the schema for `recipes`, `recipe_ingredients`, and `recipe_steps` is defined as:
```sql
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    hero_image_url TEXT,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    ...
    cube_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    dietary_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    ...
);
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    ...
);
CREATE TABLE IF NOT EXISTS public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number > 0),
    ...
);
```

### B. Index Definitions
In `backend_guide/database/migrations/00003_indexes.sql`:
- **Line 2**: `CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);`
- **Line 3**: `CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);`
- **Line 4**: `CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));`

### C. RLS Policies
In `backend_guide/database/migrations/00004_rls_policies.sql`:
- **Line 18-19**:
  ```sql
  CREATE POLICY "Allow select published or cms_editor" ON public.recipes
      FOR SELECT USING (is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor');
  ```
- **Line 22-29**:
  ```sql
  CREATE POLICY "Allow select ingredients for published or cms_editor" ON public.recipe_ingredients
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM public.recipes
              WHERE public.recipes.id = recipe_ingredients.recipe_id
                AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
          )
      );
  ```
- **Line 31-38**:
  ```sql
  CREATE POLICY "Allow select steps for published or cms_editor" ON public.recipe_steps
      FOR SELECT USING (
          EXISTS (
              SELECT 1 FROM public.recipes
              WHERE public.recipes.id = recipe_steps.recipe_id
                AND (public.recipes.is_published = true OR (auth.jwt() ->> 'role') = 'cms_editor')
          )
      );
  ```
- Note: There are no write policies (`INSERT`, `UPDATE`, `DELETE`) defined for these tables in this migration.

### D. FastAPI Router Dependencies
In `backend_guide/app/api/deps.py` lines 61-69:
```python
def get_user_client(token: str = Depends(get_token)) -> Any:
    """Dependency injecting a user‑scoped Supabase client (RLS enforced)."""
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(token)
    return client

def get_service_client() -> Any:
    """Dependency injecting a service‑role Supabase client (bypassing RLS)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
```

---

## 2. Logic Chain

1. **Routing Strategy**: Endpoints are logically grouped by database resource (`recipes`, `recipe_ingredients`, `recipe_steps`). To remain consistent with user profile endpoints (`backend_guide/app/api/v1/user_profiles.py`), we should create dedicated router modules (`recipes.py`, `recipe_ingredients.py`, `recipe_steps.py`) and register them in `app/main.py`.
2. **Tag & Text Filtering**: 
   - Since `cube_tags` and `dietary_tags` are stored as native PG array types (`TEXT[]`) and indexed with GIN (Obs. B), we must delegate the queries to the database using PostgREST operators rather than doing in-memory filtering. 
   - `cube_tags` requires AND matching, which maps to containment (`cs` / `@>`). `dietary_tags` requires OR matching, which maps to overlap (`ov` / `&&`).
   - For full-text search, because the GIN index uses a functional expression (`to_tsvector(...)`), PostgREST cannot directly search it. We need either a generated column `fts` storing the precomputed vectors or a custom RPC database search function that encapsulates the FTS criteria.
3. **Resource Embedding (N+1 Optimization)**: 
   - Fetching nested lists (`recipe_ingredients` and `recipe_steps` for a recipe) in separate HTTP requests would trigger N+1 queries.
   - PostgREST natively supports declarative joins (resource embedding). By requesting nested resources (e.g. `.select("*, recipe_ingredients(*), recipe_steps(*)")`), we retrieve the recipe tree in a single database lookup.
   - Database-level ordering can be performed on nested tables (e.g., using `foreign_table` query parameters) to keep the list entries sorted by step number/position.
4. **RLS Delegation**: 
   - For reading recipes, the existing database policies (Obs. C) allow standard users to read only published items while CMS editors can read draft items. By using `get_user_client` (Obs. D), we delegate this check entirely to the database.
   - For writing recipes, because no policies exist in the database (Obs. C), the user client cannot perform writes. To preserve RLS enforcement, we recommend deploying write policies in the database and keeping `user_client` in FastAPI, rather than using `service_client` for everything, which would bypass security controls at the DB layer.

---

## 3. Caveats

- We assumed that database schema updates are permitted (specifically for Option A in Full-Text Search, which adds a generated column `fts`, and for Option A in Write policies, which adds INSERT/UPDATE/DELETE RLS rules to the database). If database schema changes are strictly locked, developers must fallback to RPC-based searches and app-level role-checking with `service_client` bypasses.
- We did not implement or verify the performance of the full text search on massive database mock volumes, though GIN indexing generally scales efficiently.

---

## 4. Conclusion

We recommend adding `recipes`, `recipe_ingredients`, and `recipe_steps` routers to FastAPI under `app/api/v1/` delegating standard SELECT queries to a user-scoped database client (`get_user_client`). For performance, tag filtering should delegate via `.contains` and `.overlaps` to matching GIN indexes, and nested resources should be embedded in a single `.select(...)` query. To resolve FTS and RLS write limits, we recommend database migrations adding a generated `fts` column and write RLS policies for `cms_editor` respectively.

---

## 5. Verification Method

To verify the recommendations once implemented:
1. Inspect the new router registration in `backend_guide/app/main.py` and the router modules under `backend_guide/app/api/v1/`.
2. Run pytest suite (e.g., `pytest backend_guide/tests/`) to ensure no existing tests are broken.
3. Add mock database data and run mock integration tests:
   - Query `/recipes?cube_tags=spicy,garlic` and verify the query logs show PostgREST array containment filter `cube_tags=cs.{spicy,garlic}` is invoked.
   - Query `/recipes/{id}` and check the nested lists `recipe_steps` and `recipe_ingredients` are present, ordered properly, and fetched in a single database call.
   - Query a draft recipe as an anonymous user and ensure a `404 Not Found` is returned (verifying RLS filters the recipe out).
