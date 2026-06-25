# Authentication & Onboarding Flow Integration
<!-- toc -->
<!-- toc -->

This document outlines the architecture, setup, code implementations, and database triggers for the Authentication and Onboarding flow of the Super Sauced B2C mobile application. It details native iOS OAuth, PKCE-based magic links, secure Keychain token storage, database triggers with security isolation, and the Shopify "Display Shelf" synchronization architecture.

---

> [!NOTE]
> **Prerequisites**
>
> - Supabase project with Auth enabled
> - Apple Developer account (for Sign in with Apple)
> - Google Cloud OAuth credentials (for Google Sign-In)
> - Expo Secure Store (for token storage)

## 1. Authentication Flows & Native SDK Configurations

To deliver a premium, low-friction user experience that complies with Apple's App Store Review Guidelines, the iOS application integrates native identity SDKs for Google and Apple authentication. By utilizing native credentials, users benefit from biometric authentication (FaceID/TouchID) without redirecting to external web browsers.

```
+-----------------------------------------------------------------------------------+
|                              AUTHENTICATION FLOWS                                 |
|                                                                                   |
| 1. Native Apple / Google OAuth Flow:                                              |
|    [iOS Native App] --(1. ASAuthorization / GIDSignIn)--> [Apple/Google ID Token] |
|           |                                                                       |
|           +--(2. Sign-In With ID Token)--> [Supabase Auth]                        |
|                                                  |                                |
|                                        (3. Create auth.users)                     |
|                                                  |                                |
|                                       (4. handle_new_user Trigger)                |
|                                                  |                                |
|                                                  v                                |
|                                     [public.user_profiles]                        |
|                                                                                   |
| 2. Passwordless Email Magic Link Flow:                                            |
|    [iOS Native App] --(1. auth.signInWithOtp)--> [Supabase Auth API]              |
|                                                         |                         |
|                                             (2. Send Magic Link Email)            |
|                                                         |                         |
|                                                         v                         |
|    [Mail App] <--(3. Clicks Magic Link URL)--------- [User]                       |
|        |                                                                          |
|        +--(4. Deep Link Redirect: URL Scheme / Universal Link)--> [iOS Native App]|
|                                                                         |         |
|                                                          (5. exchangeCodeSession) |
|                                                                         |         |
|                                                                         v         |
|                                                               [Supabase Session]  |
+-----------------------------------------------------------------------------------+
```

### 1.1. Native Apple Sign-In

The application implements Sign-In with Apple using the `AuthenticationServices` framework:

1. **Requesting Authorization**:
   The app requests the user's full name and email address:

   ```swift
   import AuthenticationServices
   import Supabase

   class AuthManager: NSObject {
       static let shared = AuthManager()
       
       func startAppleSignIn() {
           let provider = ASAuthorizationAppleIDProvider()
           let request = provider.createRequest()
           request.requestedScopes = [.fullName, .email]
           
           let controller = ASAuthorizationController(authorizationRequests: [request])
           controller.delegate = self
           controller.presentationContextProvider = self
           controller.performRequests()
       }
   }
   
   extension AuthManager: ASAuthorizationControllerPresentationContextProviding {
       func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
           guard let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) else {
               fatalError("No key window available.")
           }
           return window
       }
   }
   ```

2. **Exchanging Apple Identity Token with Supabase**:
   Upon authorization, Apple returns an Identity Token (JWT) and an Authorization Code. The app sends these to the Supabase client:

   ```swift
   extension AuthManager: ASAuthorizationControllerDelegate {
       func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
           guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }
           
           guard let identityTokenData = appleCredential.identityToken,
                 let identityTokenString = String(data: identityTokenData, encoding: .utf8) else {
               print("Error: Missing Apple identity token.")
               return
           }
           
           // Optional but recommended authorization code to verify identity server-side
           let authorizationCodeString = appleCredential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
           
           Task {
               do {
                   let session = try await supabase.auth.signInWithIdToken(
                       provider: .apple,
                       idToken: identityTokenString,
                       accessToken: authorizationCodeString
                   )
                   print("Supabase Apple OAuth Login successful. User ID: \(session.user.id)")
               } catch {
                   print("Supabase Apple authentication failed: \(error.localizedDescription)")
               }
           }
       }
       
       func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
           print("Apple Sign-In failed: \(error.localizedDescription)")
       }
   }
   ```

