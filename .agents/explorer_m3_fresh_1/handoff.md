# Handoff Report: Recipes, Ingredients, and Steps CRUD Endpoints Design Analysis

## 1. Observation
* **API Endpoints**: `docs/api_spec.yaml` lines 104-395 defines the paths, query parameters, request bodies, and responses for `/recipes`, `/recipes/{id}`, `/recipe_ingredients`, `/recipe_ingredients/{id}`, `/recipe_steps`, and `/recipe_steps/{id}`.
* **Full Text Search**:
  * Client-side queries in `docs/api_spec.md` line 182 and `docs/data_fetching.md` line 77 execute full text search via `.textSearch('fts', searchTerm)`.
  * `backend_guide/database/migrations/00003_indexes.sql` line 4 indexes the tsvector expression:
    `CREATE INDEX IF NOT EXISTS idx_recipes_fulltext ON public.recipes USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));`
  * `backend_guide/database/migrations/00002_core_schema.sql` lines 15-33 defines the `recipes` table, but it has no column named `fts`.
* **Row-Level Security (RLS) policies**:
  * `backend_guide/database/migrations/00004_rls_policies.sql` lines 17-39 sets up `SELECT` policies for `recipes`, `recipe_ingredients`, and `recipe_steps`.
  * No policies are defined for `INSERT`, `UPDATE`, or `DELETE` on these three tables.
* **FastAPI Dependencies**: `backend_guide/app/api/deps.py` lines 61-69 defines `get_user_client(token)` (RLS-enforced user client) and `get_service_client()` (RLS-bypass client).

## 2. Logic Chain
* **FTS Mismatch**: Since the database schema does not define a physical `fts` column but client code queries it via `.textSearch('fts', ...)`, calling search on the table will throw an error (`column "fts" does not exist`). Adding a generated, stored column `fts tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || coalesce(description, ''))) STORED` and updating the GIN index satisfies client expectations and delegates search to PostgreSQL.
* **Tag Filtering**: `cube_tags` requires matching *all* tags (containment), while `dietary_tags` requires matching *any* tag (overlap). In Python, mapping these to the Supabase client `.contains("cube_tags", list)` (translating to `@>`) and `.overlaps("dietary_tags", list)` (translating to `&&`) delegates checks directly to the GIN indexes (`idx_recipes_cube_tags` and `idx_recipes_dietary_tags`), achieving O(log N) search. Emulating this in Python requires pulling all rows and doing linear search, which has O(N) complexity and does not scale.
* **Resource Embedding**: Naive retrieval of a recipe's nested ingredients and steps takes 3 separate database calls (N+1 query problem). PostgREST allows embedding nested children in a single round-trip using `.select("*, recipe_ingredients(*), recipe_steps(*)")`.
* **Nested Sorting**: Sorting the child objects (steps by `step_number` and ingredients by `position`) can be delegated to the database via `.order("step_number", foreign_table="recipe_steps")` or resolved programmatically in Python as a fallback if the SDK client does not support ordering nested tables.
* **RLS Write Blocking**: Enabling RLS without defining write policies blocks all writes (insert, update, delete) for standard users. If FastAPI delegates writes using the user-scoped client, CMS Editors will receive permission denied errors. To fix this, write policies must be added to PostgreSQL to allow access for users with role `cms_editor`. FastAPI-level role validation adds defense-in-depth by rejecting unauthorized actions before hitting the database.

## 3. Caveats
* **SDK Version Support**: Assumes the Supabase Python SDK version supports the `foreign_table` parameter for sorting nested tables. If it does not, programmatic fallback sorting in Python is required.
* **Security Paradigm Choice**: Assumes write operations should be securely delegated to database-level RLS policies. If the system relies on role verification at the FastAPI level and uses the `service_role` client to perform database writes, RLS write policies are bypassed. However, database-level validation is strongly recommended to protect against bugs and unauthorized writes.

## 4. Conclusion
We recommend:
1. Creating FastAPI routers for `/recipes`, `/recipe_ingredients`, and `/recipe_steps` with input validation schemas.
2. Correcting the database schema by adding a generated `fts` column and updating the GIN index for search.
3. Delegating array filtering and FTS directly to the database via Supabase SDK `.contains()`, `.overlaps()`, and `.text_search()`.
4. Using PostgREST resource embedding (`.select(...)`) for single-trip nested retrievals to optimize N+1 queries.
5. Resolving the security gap by creating write RLS policies for CMS Editors in the database, paired with FastAPI role validation.

## 5. Verification Method
* **Inspect Recommendations**: Review `/home/freya/supersauced/.agents/explorer_m3_fresh_1/analysis.md` to ensure it details the routing, schema design, filtering delegation, embedding optimization, and security policies without implementing source code.
* **Linting / DB Check**: Verify migration structures and schema integrity by running `/home/freya/supersauced/backend_guide/database/scripts/verify_schema.sh` or inspecting schema migration scripts inside `backend_guide/database/migrations/`.
