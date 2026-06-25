## 2026-06-24T04:00:09Z

You are Explorer 2 for Milestone 4 (Auth & Onboarding Flow).
Your working directory is `/home/freya/supersauced/.agents/explorer_m4_auth_2_gen2`.
Please initialize your `progress.md` and explore `/home/freya/supersauced/docs/schema.sql` and `/home/freya/supersauced/instructions.md` to recommend a structure and detailed content strategy for `/home/freya/supersauced/docs/auth_integration.md`.
Focus on:
1. Detail Apple/Google/Magic Link OAuth and passwordless signup/login flows, redirect URIs, deep linking back to iOS app.
2. iOS secure Keychain token storage (SecItemAdd, SecItemCopyMatching, etc.) and event-driven/polling session refresh mechanisms.
3. Profile creation trigger mechanics (Supabase handle_new_user() trigger mapping metadata to user_profiles table, security isolation with SECURITY DEFINER and search_path).
4. Shopify synchronization: "Display Shelf" sync architecture, coupon generation, inventory sync trigger logic.

Write your findings to `analysis.md` in your working directory. When done, write your `handoff.md` and send a message back to the parent sub-orchestrator (conversation ID: c7758f0b-9d8e-4eb3-9481-1c5f21192d5c).