### 1.2. Native Google Sign-In

The application uses the GoogleSignIn SDK for iOS to prompt a native OAuth dialog and fetch the Google ID token:

```swift
import GoogleSignIn
import Supabase

extension AuthManager {
    func startGoogleSignIn(presentingViewController: UIViewController) {
        GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController) { signInResult, error in
            if let error = error {
                print("Google Sign-In failed: \(error.localizedDescription)")
                return
            }
            
            guard let user = signInResult?.user,
                  let idToken = user.idToken?.tokenString else {
                print("Error: Google Sign-In result is missing idToken.")
                return
            }
            
            Task {
                do {
                    let session = try await supabase.auth.signInWithIdToken(
                        provider: .google,
                        idToken: idToken
                    )
                    print("Supabase Google OAuth Login successful. User ID: \(session.user.id)")
                } catch {
                    print("Supabase Google authentication failed: \(error.localizedDescription)")
                }
            }
        }
    }
}
```

### 1.3. Email Magic Links (Passwordless OTP) with PKCE

For passwordless flows, the application implements PKCE (Proof Key for Code Exchange) to prevent code interception on open custom redirect channels.

1. **Sending Magic Link**:
   The iOS application initiates the passwordless sign-in. The Supabase Swift SDK generates the `code_verifier` and `code_challenge` internally, caching the verifier state:

   ```swift
   func sendMagicLink(email: String) async throws {
       try await supabase.auth.signInWithOTP(
           email: email,
           redirectTo: URL(string: "https://supersauced.com/login-callback")
       )
   }
   ```

2. **Supabase Redirection Configuration**:
   In the Supabase Dashboard (`Authentication -> URL Configuration`), register the allowed redirect URIs:
   - `https://supersauced.com/login-callback` (Universal Link callback)

### 1.4. Deep Linking & Associated Domains Configuration

To process callbacks from Universal Links (or custom scheme fallbacks) and exchange authentication codes for sessions, the system is configured as follows:

1. **Associated Domains Setup**:
   Add the **Associated Domains** capability in the Xcode project and specify:

   ```
   applinks:supersauced.com
   ```

2. **Apple App Site Association (AASA) JSON Payload**:
   Host the `apple-app-site-association` file on the root web server at `https://supersauced.com/.well-known/apple-app-site-association`. The file must be served with Content-Type `application/json` and no file extension:

   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appIDs": [
             "ABC123XYZ.com.supersauced.app"
           ],
           "components": [
             {
               "/": "/login-callback",
               "comment": "Authentication & magic link redirect handler"
             }
           ]
         }
       ]
     }
   }
   ```

   *Note: For legacy compatibility with versions prior to iOS 13, include the paths parameter:*

   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "ABC123XYZ.com.supersauced.app",
           "paths": [
             "/login-callback"
           ]
         }
       ]
     }
   }
   ```

3. **URL Callbacks & Code Exchange in Swift**:
   The SwiftUI app interceptor reads the authorization code from the incoming URL query parameters and invokes the session exchange:

   ```swift
   import SwiftUI
   import Supabase

   @main
   struct SuperSaucedApp: App {
       var body: some Scene {
           WindowGroup {
               ContentView()
                   .onOpenURL { url in
                       handleIncomingURL(url)
                   }
           }
       }
       
       func handleIncomingURL(_ url: URL) {
           guard let components = pg_catalog_url_components(url),
                 let queryItems = components.queryItems else { return }
           
           if let authCode = queryItems.first(where: { $0.name == "code" })?.value {
               Task {
                   do {
                       // Exchanging the single-use OAuth code using the PKCE verifier stored in the client memory
                       let session = try await supabase.auth.exchangeCodeForSession(code: authCode)
                       print("Universal link login success. User ID: \(session.user.id)")
                   } catch {
                       print("Universal Link OAuth exchange code failure: \(error.localizedDescription)")
                   }
               }
           }
       }
       
       private func pg_catalog_url_components(_ url: URL) -> URLComponents? {
           return URLComponents(url: url, resolvingAgainstBaseURL: true)
       }
   }
   ```

