# Technical Analysis and Recommendations: Auth & Onboarding Integration Strategy

This document provides a comprehensive analysis and detailed recommendations for structuring and authoring `/home/freya/supersauced/docs/auth_integration.md` for Milestone 4. It focuses on the key areas outlined in the request, resolving schema discrepancies, and detailing the interface contracts for iOS secure storage, Supabase triggers, and the Shopify "Display Shelf" sync.

---

## 1. Executive Summary & Core Findings
* **Schema Mismatch Discovered**: A comparison between `/home/freya/supersauced/docs/schema.sql` and `/home/freya/supersauced/instructions.md` reveals that the `public.user_profiles` table in `schema.sql` is missing the `dietary_preferences` (TEXT[]), `discovery_channel` (TEXT), and `sauce_log` (JSONB) columns. These columns are necessary to support the onboarding flow and Shopify sync. The trigger `handle_new_user()` in `schema.sql` also fails to extract these values from user metadata.
* **Recommendations**:
  1. Update `docs/auth_integration.md` to recommend a schema migration adding these columns to `public.user_profiles`.
  2. Implement a secure, hardened `handle_new_user()` trigger using `SECURITY DEFINER` and `SET search_path = pg_catalog, public` to protect against privilege escalation and search-path hijacking.
  3. Formulate a robust iOS Keychain storage strategy (using native `Security` APIs: `SecItemAdd`, `SecItemCopyMatching`) combined with lifecycle event listeners for session updates.
  4. Design a bidirectional Shopify "Display Shelf" synchronization protocol via Supabase Edge Functions, detailing specific payload shapes for coupon generation and inventory updates.

---

## 2. Proposed Structure for `/home/freya/supersauced/docs/auth_integration.md`

It is recommended to structure the revised document as follows to ensure completeness, readability, and technical accuracy:

1. **Title & Document Metadata**
2. **Overview & Architectural Topology**
   * *Conceptual diagram showing iOS App ↔ Supabase Auth ↔ Supabase Postgres ↔ Shopify API interaction.*
3. **Prerequisites & Dashboards Configuration**
   * *Supabase Dashboard (redirect URIs, SMTP configuration).*
   * *Apple Developer Portal & Google Cloud Console settings.*
4. **Authentication Flow Implementations (OAuth & Passwordless)**
   * *Native Sign-In with Apple Flow (Swift + Supabase SDK).*
   * *Native Sign-In with Google Flow (Swift + Supabase SDK).*
   * *Email Magic Link (Passwordless) Flow with PKCE (Proof Key for Code Exchange).*
   * *Deep Linking & Redirection Setup (Associated Domains, AASA JSON format, Swift Handler).*
5. **iOS Secure Storage (Keychain) & Session Lifecycle**
   * *Swift Keychain Service Wrapper (`SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete`).*
   * *Session Refresh Architecture (Event-driven `onAuthStateChange` + App Foreground Polling).*
6. **Supabase Profile Creation Trigger (Database Layer)**
   * *Schema Migration Recommendations (aligning `schema.sql` with CRM requirements).*
   * *Hardened Database Trigger Function (`SECURITY DEFINER`, `search_path`, metadata extraction).*
7. **Shopify Integration & Sync Protocols (Phase 2+)**
   * *"Display Shelf" Model Architecture description.*
   * *Bidirectional Inventory Sync (Supabase `sauce_log` ↔ Shopify webhooks).*
   * *Dynamic Coupon/Discount Generation API (Supabase Edge Function + Shopify Admin GraphQL API).*
8. **Verification & Testing Playbook**
   * *Mock scripts, SQL verify triggers, and verification commands.*

---

## 3. Detailed Section Content Strategy & Technical Specs

### Section A: Apple/Google/Magic Link OAuth and Passwordless Signup/Login
To establish a seamless onboarding experience with minimal user friction, the app uses passwordless logins.

#### 1. Native iOS OAuth Credentials Exchange
Mobile applications should utilize native SDKs to procure identity tokens and exchange them with Supabase. This delivers a native UI sheet instead of launching a web browser.
* **Apple Flow**: The app invokes `ASAuthorizationAppleIDProvider`. On success, it extracts the native Identity Token (JWT) and exchanges it via the Supabase client:
  ```swift
  import AuthenticationServices
  import Supabase

  func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
      guard let identityTokenData = credential.identityToken,
            let identityTokenString = String(data: identityTokenData, encoding: .utf8) else {
          throw AuthError.missingIdentityToken
      }
      
      // Call Supabase native exchange
      let session = try await supabase.auth.signInWithIdToken(
          provider: .apple,
          idToken: identityTokenString,
          accessToken: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
      )
      // Save session tokens to Keychain
  }
  ```
