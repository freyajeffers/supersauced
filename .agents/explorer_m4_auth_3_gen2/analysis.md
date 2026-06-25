# Strategy Recommendation: Authentication & Onboarding Flow (Milestone 4)

## Executive Summary
This document outlines the strategic integration recommendations for **Milestone 4 (Auth & Onboarding Flow)** of the Super Sauced B2C mobile application backend. By analyzing `/home/freya/supersauced/docs/schema.sql`, `/home/freya/supersauced/instructions.md`, and the validation test suites (`validate.sql`, `test_schema.sql`), we address key architectural gaps, define security isolation protocols, detail Shopify synchronization mechanisms, and provide concrete implementation specs for the iOS client and Supabase backend.

---

## 1. Authentication & Passwordless Signup/Login Flows

To achieve the MVP goal of a friction-free onboarding experience under the "Speed to Meal" core journey, we recommend prioritizing native OAuth authentication over web-based flows where possible, while detailing the fallback for email-based passwordless signup.

```
+-----------------------------------------------------------------------------------+
|                              AUTHENTICATION FLOWS                                 |
+-----------------------------------------------------------------------------------+

1. Native Apple / Google OAuth Flow:
   [iOS Native App] --(1. ASAuthorization / GIDSignIn)--> [Apple/Google ID Token]
          |
          +--(2. Sign-In With ID Token)--> [Supabase Auth]
                                                 |
                                       (3. Create auth.users)
                                                 |
                                      (4. handle_new_user Trigger)
                                                 |
                                                 v
                                    [public.user_profiles]

2. Passwordless Email Magic Link Flow:
   [iOS Native App] --(1. auth.signInWithOtp)--> [Supabase Auth API]
                                                        |
                                            (2. Send Magic Link Email)
                                                        |
                                                        v
   [Mail App] <--(3. Clicks Magic Link URL)--------- [User]
       |
       +--(4. Deep Link Redirect: URL Scheme / Universal Link)--> [iOS Native App]
                                                                        |
                                                         (5. exchangeCodeForSession)
                                                                        |
                                                                        v
                                                              [Supabase Session]
```

### 1.1. Native OAuth Flows (Apple & Google)
- **Apple Sign-In (iOS Native)**:
  - **Mechanism**: The client app utilizes Apple’s `AuthenticationServices` framework via `ASAuthorizationAppleIDProvider`.
  - **Action**: On successful authentication, the system returns an identity token (JWT) and authorization code.
  - **Supabase Integration**: The app sends the identity token to Supabase using:
    ```swift
    let credentials = try await supabase.auth.signInWithIdToken(
        provider: .apple,
        idToken: identityTokenString
    )
    ```
- **Google Sign-In (iOS Native)**:
  - **Mechanism**: The client app uses the native `GoogleSignIn` SDK to authenticate the user and retrieve the ID token.
  - **Supabase Integration**:
    ```swift
    let credentials = try await supabase.auth.signInWithIdToken(
        provider: .google,
        idToken: googleIdTokenString
    )
    ```
- **Friction Reduction**: Native OAuth avoids launching web browsers/WebViews, supports biometric sign-in (FaceID/TouchID), and is a requirement for App Store approval when other social providers are offered.

### 1.2. Email Magic Link Flow
- **Initiation**: The user submits their email. The app invokes:
  ```swift
  try await supabase.auth.signInWithOtp(
      email: emailAddress,
      redirectTo: URL(string: "supersauced://auth-callback")
  )
  ```
- **Verification**: Supabase sends an email containing a link with an authorization code or access token hash.
- **Deep Linking Back to iOS App**:
  - **Custom URL Scheme**: e.g., `supersauced://auth-callback`. Registered in `Info.plist` under URL Types.
  - **Universal Links (Recommended/Secure)**: e.g., `https://app.supersauced.com/auth-callback`.
    - Requires hosting an `apple-app-site-association` (AASA) JSON file in the `.well-known/` folder of the domain root:
      ```json
      {
        "applinks": {
          "details": [
            {
              "appIDs": ["TEAMID.com.supersauced.app"],
              "components": [
                {
                  "/": "/auth-callback",
                  "comment": "Matches auth callback URL"
                }
              ]
            }
          ]
        }
      }
      ```
- **Supabase Configuration**:
  - In the Supabase Dashboard (`Authentication -> URL Configuration`), add `supersauced://auth-callback` and/or `https://app.supersauced.com/auth-callback` under **Redirect URIs**.
- **Callback Interception**:
  - When the app is opened via the callback URL, `SceneDelegate` or `AppDelegate` parses the URL and calls the Supabase SDK to exchange the code for an active session:
    ```swift
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        Task {
            try await supabase.auth.exchangeCodeForSession(redirectURL: url)
        }
    }
    ```

---

## 2. iOS Secure Keychain Storage & Session Refresh

Storing session credentials (tokens) securely on iOS is critical to prevent credential theft.

