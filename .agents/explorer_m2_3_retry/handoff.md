# Handoff Report — API Specification Recommendation & Schema Analysis

## 1. Observation

During my read-only investigation of the database schema files, mock scripts, and instructions, I observed the following:

### A. Severe Corruption & Syntax Errors in `docs/schema.sql`
- **Corruption at Line 56-58**: The file `/home/freya/supersauced/docs/schema.sql` contains terminal control characters and is malformed:
  ```sql
  56: -- 5_user_profiles_fulltext ON public.user_profil [18D [K
  57: public.user_profiles USING gin (to_tsvector('english', username || ' ' || e [1D [K
  58: email));
  ```
  This causes database creation to fail with: `ERROR:  syntax error at or near "public"`.
- **Mismatched Schema Layout**: The tables in `docs/schema.sql` do not align with the MVP requirements in `instructions.md` or the verification tests in `docs/test_schema.sql` and `docs/adversarial_tests.sql`:
  - `public.user_profiles` lacks the JSONB columns `onboarding_survey` and `sauce_log`.
  - `public.recipes` uses integer primary keys instead of `UUID`, lacks `slug` and `is_published` columns, uses `servings` instead of `servings_default`, and uses `cook_time` instead of `cook_time_minutes`.
  - `public.recipe_ingredients` uses integer foreign keys, `ingredient` instead of `name`, and `sort_order` instead of `position`.
  - `public.recipe_steps` uses integer foreign keys, `instruction` instead of `description`, `media_url` instead of `video_url`, and does not define a deferrable unique constraint on `(recipe_id, step_number)`.

### B. Clean Database Schema in `proposed_schema.sql`
- The file `/home/freya/supersauced/.agents/explorer_m1_3_gen3/proposed_schema.sql` compiles successfully and defines the clean database schema expected by `docs/test_schema.sql`, `docs/adversarial_tests.sql`, and `docs/challenger_stress_tests.sql`. This schema includes:
  - **`user_profiles`**: UUID ID, JSONB `onboarding_survey` and `sauce_log` defaulting to `'{}'::jsonb`.
  - **`recipes`**: UUID ID, TEXT `slug` (unique), BOOLEAN `is_published`, GIN indexes on `cube_tags` and `dietary_tags`.
  - **`recipe_ingredients`**: UUID ID/recipe_id, NUMERIC(10,1) `quantity`, INTEGER `position` (>= 0).
  - **`recipe_steps`**: UUID ID/recipe_id, INTEGER `step_number` (> 0), TEXT `description`, TEXT `video_url`, and a unique constraint defined as:
    ```sql
    CONSTRAINT unique_recipe_step UNIQUE (recipe_id, step_number) DEFERRABLE INITIALLY DEFERRED
    ```

### C. Test Expectations & Behaviors
- **Array Operators**: Multi-tag filtering requires testing for `overlaps` (`ov`), `contains` (`cs`), and `contained-by` (`cd`) array operators.
- **Numeric Handling**: `recipe_ingredients.quantity` uses `NUMERIC(10,1)`. In the database, inserting `1.25` rounds to `1.3` (verified in `test_schema.sql` Test 4). On the client, floating point precision drift during multiplication/scaling requires rounding via `.toFixed(1)`.
- **Deferred Uniqueness**: `recipe_steps` step-number swapping requires deferred unique checking so that temporary duplicates do not trigger violations until transaction commit.
- **Authentication**: JWT validation requires checking custom claims for role permissions (e.g., `role = 'cms_editor'` for draft preview access).

---

## 2. Logic Chain

1. **Schema Selection for API Spec**: Because `docs/schema.sql` contains syntax errors and outdated columns, the recommended API specification (`docs/api_spec.md`) must be structured around the correct, compiled, and verified database schema represented in `proposed_schema.sql` (which matches the functional test suites).
2. **Endpoint Mapping**:
   - **Recipes**: Array filtering in PostgREST is performed via specialized query operators: `ov` for overlaps (`&&`), `cs` for contains (`@>`), and `cd` for contained by (`<@`). In the Supabase JS/TS client, these map to `.overlaps()`, `.contains()`, and `.containedBy()`. Pagination maps to `limit` and `offset` query parameters in PostgREST, and `.range(from, to)` in the SDK.
   - **Ingredients**: Loading by recipe ID requires filtering via `recipe_id=eq.<uuid>`. Sorting requires `order=position.asc`. Because javascript numbers are floats, we must explicitly advise developers to format values using `.toFixed(1)` to prevent floating-point anomalies during ingredient quantity scaling.
   - **Steps**: Loading by recipe ID requires `recipe_id=eq.<uuid>` and sorting via `order=step_number.asc`. To support step sequence reordering, the deferred constraint is fully utilized. Because PostgREST does not support multi-statement transactions natively on tables, swapping step numbers should be recommended via a custom RPC (`POST /rest/v1/rpc/swap_recipe_steps`) or bulk updates.
   - **Profiles**: RLS restricts profiles to the authenticated owner (`auth.uid() = id`). Querying the own profile is done via `GET /rest/v1/user_profiles` with `Accept: application/vnd.pgrst.object+json` for a single object. Updating `onboarding_survey` and `sauce_log` is done via `PATCH` with standard JSON payloads. Since `PATCH` replaces the entire JSONB column, the spec must recommend client-side merging or an RPC function for partial updates.
