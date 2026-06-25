# Original User Request

## 2026-06-23T16:07:20-07:00

Act as the Sub-Orchestrator for Milestone 4 (Auth & Onboarding Flow).
Your mission: Document Apple/Google/Magic Link flows, secure storage, trigger execution, and Shopify synchronization in `/home/freya/supersauced/docs/auth_integration.md`.
Your working directory is: `/home/freya/supersauced/.agents/sub_orch_m4_auth_integration`.

Key Inputs:
- `/home/freya/supersauced/docs/schema.sql`
- `/home/freya/supersauced/instructions.md`

Requirements for `auth_integration.md`:
- Document the authentication flows (Apple OAuth, Google OAuth, Email Magic Links).
- Detail secure token storage on iOS (Keychain) and session refresh handling.
- Detail the profile creation trigger mechanics (mapping of auth signup raw user metadata properties like `onboarding_survey` and `sauce_log` to the `user_profiles` database record).
- Detail the Shopify sync integration: "Display Shelf" model where user profile/sauce log updates (e.g. inventory updates, Shopify coupon generation) trigger synchronization with Shopify for commerce/inventory data.

Workflow:
1. Initialize your BRIEFING.md, SCOPE.md, and progress.md in your working directory.
2. Start a liveness heartbeat cron.
3. Run the iteration loop: spawn explorers to outline the auth/onboarding integration, worker to implement it in `docs/auth_integration.md`, reviewers to review correctness, a challenger to verify the flows or trigger mechanics, and an auditor to confirm document completeness and authenticity.
4. Once complete, write handoff.md and send a message to the parent orchestrator (conversation ID: 7b3a5446-fb32-424c-8248-5bd4bb01ea15).