---

## 2. Secure Token Storage & Session Lifecycle

To safeguard application tokens against data leakage, the Supabase access and refresh tokens must be stored in secure storage. For React Native applications in the Expo ecosystem, **`expo-secure-store`** is the primary standard for token storage, which encrypts data and restricts access based on device lock states.

---

### 2.1. Recommended Standard: `expo-secure-store` for React Native

`expo-secure-store` provides a secure, key-value storage system utilizing Keychain Services on iOS and Keystore on Android.

#### 2.1.1. Supabase Client Integration

To persist user sessions securely in a React Native app, configure the Supabase client with a custom storage adapter pointing to `expo-secure-store`. This avoids utilizing vulnerable storage mechanisms (such as standard unencrypted `AsyncStorage`).

```typescript
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

// Define a secure storage adapter for the Supabase SDK
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Failed to retrieve secure item:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('Failed to set secure item:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Failed to delete secure item:', error);
    }
  },
};

const supabaseUrl = 'https://your-supabase-instance.supabase.co';
const supabaseAnonKey = 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Set to false for native apps to prevent internal browser redirect interceptors
  },
});
```

#### 2.1.2. React Native Session Lifecycle & Proactive Refresh

Mobile apps experience complex lifecycle transitions (e.g. background suspension, offline transitions, network dropouts). A robust lifecycle and refresh architecture is required to keep sessions valid.

```
                  +-----------------------------------+
                  |   App Foregrounded / Startup      |
                  +-----------------------------------+
                                    |
                                    v
                       [Read Stored Secure Session]
                                    |
                  +-----------------+-----------------+
                  |                                   |
                  v                                   v
          [JWT Expired / < 5m]               [JWT Token Active]
                  |                                   |
                  v                                   |
      [Invoke SDK refreshSession()]                   |
                  |                                   |
        +---------+---------+                         |
        |                   |                         |
        v                   v                         |
    [Success]           [Fail: invalid_grant]         |
        |                   |                         |
        v                   v                         v
  [Save to Storage]    [Force Logout / Clear]  [Load App View]
```

1. **Event-Driven Lifecycle State Listener**:
   The app hooks into Supabase's `onAuthStateChange` listener to capture and write updated session tokens to secure storage automatically via the adapter.
2. **Proactive Foreground Refresh**:
   Since the OS suspends timers in the background, a token might expire while the app is suspended. To prevent API requests from failing upon resume, the application executes a token check and refresh when transitioning back to the active foreground state.

Here is the TypeScript hook managing both flows:

```typescript
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from './supabaseClient';

export function useAuthSession() {
  useEffect(() => {
    // 1. Listen to authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`Auth state changed: ${event}`);
      if (event === 'SIGNED_OUT') {
        // Clean up app state, purge cache, redirect to Login screen
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // User logged in or token refreshed. Session is auto-saved by ExpoSecureStoreAdapter
        console.log(`User ID: ${session?.user?.id} is active.`);
      }
    });

    // 2. Evaluate and refresh token proactively when app transitions back to foreground
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error fetching session on app foreground:', error.message);
          return;
        }

        if (session) {
          const expiresAt = session.expires_at; // UNIX timestamp in seconds
          const currentTime = Math.floor(Date.now() / 1000);
          const bufferTime = 300; // 5-minute buffer in seconds

          if (expiresAt - currentTime < bufferTime) {
            console.log('Stored session token is expired or close to expiry. Triggering proactive refresh...');
            const { error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError) {
              console.error('Failed to proactively refresh session:', refreshError.message);
              
              // Force logout if the API returns 400 (invalid_grant) due to an expired/revoked refresh token
              if (refreshError.message.includes('invalid_grant')) {
                console.warn('Invalid session credentials. Revoking local session.');
                await supabase.auth.signOut();
              }
            } else {
              console.log('Proactive session refresh succeeded.');
            }
          }
        }
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);
}
```

