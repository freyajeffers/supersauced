# Milestone 4: Auth & Onboarding Flow - Exploration and Architecture Recommendations
**Explorer 2 Working Directory:** `/home/freya/supersauced/.agents/explorer_m4_auth_2_gen2`

---

## 1. Executive Summary & Findings
An analysis of the existing `/home/freya/supersauced/docs/schema.sql` and `/home/freya/supersauced/instructions.md` has revealed crucial gaps and technical debt that must be addressed in the updated `/home/freya/supersauced/docs/auth_integration.md`. 

### Key Findings:
1. **Schema Discrepancies**:
   - `docs/schema.sql` contains a basic `user_profiles` table with standard profile fields (`username`, `email`, `full_name`, `avatar_url`).
   - `instructions.md` defines a `user_profiles` table oriented around CRM and Shopify capabilities (`dietary_preferences`, `discovery_channel`, `sauce_log` JSONB column).
   - *Recommendation*: Merge these two schemas so that the iOS app has a unified user profile capable of supporting authentication metadata, onboarding preferences, and Shopify inventory sync.
2. **ANSI Terminal Corruption**:
   - The current `docs/auth_integration.md` and `docs/schema.sql` files contain corrupted lines containing terminal control characters (e.g., `[4D [K`, `[10D [K`). These must be sanitized and replaced with clean, production-ready documentation and code snippets.
3. **Security Vulnerabilities in Current Trigger**:
   - The default trigger function `sync_user_profile()` in `docs/auth_integration.md` is defined with implicit settings. Triggers executing on database events like `auth.users` insertion must use `SECURITY DEFINER` and have an explicitly cleared `search_path` (e.g., `SET search_path = ''`) to prevent search path hijacking and privilege escalation.
4. **Integration Gap for iOS & Shopify**:
   - The current documentation lacks detailed specs for native iOS SDK integration (such as identity token verification for Apple/Google), Keychain storage APIs, Universal Links configuration, and Shopify webhook payload mapping.

This analysis details the structure and content strategy for `auth_integration.md` to guide the implementation phase.

---

## 2. Recommended Structure for `auth_integration.md`
To ensure the documentation serves as an actionable, self-contained guide for both backend and iOS developers, we recommend structuring it into five core sections:

1. **Authentication Flows & Deep Linking**:
   - Detail Apple Sign-In, Google Sign-In, and Magic Link flows.
   - Define exact native iOS redirect behaviors, Associated Domains, and Universal Links configuration.
2. **iOS Token Storage & Lifecycle Management**:
   - Detail secure storage using Keychain Services API with concrete Swift methods.
   - Detail session state listeners and refresh failure handling (auto-refresh, polling, and force logout).
3. **Profile Creation Trigger Mechanics**:
   - Document the PostgreSQL trigger mapping `auth.users` metadata to `public.user_profiles`.
   - Provide a hardened SQL script enforcing `SECURITY DEFINER` and `search_path` isolation.
4. **Shopify Synchronization ("Display Shelf" Sync)**:
   - Provide architecture diagrams/descriptions for the "Display Shelf" data syncing model.
   - Outline Shopify webhook payload mappings to update the `sauce_log` JSONB column.
   - Detail dynamic discount code generation and inventory checks.
5. **Client Integration Quick-Start**:
   - Provide clean, verified Swift/TypeScript client setup code.

---

## 3. Detailed Content Strategy & Technical Recommendations

### Focus Area 1: OAuth & Passwordless Flows with iOS Deep Linking
For a native iOS mobile application, relying solely on web redirects for OAuth results in a poor user experience. The content strategy must document two distinct paths: **Native SDK Flow** (preferred) and **Web-OAuth Flow** (fallback).

#### 1. Apple Sign-In
* **Native Flow**:
  1. The app triggers the native `ASAuthorizationAppleIDProvider` request.
  2. Apple returns an Identity Token (`id_token`) and Authorization Code.
  3. The iOS app sends this token to Supabase using:
     ```swift
     let session = try await supabase.auth.signInWithIdToken(
         provider: .apple,
         idToken: appleIDToken,
         accessToken: appleAccessToken
     )
     ```
  4. Supabase validates the token against Apple's keys and returns a session.