3. **Security Details**: Every endpoint must detail headers (`Authorization`, `apikey`, `Prefer`, `Accept`) and the corresponding RLS rules (public read for published recipes, owner-only read/write for profiles, and custom JWT claim checks for `cms_editor`).

---

## 3. Caveats

- **Database Synchronization**: This API spec assumes that the correct database schema (`proposed_schema.sql`) will be successfully copied over to `/home/freya/supersauced/docs/schema.sql` by a worker agent. If the old, corrupted `docs/schema.sql` is retained, the API endpoints will mismatch (e.g. columns like `slug`, `onboarding_survey`, and `sauce_log` will not exist, and ID types will fail UUID parsing).
- **JWT Custom Claim Sync**: The `cms_editor` preview role assumes that the authentication provider (Supabase Auth) is configured to include the `role: "cms_editor"` metadata inside the user's JWT claims (`request.jwt.claims`).

---

## 4. Conclusion & Recommendations

I recommend the following detailed structure and content for `/home/freya/supersauced/docs/api_spec.md`. This specification is complete, accurate, matches the functional validation suites, and supports the "Speed to Meal" MVP requirements.

### Suggested Structure for `docs/api_spec.md`:
1. **Global Configurations & Headers**: Detailing authentication (Bearer tokens), API keys, and PostgREST-specific headers.
2. **Recipes Endpoints**:
   - `GET /rest/v1/recipes` (Read-only list, pagination, and multi-tag GIN-indexed array filtering).
   - SDK & cURL examples for contains, overlaps, and contained-by.
3. **Recipe Ingredients Endpoints**:
   - `GET /rest/v1/recipe_ingredients` (Loading by recipe ID, sorting by `position`).
   - Warning and formatting guidance for `NUMERIC(10,1)` quantity scaling.
4. **Recipe Steps Endpoints**:
   - `GET /rest/v1/recipe_steps` (Loading by recipe ID, sorting by `step_number`).
   - Guidance on step sequence swapping utilizing the `DEFERRABLE` unique constraint.
5. **User Profiles Endpoints**:
   - `GET /rest/v1/user_profiles` (Fetch own profile).
   - `PATCH /rest/v1/user_profiles` (Update JSONB onboarding preferences and sauce log inventory).
6. **Authentication & RLS Summary Table**: Clear reference for RLS policies, custom claims, and auth requirements.

Below are the exact technical specifications and code templates to write into `docs/api_spec.md`:

---

### Endpoints Specification Draft

#### 1. Global Configurations & Headers
All requests to the Supabase PostgREST API must include:
- `apikey`: `<anon_public_key>` (client app) or `<service_role_key>` (system operations).
- `Authorization`: `Bearer <user_jwt_token>` (for authenticated operations; optional for reading published content).
- `Content-Type`: `application/json` (for write operations).

---

#### 2. Recipes Endpoint (`public.recipes`)
- **HTTP Method**: `GET`
- **Path**: `/rest/v1/recipes`
- **Query Parameters**:
  - `select`: Column selection (e.g., `select=*`).
  - `limit`: Number of rows to return (e.g., `limit=10`).
  - `offset`: Number of rows to skip (e.g., `offset=20`).
  - `cube_tags` / `dietary_tags` operators:
    - **Overlaps (`ov`)**: Intersect tags (at least one tag matches).
    - **Contains (`cs`)**: Subset check (all tags in filter must exist in recipe).
    - **Contained by (`cd`)**: Superset check (recipe tags must be a subset of filter).
- **RLS Rules**:
  - `public_read_published_recipes`: Anyone (even anonymous) can view recipes where `is_published = true`.
  - Preview policy: Authenticated users with the `cms_editor` role claim (`auth.jwt() ->> 'role' = 'cms_editor'`) can view both published and draft (`is_published = false`) recipes.