1. **Graceful Offline / Online Error Handling**:
   - **Offline State**: When the connection drops, token refresh requests are paused, and the networking client returns cached data. Outbound operations that require server updates (e.g. syncing Sauce Log) are queued, and the UI notifies the user.
   - **Online Reconnect**: Once the internet connection is restored, a background task triggers `supabase.auth.getSession()` to prompt the SDK to execute a deferred refresh using the stored refresh token.

---

### 2.2. Alternative Native iOS Swift Keychain Implementation

*(Note: Use this native Swift keychain implementation only if your application is not built using React Native/Expo and instead targets native iOS development directly).*

Using the native `Security` framework, token structures are registered with the `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` security attribute. This ensures token records are encrypted and unavailable when the device is locked or backed up.

```swift
import Foundation
import Security

public enum KeychainError: Error {
    case duplicateItem
    case itemNotFound
    case unhandledError(status: OSStatus)
    case invalidData
}

public final class KeychainManager {
    public static let shared = KeychainManager()
    private let service = "com.supersauced.auth"
    
    private init() {}
    
    public func save(key: String, data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        if status == errSecDuplicateItem {
            try update(key: key, data: data)
        } else if status != errSecSuccess {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    public func retrieve(key: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw KeychainError.itemNotFound
            }
            throw KeychainError.unhandledError(status: status)
        }
        
        guard let data = dataTypeRef as? Data else {
            throw KeychainError.invalidData
        }
        return data
    }
    
    public func update(key: String, data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        let attributes: [String: Any] = [
            kSecValueData as String: data
        ]
        
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        
        if status == errSecItemNotFound {
            throw KeychainError.itemNotFound
        } else if status != errSecSuccess {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    public func delete(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unhandledError(status: status)
        }
    }
}
```

#### 2.2.1. Session Lifecycle & Refresh Handling (Swift)

1. **Event-Driven Lifecycle State Listener**:

   ```swift
   import Supabase
   import Combine

   class SessionViewModel: ObservableObject {
       private var cancellables = Set<AnyCancellable>()
       
       init() {
           observeAuthChanges()
       }
       
       func observeAuthChanges() {
           supabase.auth.onAuthStateChange { [weak self] event, session in
               guard let self = self else { return }
               
               switch event {
               case .signedIn, .tokenRefreshed:
                   if let session = session {
                       self.saveSession(session)
                   }
               case .signedOut, .userDeleted:
                   self.deleteSession()
               default:
                   break
               }
           }
       }
       
       private func saveSession(_ session: Session) {
           do {
               let data = try JSONEncoder().encode(session)
               try KeychainManager.shared.save(key: "supersauced_supabase_session", data: data)
           } catch {
               print("Failed to store updated session: \(error.localizedDescription)")
           }
       }
       
       private func deleteSession() {
           do {
               try KeychainManager.shared.delete(key: "supersauced_supabase_session")
           } catch {
               print("Failed to purge session: \(error.localizedDescription)")
           }
       }
   }
   ```