### 2.1. Keychain Storage Implementation
- **Why avoid UserDefaults?** `UserDefaults` is saved in plaintext on disk and is backed up to iCloud/iTunes in an unencrypted state unless configured otherwise, exposing JWTs.
- **Keychain CRUD Operations**: Save, Retrieve, Update, and Delete functions should be implemented using the native iOS `Security` framework with `kSecAttrAccessibleAfterFirstUnlock` (restricting access to when the device is unlocked).

```swift
import Foundation
import Security

public class KeychainManager {
    public static let shared = KeychainManager()
    private let service = "com.supersauced.auth"
    private let account = "session_token"

    public func save(sessionData: Data) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: sessionData,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        // Delete any existing session before saving to avoid duplicate keys
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    public func read() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess {
            return dataTypeRef as? Data
        }
        return nil
    }

    public func delete() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}
```

### 2.2. Session Refresh Mechanisms
Supabase Access Tokens are short-lived (JWT, typically 1 hour) and are refreshed using the long-lived `refresh_token`.
1. **Event-Driven Refresh (Primary)**:
   - Listen to Supabase auth state changes via the event listener. In Swift, subscribe to the session publisher.
   - When a `tokenRefreshed` or `signedIn` event fires, immediately update the stored tokens in the Keychain.
   - The SDK automatically handles token refresh on demand prior to outbound REST/GraphQL queries when utilizing a standard Supabase client instance.
2. **Polling / Timer-Based Refresh (Secondary/Fallback)**:
   - To safeguard against offline states or background execution, calculate the expiry window of the token.
   - Schedule a local Swift `Timer` to fire `5 minutes before` the JWT expires.
   - Upon timer firing, invoke `try await supabase.auth.refreshSession()`.
3. **App Lifecycle Re-Validation**:
   - Register for `UIApplication.willEnterForegroundNotification`.
   - When the app is foregrounded, compare the current time with the stored token expiration. If the token is expired or within 5 minutes of expiring, initiate a proactive refresh before the user interacts with the UI to prevent API request failures.

---

## 3. Profile Creation Trigger Mechanics & Security Isolation

### 3.1. Identified Schema Mismatch / Verification Error
During schema verification, we identified two severe issues in the current `/home/freya/supersauced/docs/schema.sql`:
1. **Syntax Error**: Line 56 contains a corrupted terminal command echo (`[18D [K`) which breaks index creation.
2. **Missing Columns**: The `user_profiles` table definition in `schema.sql` lacks `onboarding_survey` and `sauce_log` columns. However, the test suites (`validate.sql` and `test_schema.sql`) explicitly insert and query these columns, causing the entire database test suite to fail verification.

We must define these columns in `user_profiles`:
```sql
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS onboarding_survey JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS sauce_log JSONB DEFAULT '{}'::jsonb;
```

### 3.2. Security Isolation with SECURITY DEFINER
The trigger function `handle_new_user()` is triggered on `auth.users` insert. Since the `auth` schema executes as a system user and user profile inserts are restricted by RLS on `public.user_profiles`, the trigger function must be executed with elevated privileges.
- **SECURITY DEFINER**: Bypasses Row Level Security (RLS) policies because it executes with the privileges of the role that *defined* the function (typically the database owner/superuser) rather than the triggering user.
- **Vulnerability (Search Path Hijacking)**: If `search_path` is not securely set, a malicious caller could create a temporary table or override database operators within their own schema, manipulating the execution context of the `SECURITY DEFINER` function to run arbitrary code.
- **Mitigation**:
  1. Set the function options explicitly to restrict `search_path`: `SET search_path = public, pg_temp`.
  2. Fully qualify all database objects referenced within the query (e.g. write `public.user_profiles` instead of `user_profiles`).

### 3.3. Secure Trigger Implementation
The updated, secure version of the trigger function parses the metadata dictionary (`raw_user_meta_data`) and safely maps metadata fields while handling empty or corrupted JSON payloads to pass the test cases in `validate.sql`.

```sql
-- Create or replace the new user trigger function securely
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_username TEXT;
    v_onboarding_survey JSONB;
    v_sauce_log JSONB;
BEGIN
    -- 1. Parse and extract metadata from auth.users (NEW.raw_user_meta_data)
    -- Fallback to splitting email if no username/preferred_username is provided
    v_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'preferred_username',
        split_part(NEW.email, '@', 1)
    );

    -- 2. Validate and fallback JSONB keys to avoid null values (required for test suite compatibility)
    IF NEW.raw_user_meta_data IS NULL THEN
        v_onboarding_survey := '{}'::jsonb;
        v_sauce_log := '{}'::jsonb;
    ELSE
        -- Extract onboarding survey
        IF NEW.raw_user_meta_data->'onboarding_survey' IS NULL OR NEW.raw_user_meta_data->'onboarding_survey' = 'null'::jsonb THEN
            v_onboarding_survey := '{}'::jsonb;
        ELSE
            v_onboarding_survey := NEW.raw_user_meta_data->'onboarding_survey';
        END IF;

        -- Extract sauce log
        IF NEW.raw_user_meta_data->'sauce_log' IS NULL OR NEW.raw_user_meta_data->'sauce_log' = 'null'::jsonb THEN
            v_sauce_log := '{}'::jsonb;
        ELSE
            v_sauce_log := NEW.raw_user_meta_data->'sauce_log';
        END IF;
    END IF;

    -- 3. Deduplicate username if it already exists in the profile table
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = v_username) THEN
        v_username := v_username || '_' || substring(md5(random()::text) from 1 for 6);
    END IF;

    -- 4. Perform insertion using fully-qualified path
    INSERT INTO public.user_profiles (
        id, 
        username, 
        email, 
        full_name, 
        avatar_url, 
        onboarding_survey, 
        sauce_log
    )
    VALUES (
        NEW.id,
        v_username,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
        v_onboarding_survey,
        v_sauce_log
    );

    RETURN NEW;
END;
$$;
```

