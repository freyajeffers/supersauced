## 2026-06-24T04:01:40Z

You are Worker 1 for Milestone 4 (Auth & Onboarding Flow).
Your working directory is `/home/freya/supersauced/.agents/worker_m4_auth_1`.
Please initialize your `progress.md` in your working directory.

Your task:
Write the complete documentation for the Authentication & Onboarding integration in `/home/freya/supersauced/docs/auth_integration.md`.
Please read the recommendations and analyses written by the Explorers:
- `/home/freya/supersauced/.agents/explorer_m4_auth_1_gen2/analysis.md`
- `/home/freya/supersauced/.agents/explorer_m4_auth_2_gen2/analysis.md`
- `/home/freya/supersauced/.agents/explorer_m4_auth_3_gen2/analysis.md`

Your document MUST meet these requirements:
1. Document Apple/Google/Magic Link flows, specifying Native SDK flows (ASAuthorizationAppleIDProvider and GoogleSignIn SDK) and deep link configuration (Universal Links setup, Associated Domains, apple-app-site-association JSON payload, and redirection handling).
2. Detail secure token storage (Keychain Services API: SecItemAdd, SecItemUpdate, SecItemCopyMatching, SecItemDelete) using SwiftUI/Swift code blocks. Detail session refresh handling (automatic SDK refresh, offline/online token refresh handling, and force logout logic on invalid_grant).
3. Detail the profile creation trigger mechanics mapping `auth.users` raw metadata (`onboarding_survey` and `sauce_log`) to `public.user_profiles`. Document the database trigger `on_auth_user_created` and `handle_new_user()` with `SECURITY DEFINER` and safe `search_path` setup.
4. Detail the Shopify sync integration: "Display Shelf" model where user profile/sauce log updates trigger synchronization with Shopify for commerce/inventory data. Show HMAC webhook signature verification (X-Shopify-Hmac-Sha256) in TypeScript/JavaScript, and show mapping to `sauce_log` JSONB column. Show Shopify coupon generation and redemption flow.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When done, run any verification if applicable, write `handoff.md`, and send a message back to the parent sub-orchestrator (conversation ID: c7758f0b-9d8e-4eb3-9481-1c5f21192d5c).