##### PostgREST cURL Examples:
- **Pagination & Published Filter**:
  ```bash
  curl -X GET "https://<project-ref>.supabase.co/rest/v1/recipes?select=id,title,cube_tags,dietary_tags&is_published=eq.true&limit=10&offset=0" \
    -H "apikey: <anon_key>"
  ```
- **Multi-tag Overlaps Filtering**:
  ```bash
  curl -X GET "https://<project-ref>.supabase.co/rest/v1/recipes?cube_tags=ov.%7Bspicy,garlic%7D&dietary_tags=cs.%7Bvegan,gluten-free%7D" \
    -H "apikey: <anon_key>"
  ```

##### Supabase JS/TS SDK Examples:
- **Pagination & Multi-tag Filtering**:
  ```typescript
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, cube_tags, dietary_tags')
    .eq('is_published', true)
    .overlaps('cube_tags', ['spicy', 'garlic']) // && operator
    .contains('dietary_tags', ['vegan', 'gluten-free']) // @> operator
    .range(0, 9); // limit 10, offset 0 (0-based inclusive range)
  ```

---

#### 3. Recipe Ingredients Endpoint (`public.recipe_ingredients`)
- **HTTP Method**: `GET`
- **Path**: `/rest/v1/recipe_ingredients`
- **Query Parameters**:
  - `recipe_id`: Filter by recipe UUID (e.g., `recipe_id=eq.<recipe_uuid>`).
  - `order`: Sort by position field (e.g., `order=position.asc`).
- **RLS Rules**: Only viewable if the parent recipe `is_published = true` OR if the user is a `cms_editor`.
- **NUMERIC(10,1) Type Warning**: Quantities are stored as exact decimals (e.g., `1.25` is rounded to `1.3` on insert). When retrieving quantities, the client receives JSON numbers. When scaling ingredients (e.g., multiplying by serving size adjustments), standard JavaScript float math can introduce binary floating-point representation drift (e.g., `0.3 * 3 = 0.8999999999999999`).
- **Client Mitigation**: Scale the quantity and format using `.toFixed(1)` to match the database precision:
  ```typescript
  const scaledQuantity = parseFloat((ingredient.quantity * scalingFactor).toFixed(1));
  ```

##### PostgREST cURL Example:
```bash
curl -X GET "https://<project-ref>.supabase.co/rest/v1/recipe_ingredients?recipe_id=eq.b9c2a382-7634-4b5f-864a-25b871c89ef1&order=position.asc" \
  -H "apikey: <anon_key>"
```

##### Supabase JS/TS SDK Example:
```typescript
const { data, error } = await supabase
  .from('recipe_ingredients')
  .select('id, name, quantity, unit, position')
  .eq('recipe_id', 'b9c2a382-7634-4b5f-864a-25b871c89ef1')
  .order('position', { ascending: true });
```

---

#### 4. Recipe Steps Endpoint (`public.recipe_steps`)
- **HTTP Method**: `GET`
- **Path**: `/rest/v1/recipe_steps`
- **Query Parameters**:
  - `recipe_id`: Filter by recipe UUID (e.g., `recipe_id=eq.<recipe_uuid>`).
  - `order`: Sort by step number (e.g., `order=step_number.asc`).
- **RLS Rules**: Only viewable if the parent recipe `is_published = true` OR if the user is a `cms_editor`.
- **Sequence Swapping (Deferrable Constraint)**: The unique constraint `unique_recipe_step` on `(recipe_id, step_number)` is deferred. Swapping steps requires modifying step numbers within a transaction to prevent constraint violations mid-flight. Standard table PATCH requests are not transactional. The recommended API design is to call a custom PostgreSQL RPC function:
  ```sql
  CREATE OR REPLACE FUNCTION public.swap_recipe_steps(p_recipe_id UUID, p_step_1 INT, p_step_2 INT)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    -- Swapping step numbers triggers deferred checking; unique constraints checked at COMMIT
    UPDATE public.recipe_steps SET step_number = -1 WHERE recipe_id = p_recipe_id AND step_number = p_step_1;
    UPDATE public.recipe_steps SET step_number = p_step_1 WHERE recipe_id = p_recipe_id AND step_number = p_step_2;
    UPDATE public.recipe_steps SET step_number = p_step_2 WHERE recipe_id = p_recipe_id AND step_number = -1;
  END;
  $$;
  ```

##### PostgREST cURL Example (Query Steps):
```bash
curl -X GET "https://<project-ref>.supabase.co/rest/v1/recipe_steps?recipe_id=eq.b9c2a382-7634-4b5f-864a-25b871c89ef1&order=step_number.asc" \
  -H "apikey: <anon_key>"
```