* **Google Flow**: Similarly, the iOS Google SignIn SDK retrieves an `idToken`, which is passed to `supabase.auth.signInWithIdToken(provider: .google, idToken: googleToken)`.

#### 2. Email Magic Link (Passwordless OTP) with PKCE
To prevent security interception, the PKCE flow must be configured.
1. The iOS app generates a `code_verifier` and a `code_challenge`.
2. The app calls Supabase Auth OTP:
   ```swift
   try await supabase.auth.signInWithOtp(
       email: emailAddress,
       redirectTo: URL(string: "supersauced://login-callback")!
   )
   ```
3. Supabase emails a magic link containing a unique authorization `code` parameter.
4. When clicked, the link is redirected via deep-linking to the iOS app.

#### 3. Deep Linking & Associated Domains (Universal Links)
To route the authentication callback securely back into the iOS App:
* **Redirect URIs**: Configure `supersauced://login-callback` (Custom Scheme) or `https://supersauced.com/login-callback` (Universal Link) in the Supabase Dashboard.
* **AASA File Configuration**: Host the Apple App Site Association file at `https://supersauced.com/.well-known/apple-app-site-association` (Content-Type: `application/json`, no file extension):
  ```json
  {
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "ABC123XYZ.com.supersauced.app",
          "paths": [ "/login-callback", "/auth/callback" ]
        }
      ]
    }
  }
  ```
* **Swift Deep Link Handler (PKCE Exchange)**:
  ```swift
  func handleDeepLink(_ url: URL) {
      guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
            let queryItems = components.queryItems else { return }
      
      if let authCode = queryItems.first(where: { $0.name == "code" })?.value {
          Task {
              do {
                  // Exchange auth code for actual session
                  let session = try await supabase.auth.exchangeCodeForSession(code: authCode)
                  print("Login successful! User ID: \(session.user.id)")
                  // Store session in Keychain
              } catch {
                  print("Failed to exchange code: \(error)")
              }
          }
      }
  }
  ```

---

### Section B: iOS Secure Keychain Storage & Session Refresh

#### 1. Keychain API Wrapper
Storing tokens (access token, refresh token) in plain text or `UserDefaults` is a security violation. They must be stored in the iOS secure Keychain using the security API.

```swift
import Foundation
import Security

struct KeychainHelper {
    static let service = "com.supersauced.app.auth"
    static let account = "session_tokens"
    
    struct SessionPayload: Codable {
        let accessToken: String
        let refreshToken: String
        let expiresAt: Date
    }
    
    static func saveSession(_ session: SessionPayload) throws {
        let data = try JSONEncoder().encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly // Strict access
        ]
        
        // Delete existing item if it exists
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.savingFailed(status)
        }
    }
    
    static func readSession() throws -> SessionPayload? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        guard status == errSecSuccess else {
            if status == errSecItemNotFound { return nil }
            throw KeychainError.readingFailed(status)
        }
        
        guard let data = dataTypeRef as? Data else { return nil }
        return try JSONDecoder().decode(SessionPayload.self, from: data)
    }
    
    static func deleteSession() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: Error {
    case savingFailed(OSStatus)
    case readingFailed(OSStatus)
}
```

#### 2. Session Refresh Strategy
* **Event-Driven Refresh**: Subscribe to Supabase auth state changes. When the token is refreshed by the client SDK, intercept the event and write the new tokens to the Keychain.
  ```swift
  supabase.auth.onAuthStateChange { event, session in
      switch event {
      case .signedIn, .tokenRefreshed:
          if let session = session {
              let payload = KeychainHelper.SessionPayload(
                  accessToken: session.accessToken,
                  refreshToken: session.refreshToken,
                  expiresAt: Date(timeIntervalSince1970: session.expiresAt)
              )
              try? KeychainHelper.saveSession(payload)
          }
      case .signedOut, .userDeleted:
          KeychainHelper.deleteSession()
      default:
          break
      }
  }
  ```