2. **Proactive Foreground Refresh**:

   ```swift
   import UIKit
   import Supabase

   class AppSessionManager {
       static let shared = AppSessionManager()
       
       func setupObservers() {
           NotificationCenter.default.addObserver(
               self,
               selector: #selector(applicationWillEnterForeground),
               name: UIApplication.willEnterForegroundNotification,
               object: nil
           )
       }
       
       @objc private func applicationWillEnterForeground() {
           Task {
               await evaluateAndRefreshSession()
           }
       }
       
       private func evaluateAndRefreshSession() async {
           do {
               let data = try KeychainManager.shared.retrieve(key: "supersauced_supabase_session")
               let session = try JSONDecoder().decode(Session.self, from: data)
               
               let expiration = Date(timeIntervalSince1970: TimeInterval(session.expiresAt))
               let bufferTime: TimeInterval = 300 // 5-minute buffer
               
               if expiration.compare(Date().addingTimeInterval(bufferTime)) == .orderedAscending {
                   print("Stored access token is expired or expiring. Initiating SDK refresh...")
                   let refreshedSession = try await supabase.auth.refreshSession()
                   print("Token refresh successful. New User Session: \(refreshedSession.user.id)")
               }
           } catch KeychainError.itemNotFound {
               print("No existing session token found in Keychain.")
           } catch {
               print("Session validation or network error: \(error.localizedDescription)")
               
               if error.localizedDescription.contains("invalid_grant") || (error as NSError).code == 400 {
                   handleForceLogout()
               }
           }
       }
       
       private func handleForceLogout() {
           print("Critical: Refresh token is invalid/revoked. Performing force logout.")
           try? KeychainManager.shared.delete(key: "supersauced_supabase_session")
           
           DispatchQueue.main.async {
               NotificationCenter.default.post(name: .supabaseForceLogout, object: nil)
           }
       }
   }

   extension Notification.Name {
       static let supabaseForceLogout = Notification.Name("supabaseForceLogout")
   }
   ```

3. **Graceful Offline / Online Error Handling**:
   - **Offline State**: When connection drops, token refresh requests are paused. Outbound operations are queued.
   - **Online Reconnect**: Once internet connection is restored, a background task triggers `supabase.auth.getSession()` to prompt the SDK to execute a deferred refresh.

---

## 3. Profile Creation Trigger Mechanics

During registration, user onboarding parameters (`onboarding_survey` and `sauce_log`) are passed from the iOS client app in the signup metadata dictionary (`raw_user_meta_data`). An automated PostgreSQL trigger captures this payload and initializes the `public.user_profiles` CRM data.

### 3.1. Profile Schema CRM Column Extensions

To capture CRM preferences and the local sauce inventory, run this migration to extend the `public.user_profiles` schema:

```sql
-- Migration to support CRM onboarding and Shopify display shelf inventory
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS onboarding_survey JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS sauce_log JSONB DEFAULT '{}'::jsonb;
```

### 3.2. Secure trigger design with isolated search paths

Because this database trigger function handles system-level inserts on `auth.users` and writes to the public schema, it must be hardened against search path hijacking.

1. **`SECURITY DEFINER`**:
   Elevates execution rights to the database owner (superuser), bypasses public RLS policies, and guarantees successful insertions before RLS can be queried by the user.

2. **`SET search_path = public, pg_temp`**:
   Isolates execution context. Setting a blank or minimal search path blocks attempts to hijack operator resolution using custom-built local schemas.

3. **Qualifying System Invocations**:
   The function qualifies system functions using the `pg_catalog.` namespace (e.g., `pg_catalog.coalesce()`) to prevent operator hijacking.

4. **Robust Metadata Parsing and Safe Fallbacks**:
   The logic handles missing, incomplete, or null JSON properties, ensuring registration succeeds by defaulting values to `'{}'::jsonb`.

