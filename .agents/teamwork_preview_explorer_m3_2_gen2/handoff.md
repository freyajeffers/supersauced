# Handoff Report — RBAC Setup & Permission Rules

## 1. Observation
- **Instructions Document (`instructions.md`)**: Contains stack specification (Directus Headless CMS connected to Supabase DB) and the schema definition for the curated recipe library (lines 114–179) including `is_published` default false.
- **Outdated & Corrupted Schema File (`docs/schema.sql`)**: Contains a mismatch with `instructions.md` (uses `id serial` and `user_id` on recipes instead of `id UUID` and `is_published`). More critically, the file is corrupted with ANSI escape control characters (terminal clear/backspaces) on multiple lines, e.g.:
  - Lines 56–58:
    ```sql
    -- 5_user_profiles_fulltext ON public.user_profil [18D [K
    public.user_profiles USING gin (to_tsvector('english', username || ' ' || e [1D [K
    email));
    ```
  - Lines 117–118, 125–126, 135–136, 174–177.
- **Validation and Test Suites (`docs/test_schema.sql` & `docs/validate.sql`)**: Assert RLS policies for `anon`, `authenticated`, and a custom role/claim `cms_editor` (using `auth.jwt() ->> 'role' = 'cms_editor'` in lines 291-315) to verify draft vs published recipe visibility.
- **Milestone Scope (`sub_orch_m3_cms_workflow/SCOPE.md`)**: Specifies Directus roles (Admin, Content Creator, Editor) and CRUD permissions based on lifecycle status (draft vs published).
- **PRD Document (`explorer_m1_1/PRD_Mobile Recipe App_B2C.txt`)**: Defines Flow 6 (lines 167-177) where going into edit mode unpublishes recipes (`is_published` becomes false).
- **Technical Recommendation (`explorer_m1_1/Technical Recommendation Document.txt`)**: Explains the danger of non-technical content managers accidentally modifying database schemas from Directus (line 198) and the necessity to lock down their permissions.

## 2. Logic Chain
- **Step 1 (CMS Security)**: Directus connects directly to the production Supabase database. To prevent non-technical staff from accidentally changing column types or constraints (which would crash the React Native app), they must be assigned restricted CMS roles (Editor, Creator) that do not have permissions to modify collection settings, fields, or system configurations.
- **Step 2 (Draft vs Published Lifecycle)**: In-progress recipe edits should not be visible to public users. Therefore, we use the `is_published BOOLEAN` flag. In Directus, Content Creators can only write/edit draft recipes they own, whereas Content Editors can promote drafts to published by setting `is_published = true`.
- **Step 3 (Client Staging & QA)**: The QA team needs to preview drafts within the staging build of the mobile app. Standard clients use `anon` or standard `authenticated` JWTs, which are restricted via Supabase RLS to `is_published = true`. To allow draft previews, we define a custom JWT claim `role = 'cms_editor'`.
- **Step 4 (Database RLS policies)**: We define SELECT policies on `recipes`, `recipe_ingredients`, and `recipe_steps` that evaluate: `USING (is_published = true OR auth.jwt() ->> 'role' = 'cms_editor')`.
- **Step 5 (Write Isolation)**: To ensure data integrity, client-side writes (INSERT, UPDATE, DELETE) are blocked by default in database RLS. All content curation must go through the Directus dashboard. Directus connects using a high-privileged database role (like `postgres` or `service_role`) that bypasses RLS, so it does not need database-level write policies.

## 3. Caveats
- Directus CMS is assumed to connect using `service_role` or another DB user with the `BYPASSRLS` attribute. If it connects with an RLS-bound role, explicit SQL write policies for `cms_editor` would be required in `schema.sql`.
- We assume that Directus correctly injects `$CURRENT_USER` context for creator record validation, and that the staging app has a mechanism to acquire a JWT containing the `role = 'cms_editor'` custom claim.
- The existing `/home/freya/supersauced/docs/schema.sql` contains syntax corruption and must be repaired before running validation tests.

## 4. Conclusion
We have completed the RBAC analysis and formulated the required permissions at both the Directus CMS and Supabase database levels. 
The detailed RBAC matrix and proposed section content for `content_workflow.md` have been generated and saved to:
`/home/freya/supersauced/.agents/teamwork_preview_explorer_m3_2_gen2/proposed_content_workflow_rbac.md`

## 5. Verification Method
1. Inspect the proposed markdown file at:
   `/home/freya/supersauced/.agents/teamwork_preview_explorer_m3_2_gen2/proposed_content_workflow_rbac.md`
   Verify that it contains the RBAC matrix and detailed rules.
2. The database RLS policies defined in the proposed file can be verified by running the test suite (`verify_schema.sh`) *after* repairing the corrupted `docs/schema.sql` file.
   - Specifically, ensure `test_schema.sql` tests `cms_editor` draft reads (which passes under the proposed policies).