---

## 4. Shopify Synchronization

The Super Sauced app uses the **Display Shelf Model** where Shopify is the commercial source of truth (inventory, SKU, checkouts) and Supabase stores the cached application state for speed.

```
+-----------------------------------------------------------------------------------+
|                        SHOPIFY DISPLAY SHELF SYNC PROCESS                         |
+-----------------------------------------------------------------------------------+

1. Purchase and Inventory Synchronization:
   [Shopify Checkout] --(orders/paid Webhook + HMAC)--> [Supabase Edge Function]
                                                                |
                                                      (Verify Signature)
                                                                |
                                                                v
                                                     [Is email registered?]
                                                     /                    \
                                                   YES                     NO
                                                   /                        \
                    [Update user_profiles.sauce_log]     [Insert pending_sauce_log_credits]
                                                                             |
                                                                  (On future registration)
                                                                             v
                                                                  [Run handle_new_user()]

2. Reward Event and Coupon Generation:
   [iOS Client APP] --(Reach Milestones)--> [Supabase DB Event]
                                                   |
                                        (Trigger Webhook Call)
                                                   |
                                                   v
                                     [Supabase Edge Function]
                                                   |
                                   (Generate Discount via Admin API)
                                                   |
                                                   v
                                        [Shopify Admin API]
                                                   |
                                        (Return Code: SAUCED-XX)
                                                   |
                                                   v
                                      [Update app UI + RLS Store]
```

### 4.1. Display Shelf Sync Architecture
- **Trigger event**: Set up Shopify Webhooks for `orders/paid` and `inventory_levels/update` pointing to a Supabase Edge Function URL.
- **Webhook Verification**: To prevent spoofing, the Supabase Edge Function must verify the signature of every payload:
  ```typescript
  import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
  
  async function verifyShopifyWebhook(req: Request, secret: string): Promise<boolean> {
    const hmac = req.headers.get("X-Shopify-Hmac-Sha256");
    if (!hmac) return false;
    const body = await req.clone().text();
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const signature = new Uint8Array(
      atob(hmac).split("").map((c) => c.charCodeAt(0))
    );
    return await crypto.subtle.verify(
      "HMAC", key, signature, new TextEncoder().encode(body)
    );
  }
  ```

### 4.2. Sauce Log Sync Logic
1. **Order Processing**: When the webhook is validated, the Edge Function extracts `email`, `line_items` (SKUs and quantity).
2. **Account Match**:
   - Check if user exists: `SELECT id FROM public.user_profiles WHERE email = order.email`.
   - **If Registered**: Use an SQL function to increment the quantity of the specific SKU inside the `sauce_log` JSONB column.
     ```sql
     CREATE OR REPLACE FUNCTION public.add_to_sauce_log(p_user_id UUID, p_sku TEXT, p_quantity INT)
     RETURNS VOID
     LANGUAGE plpgsql
     SECURITY DEFINER
     AS $$
     BEGIN
         UPDATE public.user_profiles
         SET sauce_log = jsonb_set(
             COALESCE(sauce_log, '{}'::jsonb),
             ARRAY[p_sku],
             to_jsonb(COALESCE((sauce_log->>p_sku)::int, 0) + p_quantity)
         )
         WHERE id = p_user_id;
     END;
     $$;
     ```
   - **If Unregistered (Guest Checkout)**:
     - Store the purchase in a temporary table `pending_sauce_log_credits (email text, sku text, quantity int)`.
     - When the user eventually signs up, `handle_new_user()` checks for pending credits, applies them, and purges the pending table.

### 4.3. Coupon Generation Flow
To generate real-time discounts on Shopify from the app:
1. **Loyalty Event**: The user reaches a cooking milestone (e.g., cooks 10 recipes).
2. **Supabase Event**: An Edge Function is called, which connects to the **Shopify Admin REST API** / `/admin/api/2024-04/price_rules.json` and creates a **Price Rule** (e.g., $5 off, single-use, restricted to the user's email).
3. **Discount Code**: Generate the discount code:
   `POST /admin/api/2024-04/price_rules/{price_rule_id}/discount_codes.json` with payload `{"discount_code": {"code": "SAUCED-10X-..."}}`.
4. **App UI Display**: The generated code is written to the database (or returned) and displayed to the user.
5. **Redemption**: Deep link the user directly to checkout with the discount code pre-applied:
   `https://shop.supersauced.com/cart/{variant_id}:{qty}?discount=SAUCED-10X-XXXX`.