```sql
-- Create or replace database trigger function securely
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
    -- 1. Extract username, falling back to split email prefix if absent
    v_username := pg_catalog.coalesce(
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'preferred_username',
        pg_catalog.split_part(NEW.email, '@', 1)
    );

    -- 2. Validate and map JSONB metadata, fallback to empty JSONB object '{}' to prevent trigger failure
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

    -- 3. Resolve username collisions to avoid unique constraint violations
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username = v_username) THEN
        v_username := v_username || '_' || pg_catalog.substring(pg_catalog.md5(pg_catalog.random()::text) from 1 for 6);
    END IF;

    -- 4. Perform profile record insertion
    INSERT INTO public.user_profiles (
        id, 
        username, 
        email, 
        full_name, 
        avatar_url, 
        onboarding_survey, 
        sauce_log,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_username,
        NEW.email,
        pg_catalog.coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        pg_catalog.coalesce(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
        v_onboarding_survey,
        v_sauce_log,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp()
    );

    RETURN NEW;
END;
$$;

-- Securely bind trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 4. Shopify Synchronization: "Display Shelf" Sync Architecture

The Super Sauced app uses a **Display Shelf** sync model: Shopify manages sales, checkouts, and catalog status, while Supabase mirrors a subset of inventory quantities and logs user purchases for fast local data access.

```
+---------------+                    +---------------+                    +---------------+
|               |  1. orders/paid    |  Supabase     |  2. Match email    |   Supabase    |
|   Shopify     |------------------->|  Edge Func    |------------------->|   Database    |
|   Webhook     |  (Signed POST)     |  (Verify Sig) |  & update log      | (user_profiles|
|               |                    |               |                    |  .sauce_log)  |
+---------------+                    +---------------+                    +---------------+
```

### 4.1. Webhook Signature Verification (TypeScript/Deno)

Shopify posts a signed JSON payload to `/functions/v1/shopify-webhook` for every paid checkout event. To prevent spoofing, the Supabase Edge Function verifies the request signature against a shared secret using Deno's Web Crypto API:

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") || "";

async function verifyShopifySignature(req: Request, rawBody: string): Promise<boolean> {
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return false;

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Convert Shopify's Base64 HMAC signature to bytes
  const signatureBytes = new Uint8Array(
    atob(hmacHeader).split("").map((c) => c.charCodeAt(0))
  );

  return await crypto.subtle.verify(
    "HMAC",
    secretKey,
    signatureBytes,
    encoder.encode(rawBody)
  );
}

serve(async (req) => {
  try {
    const rawBody = await req.clone().text();
    
    // Verify payload integrity
    const isAuthentic = await verifyShopifySignature(req, rawBody);
    if (!isAuthentic) {
      console.error("Signature verification failed.");
      return new Response(JSON.stringify({ error: "Unauthorized Signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const payload = JSON.parse(rawBody);
    const email = payload.email || payload.customer?.email;
    const lineItems = payload.line_items || [];

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing customer identifier" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Process lineItems to update user inventory in Supabase...
    console.log(`Successfully verified order for: ${email}`);
    
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
```

### 4.2. Sauce Log Mapping & Inventory Integration

Purchased line items from the webhook payload are mapped using variant SKUs to the `sauce_log` JSONB column in `public.user_profiles`.

1. **Sauce Log JSONB Schema**:
   The `sauce_log` maps SKU keys to quantities and order metadata:

   ```json
   {
     "inventory": {
       "SKU-CUBE-SPICY": {
         "quantity": 3,
         "last_updated": "2026-06-24T04:00:00Z"
       },
       "SKU-SAUCE-HABANERO": {
         "quantity": 1,
         "last_updated": "2026-06-24T04:00:00Z"
       }
     }
   }
   ```

2. **Increment SQL Modifier**:
   The Edge Function executes this secure SQL helper to update inventories in Supabase:

   ```sql
   CREATE OR REPLACE FUNCTION public.add_to_sauce_log(p_user_id UUID, p_sku TEXT, p_quantity INT)
   RETURNS VOID
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
   BEGIN
       UPDATE public.user_profiles
       SET sauce_log = jsonb_set(
           pg_catalog.coalesce(sauce_log, '{"inventory":{}}'::jsonb),
           ARRAY['inventory', p_sku],
           jsonb_build_object(
               'quantity', pg_catalog.coalesce((sauce_log->'inventory'->p_sku->>'quantity')::int, 0) + p_quantity,
               'last_updated', pg_catalog.to_jsonb(pg_catalog.clock_timestamp())
           )
       )
       WHERE id = p_user_id;
   END;
   $$;
   ```

3. **Anonymous Guest Checkout Sync Queue**:
   If a user completes a purchase on Shopify as a guest before registering an account, the Edge Function logs the credit to `public.pending_sauce_log_credits`:

   ```sql
   CREATE TABLE public.pending_sauce_log_credits (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email TEXT NOT NULL,
       sku TEXT NOT NULL,
       quantity INT NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```

   When the user eventually registers with their matching email, the `handle_new_user()` trigger scans for pending records, updates the user's `sauce_log`, and deletes the processed queue entries.