#### 2. Google Sign-In
* **Native Flow**:
  1. The app integrates the native `GoogleSignIn` iOS SDK.
  2. The app obtains the user's ID token.
  3. The app authenticates with Supabase:
     ```swift
     let session = try await supabase.auth.signInWithIdToken(
         provider: .google,
         idToken: googleIDToken
     )
     ```

#### 3. Email Magic Links (Passwordless OTP)
* **Flow**:
  1. User inputs their email in the iOS app.
  2. The app calls:
     ```swift
     try await supabase.auth.signInWithOTP(
         email: email,
         redirectTo: URL(string: "https://supersauced.app/auth-callback")
     )
     ```
  3. Supabase sends the email with a magic link containing a token hash.
  4. When clicked on iOS, the link intercepts the app via a **Universal Link**.

#### 4. Deep Linking & Redirect URI Configuration
* **iOS Project Configuration**:
  - Enable **Associated Domains** in Xcode and add: `applinks:supersauced.app`
  - Implement a web server hosting `https://supersauced.app/.well-known/apple-app-site-association`:
    ```json
    {
      "applinks": {
        "apps": [],
        "details": [
          {
            "appID": "TEAMID.com.supersauced.app",
            "paths": [ "/auth-callback", "/join" ]
          }
        ]
      }
    }
    ```
* **Supabase Dashboard Configuration**:
  - Go to `Authentication` -> `URL Configuration`.
  - Add `https://supersauced.app/auth-callback` to **Redirect URLs**.
* **iOS URL Handler (SwiftUI)**:
  ```swift
  .onOpenURL { url in
      Task {
          do {
              _ = try await supabase.auth.handle(url)
              // User is now logged in; transition state
          } catch {
              print("Deep link auth failure: \(error)")
          }
      }
  }
  ```

---

### Focus Area 2: iOS Secure Keychain Token Storage & Lifecycle Management
To comply with iOS security best practices, access tokens and refresh tokens must not be stored in `UserDefaults` or general plist files. The document must define a robust Keychain wrapper strategy.

#### 1. Keychain API Wrapper Strategy
Tokens are stored under a secure identifier with access control restricted to `kSecAttrAccessibleAfterFirstUnlock`.

* **Keychain Write Operations (SecItemAdd/SecItemUpdate)**:
  ```swift
  func saveToken(_ token: String, account: String) throws {
      let data = token.data(using: .utf8)!
      let query: [String: Any] = [
          kSecClass as String: kSecClassGenericPassword,
          kSecAttrService as String: "com.supersauced.auth",
          kSecAttrAccount as String: account,
          kSecValueData as String: data,
          kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
      ]
      
      let status = SecItemAdd(query as CFDictionary, nil)
      if status == errSecDuplicateItem {
          let updateQuery: [String: Any] = [
              kSecClass as String: kSecClassGenericPassword,
              kSecAttrService as String: "com.supersauced.auth",
              kSecAttrAccount as String: account
          ]
          let attributesToUpdate = [kSecValueData as String: data]
          let updateStatus = SecItemUpdate(updateQuery as CFDictionary, attributesToUpdate as CFDictionary)
          guard updateStatus == errSecSuccess else { throw KeychainError.unknown(updateStatus) }
      } else if status != errSecSuccess {
          throw KeychainError.unknown(status)
      }
  }
  ```

* **Keychain Read Operations (SecItemCopyMatching)**:
  ```swift
  func retrieveToken(account: String) throws -> String? {
      let query: [String: Any] = [
          kSecClass as String: kSecClassGenericPassword,
          kSecAttrService as String: "com.supersauced.auth",
          kSecAttrAccount as String: account,
          kSecReturnData as String: true,
          kSecMatchLimit as String: kSecMatchLimitOne
      ]
      
      var dataTypeRef: AnyObject?
      let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
      
      guard status == errSecSuccess else {
          if status == errSecItemNotFound { return nil }
          throw KeychainError.unknown(status)
      }
      
      guard let data = dataTypeRef as? Data,
            let token = String(data: data, encoding: .utf8) else {
          return nil
      }
      return token
  }
  ```