* **Proactive Foreground Refresh**: Timers pause when an iOS app goes into the background. Thus, when the app returns to the foreground (`sceneWillEnterForeground` or `applicationWillEnterForeground`), the app must check token expiration.
  - If the stored access token is expired or expires in under 5 minutes, call:
    `try await supabase.auth.refreshSession()` (which uses the stored `refresh_token` to retrieve a fresh session).
  - If the network is unavailable, retry gracefully with exponential backoff and notify the user if offline operations are restricted (as MVP requires an active connection).

---

### Section C: Profile Creation Trigger Mechanics
During registration, users complete an onboarding survey (`dietary_preferences`, `discovery_channel`) and initialize their inventory (`sauce_log`). This data is passed during sign-up to Supabase as user metadata.

#### 1. Correcting the Schema Mismatch
To ensure data is saved successfully, `public.user_profiles` must first be altered to support the CRM fields. The following SQL migrations must be run to align `schema.sql` with `instructions.md`:

```sql
-- Migration to align user_profiles with CRM and Sauce Log requirements
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS discovery_channel TEXT,
ADD COLUMN IF NOT EXISTS sauce_log JSONB DEFAULT '{}';
```

#### 2. Hardened Database Trigger (SECURITY DEFINER & search_path)
Triggers executed on `auth.users` run within the context of the calling transaction (often unauthenticated). Therefore, the handler function MUST be set to `SECURITY DEFINER` to bypass RLS, and its `search_path` must be pinned to prevent hijacking.

```sql
-- Secure trigger function with isolated privileges and search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_username TEXT;
    v_full_name TEXT;
    v_avatar_url TEXT;
    v_dietary_prefs TEXT[];
    v_discovery TEXT;
    v_sauce_log JSONB;
BEGIN
    -- 1. Extract username, defaulting to email prefix + random string if missing
    v_username := coalesce(
        NEW.raw_user_meta_data->>'username', 
        split_part(NEW.email, '@', 1) || '_' || substring(md5(random()::text) from 1 for 5)
    );
    
    -- 2. Extract basic profile metadata
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
    v_discovery := NEW.raw_user_meta_data->>'discovery_channel';
    
    -- 3. Safely extract and cast dietary preferences text array from JSONB
    IF NEW.raw_user_meta_data ? 'dietary_preferences' AND jsonb_typeof(NEW.raw_user_meta_data->'dietary_preferences') = 'array' THEN
        SELECT array_agg(val) INTO v_dietary_prefs
        FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'dietary_preferences') AS val;
    ELSE
        v_dietary_prefs := '{}'::text[];
    END IF;
    
    -- 4. Safely extract sauce log JSONB, defaulting to empty JSON object '{}'
    IF NEW.raw_user_meta_data ? 'sauce_log' AND jsonb_typeof(NEW.raw_user_meta_data->'sauce_log') = 'object' THEN
        v_sauce_log := NEW.raw_user_meta_data->'sauce_log';
    ELSE
        v_sauce_log := '{}'::jsonb;
    END IF;

    -- 5. Insert record into public.user_profiles
    INSERT INTO public.user_profiles (
        id,
        username,
        email,
        full_name,
        avatar_url,
        dietary_preferences,
        discovery_channel,
        sauce_log,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_username,
        coalesce(NEW.email, ''),
        v_full_name,
        v_avatar_url,
        v_dietary_prefs,
        v_discovery,
        v_sauce_log,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log execution failures internally (optional but recommended for debugging triggers)
        RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW; -- Return NEW anyway to allow auth.users insertion to succeed
END;
$$;
```

---

### Section D: Shopify Synchronization & "Display Shelf" Architecture
Shopify acts as the commerce core, while Supabase acts as the mobile "Display Shelf" representing app-specific states.