### 4.3. Loyalty Coupon Generation Flow

To incentivize engagement, when a user completes a cooking milestone (e.g. logs cooking 5 unique SKUs in `sauce_log`), a single-use Shopify coupon is generated.

```
+------------------+          1. Reach Milestone          +-------------------+
|                  |------------------------------------->|  Supabase DB      |
|   iOS App UI     |                                      |  Trigger Webhook  |
|                  |<-------------------------------------|  on sauce_log     |
+------------------+                                      +-------------------+
        ^                                                           |
        | 4. Display Code                                           v
+------------------+          3. Generate Coupon          +-------------------+
|  Supabase DB     |<-------------------------------------|  Supabase Edge    |
|  user_rewards    |                                      |  Function         |
+------------------+                                      +-------------------+
                                                                    |
                                                                    | 2. Shopify GraphQL
                                                                    v
                                                          +-------------------+
                                                          |  Shopify Admin    |
                                                          |  GraphQL API      |
                                                          +-------------------+
```

1. **Triggering Coupon Generation**:
   A database trigger monitors `sauce_log` changes. When eligibility criteria are met (e.g. total unique cooked items >= 5), it sends a webhook payload to the Supabase Edge Function `/functions/v1/generate-milestone-coupon`.

2. **Shopify Admin GraphQL Query**:
   The Supabase Edge Function requests coupon generation via the Shopify Admin GraphQL API:

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

   **GraphQL Variable Dictionary**:

   ```json
   {
     "basicDiscount": {
       "title": "Super Sauced Milestone - $10 Off",
       "code": "SAUCED-MS5-981A",
       "startsAt": "2026-06-24T00:00:00Z",
       "endsAt": "2026-12-31T23:59:59Z",
       "customerSelection": {
         "customers": {
           "add": ["gid://shopify/Customer/987654321"]
         }
       },
       "customerGets": {
         "value": {
           "discountAmount": {
             "amount": 10.0,
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

3. **UI Display & Redemption**:
   - The generated discount code is stored in the database under `public.user_rewards` and displayed on the user's profile screen.
   - For redemption, the iOS app deep links the user directly to checkout with the discount code pre-applied:
     `https://shop.supersauced.com/cart/{variant_id}:{qty}?discount=SAUCED-MS5-981A`

---

## 5. Verification & Testing Playbook

Use these validation scripts to test the database trigger and verify the profile creation logic:

### 5.1. Trigger Function Security Check

Verify the execution privileges are restricted:

```sql
SELECT routine_schema, routine_name, security_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';
-- Assert: Result displays 'security_type = DEFINER'
```

### 5.2. Metadata Verification Script

Test the trigger's parsing, fallback mapping, and collision handling using this script:

```sql
BEGIN;

-- Scenario A: Complete survey and inventory metadata
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'complete_meta@test.com',
  '{"onboarding_survey": {"dietary_preferences": ["gluten-free"]}, "sauce_log": {"SKU-CUBE-SPICY": 4}}'::jsonb
);

SELECT * FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000001';
-- Assert: onboarding_survey -> 'dietary_preferences' = ["gluten-free"]
-- Assert: sauce_log = {"SKU-CUBE-SPICY": 4}

-- Scenario B: Missing or null metadata keys
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'missing_keys@test.com',
  '{"onboarding_survey": null, "sauce_log": null}'::jsonb
);

SELECT * FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000002';
-- Assert: onboarding_survey = '{}'::jsonb
-- Assert: sauce_log = '{}'::jsonb

-- Scenario C: Entirely NULL metadata dictionary
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'null_dictionary@test.com',
  NULL
);

SELECT * FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000003';
-- Assert: onboarding_survey = '{}'::jsonb
-- Assert: sauce_log = '{}'::jsonb

ROLLBACK;
```