* **Keychain Delete Operations (SecItemDelete)**:
  ```swift
  func deleteToken(account: String) throws {
      let query: [String: Any] = [
          kSecClass as String: kSecClassGenericPassword,
          kSecAttrService as String: "com.supersauced.auth",
          kSecAttrAccount as String: account
      ]
      let status = SecItemDelete(query as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
          throw KeychainError.unknown(status)
      }
  }
  ```

#### 2. Session Lifecycle and Refresh Mechanisms
* **Event-Driven Lifecycle Listener**:
  Use Supabase's `onAuthStateChange` publisher to respond to token changes automatically:
  ```swift
  supabase.auth.onAuthStateChange { event, session in
      guard let session = session else {
          // Clear Keychain on SignOut or Auth loss
          try? KeychainHelper.shared.deleteToken(account: "access_token")
          try? KeychainHelper.shared.deleteToken(account: "refresh_token")
          return
      }
      
      switch event {
      case .signedIn, .tokenRefreshed:
          // Persist fresh tokens securely
          try? KeychainHelper.shared.saveToken(session.accessToken, account: "access_token")
          try? KeychainHelper.shared.saveToken(session.refreshToken, account: "refresh_token")
      case .signedOut:
          // Clean up
          try? KeychainHelper.shared.deleteToken(account: "access_token")
          try? KeychainHelper.shared.deleteToken(account: "refresh_token")
      default:
          break
      }
  }
  ```
* **Offline Polling and Refresh Handling**:
  If the application is offline and the access token expires:
  1. API requests will fail with a `401 Unauthorized`.
  2. The network interceptor check should trigger a manual token refresh call when connectivity is restored:
     `try await supabase.auth.getSession()` (this forces the SDK to attempt a token refresh using the stored refresh token).
  3. If the refresh token has expired or is invalid, the operation throws `AuthError.sessionExpired` (HTTP 400 `invalid_grant`). The client app must catch this, wipe the Keychain data, and force a redirect to the login screen.

---

### Focus Area 3: Profile Creation Trigger Mechanics & Security Isolation
When a user registers via Supabase Auth, we must instantly provision their public profile. However, security isolation is critical to avoid SQL injection or search path hijacking inside database triggers.

#### 1. Security Best Practices
* **`SECURITY DEFINER`**: The trigger function executes with the privileges of the database owner (superuser) rather than the triggering user (who has no privileges to query `auth.users` or insert into `public.user_profiles` directly under strict RLS policies).
* **`SET search_path = ''`**: Prevents schema hijacking. By default, helper functions in a trigger search the current search path. An attacker could create a malicious function matching a name used in the trigger. Forcing search path to empty ensures all schema calls must be fully qualified (e.g., `pg_catalog.coalesce`, `public.user_profiles`).

#### 2. PostgreSQL Implementation Script
Here is the recommended merged script to write to `schema.sql` and document in `auth_integration.md`:

