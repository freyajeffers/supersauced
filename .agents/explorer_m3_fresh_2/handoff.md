# Handoff Report - Recipe CRUD Design Analysis

## 1. Observation
- **API Spec Details**:
  - The API specification details `/recipes`, `/recipe_ingredients`, and `/recipe_steps` endpoints.
  - In `docs/api_spec.md` line 84, we observe: `/recipes` GET is "Public (returns published) or CMS Editor (all)".
  - In `docs/api_spec.md` line 120-124: `cube_tags` and `dietary_tags` are stored as PostgreSQL native arrays (`text[]`). Array operators `cs` (contains) and `ov` (overlaps) are required for querying them.
  - In `docs/api_spec.md` lines 180-183, text search is defined as `query.textSearch('fts', searchTerm.trim())`.
- **Database Schema**:
  - In `backend_guide/database/migrations/00002_core_schema.sql` lines 15-33, the `recipes` table is defined. There is **no** physical column named `fts` on `recipes`.
  - In `backend_guide/database/migrations/00003_indexes.sql` lines 2-4, we observe GIN indexes:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_recipes_cube_tags ON public.recipes USING GIN (cube_tags);
    CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN (dietary_tags);
    CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));
    ```
- **RLS Policies**:
  - In `backend_guide/database/migrations/00004_rls_policies.sql` lines 17-39, we observe `SELECT` RLS policies for `recipes`, `recipe_ingredients`, and `recipe_steps`. However, there are **no** `INSERT`, `UPDATE`, or `DELETE` policies defined for any of these tables.
- **FastAPI Routing Pattern**:
  - In `backend_guide/app/api/v1/user_profiles.py` lines 73-77, route-level authorization checking matches ownership `id != current_user.id` and uses `user_client` (token-authenticated PostgREST client).

---

## 2. Logic Chain
1. **Public Access via Optional Bearer Token**:
   - Since `/recipes` GET must allow public access but filters based on publication status/user role, we cannot enforce `auto_error=True` on FastAPI's `HTTPBearer` (Observation 1.1).
   - Thus, a custom dependency returning `Optional[str]` token and a client dependency returning an anonymous or user-authenticated Supabase client is required (Logic Step 1).
2. **Array Tag Filtering**:
   - The Postgres GIN indexes (Observation 1.2) are built on `cube_tags` and `dietary_tags` columns.
   - To leverage these indexes at `O(log N)` complexity, queries must compile to the database-level containment (`@>`) and overlaps (`&&`) operators.
   - Therefore, the FastAPI backend should chain `.contains("cube_tags", ...)` and `.overlaps("dietary_tags", ...)` using the python-supabase client (Logic Step 2).
3. **Full Text Search Index Execution**:
   - The GIN index `idx_recipes_fulltext` uses the dynamic expression `to_tsvector(...)` (Observation 1.2).
   - Since PostgREST/Supabase client requires a physical column to execute `.text_search("column", "term")` (Observation 1.1), the current schema lacks a direct column mapping.
   - To delegate FTS to the database GIN index, we must either add a stored generated column `fts tsvector` or query via a database RPC function (Logic Step 3). Standard `ILIKE` emulation fails to use the GIN index, causing sequential scans.
4. **N+1 Optimization via Resource Embedding**:
   - PostgREST supports declarative joins via the `select()` parameter.
   - Since steps and ingredients are related to recipes via foreign keys (Observation 1.2), they can be fetched concurrently.
   - Therefore, chaining `.select("*, recipe_steps(*), recipe_ingredients(*)")` collapses the queries into a single database trip, preventing the N+1 problem (Logic Step 4).
5. **Write RLS Gap Resolution**:
   - Because no write policies exist on `recipes`, `recipe_ingredients`, or `recipe_steps` (Observation 1.3), standard POST/PUT/PATCH/DELETE calls using `user_client` will fail.
   - To resolve this while preserving security principles, we can either update the DB schema with write policies for `cms_editor` (Strategy A) or perform route-level guards in FastAPI and execute writes using the service-role client (Strategy B) (Logic Step 5).

---

## 3. Caveats
- We did not implement or test the actual endpoints as the request was strictly read-only analysis.
- Test suite failures on the host machine were identified as missing environment variables (`SUPABASE_JWT_SECRET` and `SHOPIFY_WEBHOOK_SECRET`), which is normal when running tests locally without an exported environment.

---

## 4. Conclusion
We successfully designed the API routing, filtering, embedding, and security structure for recipes, ingredients, and steps CRUD. The recommended strategy is documented in detail in `/home/freya/supersauced/.agents/explorer_m3_fresh_2/analysis.md`. The design leverages database-delegated performance (GIN tags/FTS filtering and PostgREST resource embedding) and suggests adding write policies to PostgreSQL to close the write-RLS gap.

---

## 5. Verification Method
- **File Verification**:
  - Inspect `/home/freya/supersauced/.agents/explorer_m3_fresh_2/analysis.md` for complete coverage of:
    - Route paths and HTTP methods.
    - Pydantic schemas (`RecipeCreate`, `RecipeUpdate`, `DetailedRecipeResponse`, etc.).
    - Array filtering operators (`cs`/`ov` in PostgREST).
    - FTS generated column / RPC strategies.
    - Resource embedding queries and sorting.
    - Write RLS gap resolution strategies.
- **Test Command**:
  - Once implemented, verification of routing and authorization can be verified using `pytest` from the `backend_guide` directory:
    ```bash
    pytest -v tests/test_recipes.py
    ```
