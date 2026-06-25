# Handoff Report: Auth & Onboarding Flow Strategy (Milestone 4)

## 1. Observation
1. **File corruption in `docs/schema.sql`**:
   - At lines 56-57, there are terminal artifact escape codes:
     ```sql
     56: -- 5_user_profiles_fulltext ON public.user_profil [18D [K
     57: public.user_profiles USING gin (to_tsvector('english', username || ' ' || e [1D [K
     ```
   - This prevents the schema file from executing, causing a syntax error:
     ```
     Loading database schema (docs/schema.sql)...
     ERROR:  syntax error at or near "public"
     LINE 1: public.user_profiles USING gin (to_tsvector('english', usern...
     ```
2. **Table Schema Mismatch**:
   - `docs/schema.sql` creates table `public.user_profiles` (lines 8-16) without `onboarding_survey` or `sauce_log` columns.
   - However, the validation script `docs/validate.sql` (and `docs/test_schema.sql`) contains tests checking these columns:
     ```sql
     49:     '{"onboarding_survey": {"dietary_preferences": ["vegan"]}, "sauce_log": {"sku_1": 3}}'::jsonb
     ...
     53:   IF v_profile.onboarding_survey IS NULL OR v_profile.onboarding_survey = 'null'::jsonb OR v_profile.onboarding_survey -> 'dietary_preferences' ->> 0 != 'vegan' THEN
     ...
     56:   IF v_profile.sauce_log IS NULL OR v_profile.sauce_log = 'null'::jsonb OR v_profile.sauce_log ->> 'sku_1' != '3' THEN
     ```
3. **Trigger Function Limitations**:
   - The trigger function `handle_new_user()` in `docs/schema.sql` (lines 139-146) only populates `id, username, email` from `NEW.email`. It does not parse or map `raw_user_meta_data` JSONB keys to `onboarding_survey` or `sauce_log`.
   - The trigger function does not contain `SECURITY DEFINER` with a safe `search_path`, posing security vulnerabilities for privilege escalation and search path hijacking.

---

## 2. Logic Chain
1. **Verification Failure**: Executing `./docs/verify_schema.sh` fails at `docs/schema.sql` due to the syntax error at line 56-57 (Observation 1).
2. **Validation Failure**: Even if the syntax error is bypassed, `docs/validate.sql` attempts to perform inserts and select fields on `onboarding_survey` and `sauce_log` in `public.user_profiles` (Observation 2). Because these columns are not defined in `docs/schema.sql` (Observation 2), the SQL compilation/execution will crash with "column does not exist" errors.
3. **Trigger Insufficiency**: When new users are created in `auth.users`, metadata inside `raw_user_meta_data` is not copied over by `handle_new_user()` in `schema.sql` (Observation 3). To pass the validation tests in `validate.sql` (Test 2 Scenario A-D), the trigger must extract, validate, and safely fall back JSONB keys.
4. **Security Vulnerability**: Trigger functions invoked by the `auth` schema must bypass RLS via `SECURITY DEFINER` (Observation 3) but must isolate execution via `SET search_path = public, pg_temp` to prevent search path hijacking attacks.

---

## 3. Caveats
- Since this is a read-only investigation, the source files in `docs/` (`schema.sql` and `auth_integration.md`) were not modified.
- No testing of real Shopify Admin API endpoints was executed due to the CODE_ONLY network restriction constraint. The proposed Shopify integration code assumes standard Shopify API payloads and signatures.

---

## 4. Conclusion
1. **Schema Fix Required**: `docs/schema.sql` must be modified to clean up terminal artifacts, add `onboarding_survey JSONB DEFAULT '{}'::jsonb` and `sauce_log JSONB DEFAULT '{}'::jsonb` columns to the `public.user_profiles` table, and implement a robust `handle_new_user()` function.
2. **Strategy Action Items**:
   - Implement native OAuth for Apple/Google Sign-In on the iOS app to avoid web redirections.
   - Utilize native iOS Keychain services (`SecItemAdd` / `SecItemCopyMatching`) rather than insecure `UserDefaults` to store session JWTs.
   - Deploy a secure trigger function with `SECURITY DEFINER` and `SET search_path = public, pg_temp` to synchronize user metadata.
   - Use Shopify Webhooks (`orders/paid`) to sync purchase inventory into `user_profiles.sauce_log` using the "Display Shelf" model, and use Shopify price rule APIs for in-app loyalty coupon rewards.

---

## 5. Verification Method
1. **Database Schema Verification**:
   - Apply the proposed schema fixes to `docs/schema.sql`.
   - Run the validation command:
     ```bash
     ./docs/verify_schema.sh
     ```
   - Verify the command exits with code `0` and outputs `SUCCESS: Database Schema Verification Passed`.
2. **Check analysis.md**:
   - Inspect `.agents/explorer_m4_auth_3_gen2/analysis.md` for complete implementation details and code snippets.