```sql
-- Create database function with strict security controls
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    v_full_name TEXT;
    v_avatar_url TEXT;
BEGIN
    -- Extract email safely
    v_email := NEW.email;
    
    -- Extract username from raw metadata, fallback to email prefix if absent
    v_username := pg_catalog.coalesce(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'preferred_username',
        pg_catalog.split_part(NEW.email, '@', 1)
    );
    
    -- Extract full name and avatar from metadata (provided by OAuth providers like Google/Apple)
    v_full_name := pg_catalog.coalesce(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name'
    );
    
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

    -- Insert into public user profiles mapping both profile and onboarding details
    INSERT INTO public.user_profiles (
        id, 
        username, 
        email, 
        full_name, 
        avatar_url,
        dietary_preferences,
        discovery_channel,
        sauce_log
    )
    VALUES (
        NEW.id,
        v_username,
        v_email,
        v_full_name,
        v_avatar_url,
        pg_catalog.array[]::TEXT[], -- Empty initial array for onboarding
        NULL,                       -- Empty initial discovery channel
        '{}'::JSONB                 -- Empty initial inventory JSONB
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Ensure trigger failure does not block registration entirely in production, or logs errors
    -- In this architecture, we raise a warning and allow registration to proceed
    RAISE WARNING 'handle_new_user trigger exception: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Bind trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### Focus Area 4: Shopify Synchronization ("Display Shelf" Architecture)
The "Display Shelf" architecture decouples commerce engines from high-performance app queries. Shopify is the source of truth for items and sales; Supabase is the cached representation.

```
+---------------+                    +---------------+                    +---------------+
|               |  1. orders/paid    |  Supabase     |  2. Match email    |   Supabase    |
|   Shopify     |------------------->|  Edge Func    |------------------->|   Database    |
|   Webhook     |  (Signed POST)     |  (Verify Sig) |  & update log      | (user_profiles|
|               |                    |               |                    |  .sauce_log)  |
+---------------+                    +---------------+                    +---------------+
```

#### 1. Webhook Setup and Signature Verification
A Shopify Webhook `orders/paid` targets a Supabase Edge Function `/functions/shopify-sync-inventory`.

* **Signature Verification (Edge Function Code Strategy)**:
  Every Shopify request must be validated using the `X-Shopify-Hmac-Sha256` header:
  ```typescript
  import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
  import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts"

  const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!

  serve(async (req) => {
    const rawBody = await req.text()
    const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256")
    
    const hash = createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64")
      
    if (hash !== hmacHeader) {
      return new Response("Unauthorized Signature", { status: 401 })
    }
    
    const payload = JSON.parse(rawBody)
    const userEmail = payload.customer.email
    const lineItems = payload.line_items // Array of items purchased
    
    // Process update mapping SKU/Variant IDs to Supabase profiles.sauce_log
    // ...
    return new Response("Success", { status: 200 })
  })
  ```

#### 2. Inventory and SKU Mapping (Sauce Log Structure)
The `sauce_log` JSONB column in `public.user_profiles` must follow a structured inventory schema to enable recipes to cross-reference stock:
```json
{
  "inventory": {
    "SKU-CUBE-SPICY": {
      "quantity": 3,
      "purchased_at": "2026-06-23T21:00:00Z"
    },
    "SKU-SAUCE-HABANERO": {
      "quantity": 1,
      "purchased_at": "2026-06-20T12:00:00Z"
    }
  }
}
```

* **Stock Status Tracking**:
  To render a recipe's ingredient list with inline stock indicators, we join the recipe's SKU tags with the user's `sauce_log`:
  ```sql
  -- SQL to check if a user has all required cube_tags for a recipe
  CREATE OR REPLACE FUNCTION public.user_has_cube_inventory(user_id UUID, recipe_id INT)
  RETURNS BOOLEAN 
  LANGUAGE plpgsql 
  SECURITY DEFINER
  AS $$
  DECLARE
      required_cubes TEXT[];
      item_tag TEXT;
      user_log JSONB;
  BEGIN
      -- Retrieve required cube SKUs from the recipe
      SELECT cube_tags INTO required_cubes FROM public.recipes WHERE id = recipe_id;
      -- Retrieve user's pantry log
      SELECT sauce_log INTO user_log FROM public.user_profiles WHERE id = user_id;
      
      FOREACH item_tag IN ARRAY required_cubes LOOP
          -- Check if the SKU is in user's sauce_log with quantity > 0
          IF NOT (user_log->'inventory'->item_tag IS NOT NULL AND 
                  (user_log->'inventory'->item_tag->>'quantity')::INT > 0) THEN
              RETURN FALSE;
          END IF;
      END LOOP;
      RETURN TRUE;
  END;
  $$;
  ```

#### 3. Dynamic Coupon Generation & Redemption
* **Trigger Mechanic**: 
  When a user logs cooking a recipe in `public.sauce_log` (or a dedicated `public.cook_logs` tracking table) and hits a specific milestone:
  1. The DB trigger invokes an external serverless function (via a Supabase Webhook payload).
  2. The function makes a request to the **Shopify Admin API** to generate a single-use discount code:
     `POST /admin/api/2026-04/price_rules/{price_rule_id}/discount_codes.json`
     Payload:
     ```json
     {
       "discount_code": {
         "code": "SAUCED-COOK-XYZ123"
       }
     }
     ```
  3. The function writes the code back to the user's `public.rewards` table in Supabase.
  4. The iOS application displays this code to the user, who inputs it directly on Shopify's native checkout web view / Storefront SDK.

---

## 4. Draft Content Plan for `docs/auth_integration.md`
To correct the ANSI formatting corruption and address all specific requirements, here is the complete proposed draft for `/home/freya/supersauced/docs/auth_integration.md`.

```markdown
# Authentication & Onboarding Flow Integration

