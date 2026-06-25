# Handoff Report — Explorer 1 (Milestone 4)

This report summarizes the findings of Explorer 1 regarding the auth and onboarding flow documentation strategy for `/home/freya/supersauced/docs/auth_integration.md`.

---

## 1. Observation
* **Observed Files & Locations**:
  * `/home/freya/supersauced/docs/schema.sql` (Lines 7–16, 139–151):
    ```sql
    CREATE TABLE IF NOT EXISTS public.user_profiles (
        id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
        username text UNIQUE NOT NULL CHECK (username <> ''),
        email text UNIQUE NOT NULL CHECK (email <> ''),
        full_name text,
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ```
    And trigger handler:
    ```sql
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO public.user_profiles (id, username, email)
        VALUES (NEW.id, NEW.email, NEW.email);
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    ```
  * `/home/freya/supersauced/instructions.md` (Lines 124–132):
    ```sql
    CREATE TABLE public.user_profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        dietary_preferences TEXT[] DEFAULT '{}',
        discovery_channel TEXT,
        sauce_log JSONB DEFAULT '{}', -- Tracks cube inventory per SKU
        ...
    );
    ```
    And Architectural Guidelines (Line 20):
    > "Separation of Concerns: Follow the 'Display Shelf' model. Shopify remains the source of truth for commerce and raw recipe content; Supabase acts as the 'Display Shelf' for app-specific states (Sauce Log, saved recipes, dietary profiles)."

---

## 2. Logic Chain
1. **Observation of Schema Discrepancy**: Comparing `schema.sql` and `instructions.md` reveals that the `public.user_profiles` table definition in the codebase's official schema (`schema.sql`) lacks the `dietary_preferences`, `discovery_channel`, and `sauce_log` columns present in the conceptual architecture (`instructions.md`).
2. **Impact on Onboarding & Trigger**: Because these columns are missing in `schema.sql`, the current `handle_new_user()` trigger function only inserts basic identification fields (`id`, `username`, `email`) and does not capture onboarding metadata (dietary preferences, discovery channel, or initial sauce logs) passed in `NEW.raw_user_meta_data`.
3. **Security Vulnerability**: The `handle_new_user()` function in `schema.sql` does not specify `SECURITY DEFINER` and does not set a search path (`search_path`). By PostgreSQL security standards, a trigger executing under the default caller permissions might fail for restricted RLS tables or be vulnerable to search path hijacking.
4. **Conclusion on Necessary Content**: Therefore, the documentation in `/home/freya/supersauced/docs/auth_integration.md` must:
   * Recommend a schema migration to add the CRM and sauce log columns to `public.user_profiles`.
   * Propose a secure trigger function with `SECURITY DEFINER` and `SET search_path = pg_catalog, public` that parses the JSONB metadata.
   * Provide the technical specifications for native iOS integration (Universal Links, Apple/Google token sign-in, secure Keychain storage APIs like `SecItemAdd`, lifecycle timers) and event-driven Shopify Display Shelf syncing.

---

## 3. Caveats
* **Assumed Device Capabilities**: Assumed native Apple and Google SDKs are set up in Xcode. Detailed integration instructions for third-party libraries (e.g. `@supabase/supabase-js` vs Swift package) are omitted in favor of standard Swift APIs.
* **Shopify API Permissions**: Assumed the Shopify store has an active developer app with GraphQL mutation and webhook scopes configured.

---

## 4. Conclusion
We have compiled complete structural and content recommendations in `/home/freya/supersauced/.agents/explorer_m4_auth_1_gen2/analysis.md`. The target documentation file `/home/freya/supersauced/docs/auth_integration.md` should be overhauled by the implementer using the structure and concrete Swift/SQL/JSON templates detailed in the analysis.

---

## 5. Verification Method
1. **Locate Analysis Output**: Inspect `/home/freya/supersauced/.agents/explorer_m4_auth_1_gen2/analysis.md` to confirm the presence of code blocks for iOS Keychain helper, the secure Postgres trigger, and the Shopify sync payload models.
2. **Execute Test Migration & Trigger Verification**:
   We can verify the correctness of the SQL triggers and metadata mapping by running mock commands in a local database context or Supabase dashboard:
   - Run the migration to add `dietary_preferences`, `discovery_channel`, and `sauce_log`.
   - Create the trigger with `SECURITY DEFINER`.
   - Insert a mock user into `auth.users` with nested JSON metadata and assert the profile columns are correctly mapped.
