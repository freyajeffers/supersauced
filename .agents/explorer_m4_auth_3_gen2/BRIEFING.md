# BRIEFING — 2026-06-24T04:00:09Z

## Mission
Explore schema.sql and instructions.md to recommend a strategy for auth_integration.md focusing on OAuth, iOS Keychain, Supabase triggers, and Shopify sync.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Investigator, Reporter
- Working directory: /home/freya/supersauced/.agents/explorer_m4_auth_3_gen2
- Original parent: c7758f0b-9d8e-4eb3-9481-1c5f21192d5c
- Milestone: Milestone 4 (Auth & Onboarding Flow)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Network Restrictions: CODE_ONLY network mode. No external HTTP requests.

## Current Parent
- Conversation ID: c7758f0b-9d8e-4eb3-9481-1c5f21192d5c
- Updated: 2026-06-24T04:01:30Z

## Investigation State
- **Explored paths**:
  - `/home/freya/supersauced/docs/schema.sql` (found terminal corruption in lines 56-57 and missing profile columns)
  - `/home/freya/supersauced/instructions.md` (identified Display Shelf and user_profiles structures)
  - `/home/freya/supersauced/docs/validate.sql` (mapped out profile onboarding/sauce_log assertions)
- **Key findings**:
  - Identified schema mismatch in `schema.sql` where `onboarding_survey` and `sauce_log` columns are omitted, causing `validate.sql` execution failure.
  - Formulated a comprehensive authentication, secure Keychain, secure SECURITY DEFINER profile trigger, and Shopify sync model.
- **Unexplored areas**:
  - Actual deployment or execution of Shopify API due to CODE_ONLY constraints.

## Key Decisions Made
- Recommending native OAuth (Apple/Google ID token signIn) instead of web-based redirects for better UX.
- Requiring Keychain storage with `kSecAttrAccessibleAfterFirstUnlock` for session tokens.
- Explicitly setting `search_path` and fully qualifying table references in the trigger to eliminate security hijacking vulnerabilities.

## Artifact Index
- `/home/freya/supersauced/.agents/explorer_m4_auth_3_gen2/analysis.md` — Detailed strategic findings and implementation code blocks.
- `/home/freya/supersauced/.agents/explorer_m4_auth_3_gen2/handoff.md` — Milestone handoff documentation.