## 1. Authentication Flows & Deep Linking Strategy
This section details how the Super Sauced client application (iOS native) authenticates users via Supabase Auth and navigates back securely using deep links.

### Apple & Google Native OAuth Flow
```
+------------------+          1. Native SDK login          +-------------------+
|                  |-------------------------------------->|                   |
|   iOS App UI     |                                       |   Apple/Google    |
|                  |<--------------------------------------|   Auth Servers    |
+------------------+          2. Return ID Token           +-------------------+
         |
         | 3. signInWithIdToken(provider, idToken)
         v
+------------------+
|  Supabase Auth   |
+------------------+
```

1. **Apple Sign-In**:
   - The iOS application uses the `AuthenticationServices` framework to display the native Apple ID prompts.
   - Upon successful authorization, Apple returns an Identity Token (`id_token`) and access token.
   - The iOS application invokes the Supabase client library:
     `try await supabase.auth.signInWithIdToken(provider: .apple, idToken: idToken)`
   - Supabase validates the token signatures directly with Apple's OAuth endpoints, logs in the user, and sends a session object back to the app.

2. **Google Sign-In**:
   - The iOS application uses the native `GoogleSignIn` SDK for iOS.
   - The SDK returns the Google `idToken`.
   - The iOS application logs in to Supabase:
     `try await supabase.auth.signInWithIdToken(provider: .google, idToken: idToken)`

3. **Passwordless Magic Links**:
   - For users logging in without social logins, they specify an email address.
   - The app sends a magic link request:
     `try await supabase.auth.signInWithOTP(email: email, redirectTo: URL(string: "https://supersauced.app/auth-callback"))`
   - Supabase emails the magic link to the user.

### Deep Linking Configuration
To redirect the user back to the application from a magic link or OAuth web fallback, the app must configure iOS Universal Links.
* **Apple App Site Association (AASA)**:
  Host a secure file at `https://supersauced.app/.well-known/apple-app-site-association` with Content-Type `application/json`:
  ```json
  {
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "ABC123XYZ4.com.supersauced.app",
          "paths": [ "/auth-callback", "/join" ]
        }
      ]
    }
  }
  ```
* **Supabase Dashboard**:
  - Register `https://supersauced.app/auth-callback` under **Authentication > Redirect URLs**.
* **iOS Interceptor**:
  When the app opens from the Universal Link, forward it to the Supabase client:
  ```swift
  func handleIncomingURL(_ url: URL) {
      Task {
          _ = try await supabase.auth.handle(url)
      }
  }
  ```

---

## 2. iOS Secure Keychain Storage & Token Refresh
To preserve sessions across app restarts securely, the Supabase access and refresh tokens are stored in the iOS secure Keychain.

### Keychain API Implementation
Store tokens with service key `com.supersauced.auth`.
- **SecItemAdd / SecItemUpdate**: Sets key credentials with access flag `kSecAttrAccessibleAfterFirstUnlock` (restricts access when device is locked).
- **SecItemCopyMatching**: Recovers active tokens at startup to initialize the Supabase client state.
- **SecItemDelete**: Clears credentials on logout.

### Session State Listening and Auto-Refresh
Initialize the auth listener inside the iOS application coordinator:
```swift
supabase.auth.onAuthStateChange { event, session in
    guard let session = session else {
        // Log out user & delete tokens
        Keychain.delete("access_token")
        Keychain.delete("refresh_token")
        return
    }
    
    switch event {
    case .signedIn, .tokenRefreshed:
        // Save new access/refresh tokens to Keychain
        Keychain.save("access_token", value: session.accessToken)
        Keychain.save("refresh_token", value: session.refreshToken)
    case .signedOut:
        Keychain.delete("access_token")
        Keychain.delete("refresh_token")
    default:
        break
    }
}
```
* **Auto-Refresh and Polling**:
  - The Supabase SDK runs an internal task timer to refresh the `access_token` automatically using the `refresh_token` 10 minutes prior to expiration.
  - If the device is offline, auto-refresh fails. When connectivity is restored, the networking stack intercepts request failures (401) and forces a session refresh:
    `try await supabase.auth.getSession()`
  - If the refresh token has expired or has been revoked (e.g. invalid grant), the client receives a 400 error. The app must clear Keychain tokens and direct the user to the onboarding flow.