#### 1. Bidirectional Inventory Sync (Sauce Log ↔ Webhooks)
* **Shopify-to-Supabase Sync (Purchase Event)**:
  - When a customer purchases cubes on Shopify, Shopify publishes an `orders/paid` event.
  - A Supabase Edge Function `/functions/v1/shopify-webhook` handles the payload.
  - **Payload Structure (`orders/paid`):**
    ```json
    {
      "id": 8273648172,
      "email": "customer@example.com",
      "line_items": [
        {
          "sku": "SAUCE-CUBE-SPICY",
          "quantity": 2,
          "name": "Super Sauced Spicy Cube Pack"
        }
      ],
      "financial_status": "paid"
    }
    ```
  - **Logic**: The Edge Function:
    1. Verifies the Shopify Webhook HMAC signature using `X-Shopify-Hmac-SHA256` and the shared secret.
    2. Extracts the email and maps products via SKU to the user's `sauce_log`.
    3. Executes a database transaction to *increment* the quantities in `public.user_profiles.sauce_log` using JSONB modifications:
       ```sql
       UPDATE public.user_profiles
       SET sauce_log = jsonb_set(
           sauce_log, 
           '{SAUCE-CUBE-SPICY}', 
           to_jsonb(coalesce((sauce_log->>'SAUCE-CUBE-SPICY')::int, 0) + 2)
       )
       WHERE email = 'customer@example.com';
       ```
* **Supabase-to-Shopify Sync (App Scan/Manual Logs)**:
  - If a user manually logs consumption (e.g. scanning a QR code or marking a cube as "used"), a DB trigger sends a webhook payload to the Shopify Customer API to update customer metafields (e.g. `namespace: "app_state"`, `key: "sauce_inventory"`) in the background.

#### 2. Milestone Coupon Generation Flow
To drive loyalty, when a user hits milestones (e.g., scanning 3 unique SKUs in `sauce_log`), a unique Shopify coupon is generated.
* **Flow**:
  1. The iOS app detects the milestone and sends a request to Supabase Edge Function `/functions/v1/generate-milestone-coupon`.
  2. The Edge Function verifies the Supabase JWT user credentials, checks the database for eligibility, and requests a discount code via the Shopify Admin GraphQL API:
     ```graphql
     mutation discountCodeBasicCreate($basicDiscount: DiscountCodeBasicInput!) {
       discountCodeBasicCreate(basicDiscount: $basicDiscount) {
         discountNode {
           id
           discount {
             ... on DiscountCodeBasic {
               title
               codes(first: 1) {
                 nodes {
                   code
                 }
               }
             }
           }
         }
         userErrors {
           field
           message
         }
       }
     }
     ```
  3. **GraphQL Variables**:
     ```json
     {
       "basicDiscount": {
         "title": "Milestone Reward - $5 Off",
         "code": "SAUCED-M1-82A9D",
         "startsAt": "2026-06-24T00:00:00Z",
         "endsAt": "2026-07-24T00:00:00Z",
         "customerSelection": {
           "customers": {
             "add": ["gid://shopify/Customer/123456789"]
           }
         },
         "customerGets": {
           "value": {
             "discountAmount": {
               "amount": 5.0,
               "currencyCode": "USD"
             }
           },
           "items": {
             "all": true
           }
         },
         "usageLimit": 1
       }
     }
     ```
  4. The code is saved to a `public.user_coupons` table in Supabase and returned to the iOS app UI.

---

## 4. Verification and Validation Playbook

To ensure these configurations operate securely and reliably, the following testing rules should be written into `/home/freya/supersauced/docs/auth_integration.md`:

1. **Trigger Security Verification (SQL)**:
   Ensure the `handle_new_user` function execution privileges are properly locked:
   ```sql
   SELECT routine_schema, routine_name, security_type
   FROM information_schema.routines
   WHERE routine_name = 'handle_new_user';
   -- Output must verify: 'security_type = DEFINER'
   ```
2. **Metadata Cast Check**:
   Test executing the trigger with sample mock metadata containing surveys and logs:
   ```sql
   -- Mock inserting into auth.users to verify user_profiles mapping
   INSERT INTO auth.users (id, email, raw_user_meta_data)
   VALUES (
       '00000000-0000-0000-0000-000000000001',
       'test_onboarding@example.com',
       '{"username": "tester", "dietary_preferences": ["gluten-free", "dairy-free"], "discovery_channel": "instagram", "sauce_log": {"CUBE-SPICY": 5}}'
   );

   SELECT * FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';
   -- Assert: dietary_preferences = {gluten-free,dairy-free}
   -- Assert: discovery_channel = 'instagram'
   -- Assert: sauce_log = {"CUBE-SPICY": 5}
   ```
3. **Verify API Webhook HMAC Signatures**:
   Write automated unit tests verifying that the Supabase Edge Function successfully rejects requests with missing or invalid `X-Shopify-Hmac-SHA256` headers with `401 Unauthorized` status.
