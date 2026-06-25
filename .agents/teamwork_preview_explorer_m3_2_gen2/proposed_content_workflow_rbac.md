## Configuring Role-Based Access Control (RBAC)

To safeguard database integrity and enforce the content publishing workflow, role-based access must be configured at two layers:
1. **CMS Layer (Directus)**: Governs which team members can create, edit, or publish recipes via the Directus dashboard.
2. **Database Layer (Supabase RLS)**: Governs what content mobile applications can fetch (preventing public users from reading drafts, while allowing preview clients to view draft recipes).

### CMS Roles & Field-Level Permissive Rules (Directus)

Directus CMS uses collection-level and relational filters to restrict edits. The three roles are defined below:

#### 1. Content Creator / Author
Designed for writers/creators who input recipe data. They cannot publish content or edit published content.
- **Recipes Collection (`recipes`)**:
  - **Create**: Allowed.
  - **Read**: Custom rule: `{ "_or": [ { "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } }, { "is_published": { "_eq": true } } ] }`
  - **Update**: Custom rule: `{ "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } }` (Field-level permissions: Block editing of the `is_published` field).
  - **Delete**: Custom rule: `{ "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } }`
- **Recipe Ingredients (`recipe_ingredients`) & Steps (`recipe_steps`)**:
  - **Create**: Custom validation: `{ "recipe_id": { "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } } }`
  - **Read**: Custom rule: `{ "recipe_id": { "_or": [ { "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } }, { "is_published": { "_eq": true } } ] } }`
  - **Update/Delete**: Custom rule: `{ "recipe_id": { "is_published": { "_eq": false }, "user_created": { "_eq": "$CURRENT_USER" } } }`

#### 2. Content Editor / Publisher
Designed for reviewers who verify draft recipes and publish them.
- **Recipes, Ingredients, and Steps Collections**:
  - **Create / Read / Update / Delete**: Full Access on all records. Can modify status fields and set `is_published = true`.
- **System Collections**:
  - **Read**: Allowed.
  - **Create / Update / Delete**: Denied (prevents altering database structure, schemas, or roles).

#### 3. Administrator (System default)
- **All Collections**: Full access (CRUD and Schema definition). Only assigned to lead developers or system owners.

---

### Database Row-Level Security (RLS) Policies (Supabase)

To support this content flow, the PostgreSQL database enforces RLS policies. The client app uses two key roles:
1. `anon` and `authenticated` (with user role): Used by standard mobile apps.
2. `cms_editor` (custom JWT role claim): Used by staging/QA builds of the app.

#### Supabase RLS Policies for Recipes Content:

```sql
-- 1. Recipes Table Policies
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public SELECT on published recipes"
ON public.recipes FOR SELECT
TO anon, authenticated
USING (is_published = true);

CREATE POLICY "Allow editors to SELECT all recipes"
ON public.recipes FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' = 'cms_editor');

-- 2. Recipe Ingredients Table Policies
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public SELECT on published recipe ingredients"
ON public.recipe_ingredients FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recipes 
    WHERE public.recipes.id = public.recipe_ingredients.recipe_id 
    AND public.recipes.is_published = true
  )
);

CREATE POLICY "Allow editors to SELECT all recipe ingredients"
ON public.recipe_ingredients FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role' = 'cms_editor')
);

-- 3. Recipe Steps Table Policies
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public SELECT on published recipe steps"
ON public.recipe_steps FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recipes 
    WHERE public.recipes.id = public.recipe_steps.recipe_id 
    AND public.recipes.is_published = true
  )
);

CREATE POLICY "Allow editors to SELECT all recipe steps"
ON public.recipe_steps FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role' = 'cms_editor')
);
```

#### RLS Policies for CRM / User Profiles:
Standard app users must be able to view and manage their own profiles (Onboarding Survey & Sauce Log).

```sql
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to SELECT own profile"
ON public.user_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Allow users to INSERT own profile"
ON public.user_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow users to UPDATE own profile"
ON public.user_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```