---

## 3. Profile Creation Trigger Mechanics
Upon successful insertion of a user into `auth.users`, a database trigger creates their public profile mapping essential metadata.

### Security Isolation Details
- **`SECURITY DEFINER`**: Runs the trigger function with superuser rights. This is mandatory because end-users do not have privileges to read `auth.users` tables or write new records into `public.user_profiles` prior to their profile creation.
- **`SET search_path = ''`**: Hardens the function against search-path attacks where an attacker creates a malicious version of standard Postgres functions (e.g. `split_part`) in another schema.

### PostgreSQL Implementation
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    v_full_name TEXT;
    v_avatar_url TEXT;
BEGIN
    v_email := NEW.email;
    
    -- Extract username from raw oauth metadata, default to email username
    v_username := pg_catalog.coalesce(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'preferred_username',
        pg_catalog.split_part(NEW.email, '@', 1)
    );
    
    -- Extract personal information
    v_full_name := pg_catalog.coalesce(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name'
    );
    
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

    INSERT INTO public.user_profiles (
        id, 
        username, 
        email, 
        full_name, 
        avatar_url,
        dietary_preferences,
        discovery_channel,
        sauce_log
    )
    VALUES (
        NEW.id,
        v_username,
        v_email,
        v_full_name,
        v_avatar_url,
        pg_catalog.array[]::TEXT[],
        NULL,
        '{}'::JSONB
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger exception: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger binding
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 4. Shopify Synchronization: "Display Shelf" Sync Architecture
Super Sauced adopts a "Display Shelf" sync architecture: Shopify handles checkouts and catalog status, while Supabase mirrors relevant stock inventory and logs user purchases.

### Purchase Webhook Sync
When a customer purchases a product (Sauce or Cube) on Shopify, Shopify publishes an `orders/paid` event to our Supabase Edge Function `/shopify-sync-inventory`.
1. **Webhook Validation**:
   - The Edge Function validates the signature:
     `HMAC_SHA256(Shopify_Webhook_Secret, Request_Body) == Header("X-Shopify-Hmac-Sha256")`
2. **Database Update**:
   - The Function parses the items and matches the user profile by the customer's email.
   - It updates the `sauce_log` JSONB column mapping the purchased SKU variant IDs to user quantities:
     ```json
     {
       "inventory": {
         "SKU-CUBE-TERIYAKI": {
           "quantity": 2,
           "purchased_at": "2026-06-23T21:00:00Z"
         }
       }
     }
     ```

### Dynamic Coupon Generation & Redemption Flow
To incentivize engagement, users receive discount codes upon cooking milestones.
1. A database trigger checks if a user's completed recipe count exceeds milestones (e.g. 5, 10, 20).
2. The trigger raises a webhook call to an Edge Function `/generate-discount`.
3. The Edge Function calls the Shopify Admin API:
   `POST /admin/api/2026-04/price_rules/{rule_id}/discount_codes.json`
   Payload:
   ```json
   {
     "discount_code": {
       "code": "SAUCED-MILESTONE-5-XXXX"
     }
   }
   ```
4. The generated code is saved in `public.user_rewards` table and displayed on the app profile screen.
5. Redemption is handled directly on checkout via Shopify Storefront.

### Inventory Sync Logic
Real-time shop availability is maintained to notify users when ingredients in recipes are out of stock.
- **Webhooks**: Shopify `inventory_levels/update` updates `public.shopify_inventory` in Supabase in real-time.
- **Polling cron**: A fallback cron job runs every hour to fetch stock levels via Shopify Admin API to resolve any webhook delivery failures.
- **Recipe joins**:
  A database view combines `public.recipes.cube_tags` and `public.shopify_inventory` to render an inline "In Stock" indicator on the recipe UI.
```
```

---
