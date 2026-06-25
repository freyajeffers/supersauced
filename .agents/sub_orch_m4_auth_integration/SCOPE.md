# Scope: Auth & Onboarding Flow (Milestone 4)

## Architecture
- Integrates iOS application (Keychain token storage, session refresh) with auth flows (Apple, Google, Magic Link).
- Supabase/PostgreSQL schema: profile creation trigger mapping metadata (`onboarding_survey`, `sauce_log`) to `user_profiles`.
- Shopify integration: "Display Shelf" model sync trigger for profile and inventory updates, and Shopify coupon generation.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Analyze Inputs & Plan | Spawn Explorers to analyze schema.sql, instructions.md, and design document structure. | none | DONE |
| 2 | Generate auth_integration.md | Spawn Worker to write the initial complete draft of docs/auth_integration.md. | M1 | DONE |
| 3 | Review & Challenge | Spawn Reviewers and Challengers to verify accuracy of authentication flows, Keychain details, database triggers, and Shopify synchronization details. | M2 | IN_PROGRESS (36e16ff5, f18ce2aa, 7c3f1634, 0f0d8a79) |
| 4 | Audit & Handoff | Spawn Forensic Auditor to verify integrity and completeness. Compile final handoff. | M3 | IN_PROGRESS (ab851460) |

## Interface Contracts
- Database triggers must map auth user metadata (onboarding survey questions, sauce log) to corresponding relational tables.
- Shopify sync events must define the payload and action mappings (e.g. inventory update events, Shopify coupon generation REST API or GraphQL endpoints).