##### PostgREST cURL Example (Invoke Swap RPC):
```bash
curl -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/swap_recipe_steps" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"p_recipe_id": "b9c2a382-7634-4b5f-864a-25b871c89ef1", "p_step_1": 1, "p_step_2": 2}'
```

##### Supabase JS/TS SDK Example:
```typescript
// Query Steps
const { data: steps, error: stepsError } = await supabase
  .from('recipe_steps')
  .select('step_number, description, video_url, timer_seconds, tip')
  .eq('recipe_id', 'b9c2a382-7634-4b5f-864a-25b871c89ef1')
  .order('step_number', { ascending: true });

// Swap Steps (RPC call)
const { error: swapError } = await supabase.rpc('swap_recipe_steps', {
  p_recipe_id: 'b9c2a382-7634-4b5f-864a-25b871c89ef1',
  p_step_1: 1,
  p_step_2: 2
});
```

---

#### 5. User Profiles Endpoint (`public.user_profiles`)
- **HTTP Methods**:
  - `GET /rest/v1/user_profiles` (Query own profile).
  - `PATCH /rest/v1/user_profiles` (Update profile fields).
- **Headers**:
  - `Authorization: Bearer <user_jwt_token>` (required).
  - `Accept: application/vnd.pgrst.object+json` (required for GET to fetch a single object instead of an array).
  - `Prefer: return=representation` (on PATCH to return the updated record).
- **RLS Rules**:
  - Owner-only policy (`auth.uid() = id`) applies to all actions. Users can only select, insert, update, or delete their own row matching their UUID.
- **JSONB Column Updates Constraint**: Modifying `onboarding_survey` or `sauce_log` using standard `PATCH` replaces the entire column value. For partial nested updates (e.g. updating a single key inside `onboarding_survey` or updating SKU inventory in `sauce_log` without wiping other data):
  - **Option 1**: Fetch the existing profile, merge the JSON object in memory, and send the merged object back in a `PATCH` payload. (Recommended for client-side ease).
  - **Option 2**: Call an RPC function that executes Postgres JSONB merge operators (`||` or `jsonb_set`) to perform atomic partial updates on the server.

##### PostgREST cURL Example (Query Own Profile):
```bash
curl -X GET "https://<project-ref>.supabase.co/rest/v1/user_profiles" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: application/vnd.pgrst.object+json"
```

##### PostgREST cURL Example (Update Onboarding Survey Preferences):
```bash
curl -X PATCH "https://<project-ref>.supabase.co/rest/v1/user_profiles" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"onboarding_survey": {"dietary_preferences": ["vegan"], "experience_level": 3}}'
```

##### PostgREST cURL Example (Update Sauce Log Inventory):
```bash
curl -X PATCH "https://<project-ref>.supabase.co/rest/v1/user_profiles" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"sauce_log": {"logs": [{"sku": "sauce-001", "qty": 5, "timestamp": "2026-06-24T04:14:00Z"}]}}'
```

##### Supabase JS/TS SDK Example:
```typescript
// Query Profile (expecting single object)
const { data: profile, error: getError } = await supabase
  .from('user_profiles')
  .select('id, onboarding_survey, sauce_log')
  .single();

// Client-side merge and update Onboarding Survey
const updatedSurvey = {
  ...profile.onboarding_survey,
  dietary_preferences: ['vegan', 'gluten-free']
};

const { data: updatedProfile, error: updateError } = await supabase
  .from('user_profiles')
  .update({ onboarding_survey: updatedSurvey })
  .eq('id', profile.id)
  .select()
  .single();
```

---

## 5. Verification Method

To verify the findings and the proposed API structure:
1. **Schema Check**:
   - Inspect `/home/freya/supersauced/.agents/explorer_m1_3_gen3/proposed_schema.sql` to verify table definitions, columns (`onboarding_survey`, `sauce_log`, `slug`, `position`), GIN indexes, RLS policies, and triggers.
   - Run the schema verifier script to ensure the clean schema and its tests pass completely:
     ```bash
     # Note: Run this from the project root. This spins up a postgres instance and executes the tests.
     ./docs/verify_schema.sh
     ```
     Ensure that the script finishes with `SUCCESS: Database Schema Verification Passed`.
2. **API Specification Verification**:
   - Review `/home/freya/supersauced/docs/api_spec.md` and check that its layout and contents are successfully updated to incorporate the recommendations.
   - Run a search for outdated terms (like `bio`, integer IDs for recipes/ingredients, `ingredient` columns, etc.) in the new `api_spec.md` to ensure they are replaced by the correct database schema columns.
