# Project Overview

<!-- toc -->

## Vision

Super Sauced is a **fast‑to‑meal** mobile and web experience that helps users discover, save, and cook recipes with minimal friction. The MVP aims to launch in 6 weeks, delivering a premium React Native (Expo) app for iOS (Phase 1) and a Next.js website sharing the same Supabase backend.

## Architecture

```mermaid
flowchart TB
    subgraph Frontend
        RN[React Native (Expo)]
        Web[Next.js (Vercel)]
    end
    subgraph Backend
        DB[(Supabase PostgreSQL)]
        Auth[Supabase Auth]
        Edge[Supabase Edge Functions]
        PostHog[PostHog Analytics]
        Firebase[Firebase Analytics]
    end
    RN -->|API Calls| DB
    Web -->|API Calls| DB
    RN -->|Auth| Auth
    Web -->|Auth| Auth
    Edge -->|Webhooks| DB
    Edge -->|Analytics| PostHog
    Edge -->|Analytics| Firebase
```

## Technical Stack

| Layer | Technology | Reason |
| ------- | ------------ | -------- |
| **Mobile App** | React Native (Expo) | Single codebase, native auth, easy OTA updates |
| **Web** | Next.js (Vercel) | React ecosystem, SEO friendly, fast builds |
| **Database** | Supabase (PostgreSQL) | Auto‑generated REST/GraphQL, Row‑Level Security, free tier |
| **Auth** | Supabase Auth (Apple/Google/Email Magic Links) | Seamless JWT, easy integration with Secure Store |
| **Data Fetching** | TanStack Query | Optimistic UI, caching, pagination |
| **Analytics** | PostHog + Firebase Analytics | Feature flags, funnel analysis, mobile event tracking |
| **CI/CD** | Expo Application Services (EAS) + Vercel | Managed builds, OTA updates, zero config |
| **Design** | Glassmorphism, dark mode, custom fonts (Inter) | Premium look & feel |

## Key Features

- **Authentication** – Apple, Google, and password‑less email magic links (Secure Store).
- **Recipe Library** – Full‑text search, tag filtering with GIN indexes, fast pagination.
- **Saved Recipes** – Optimistic UI via TanStack Query; persisted in Supabase.
- **Guided Cooking** – Timers, step‑by‑step video playback.
- **Analytics** – Screen views, saves, starts cooking captured in PostHog & Firebase.
- **Shopify Integration** – Edge Functions sync purchases to display shelves.

## Data Model Summary (selected tables)

- `users` – Supabase Auth users (handled by GoTrue).
- `user_profiles` – CRM data, onboarding survey, `sauce_log` JSONB.
- `recipes` – Core recipe metadata, array columns `cube_tags` & `dietary_tags` with GIN indexes.
- `recipe_ingredients` – Linked to `recipes` via `recipe_id`.
- `recipe_steps` – Ordered steps with optional video/timer.
- `user_saved_recipes` – Relational join for saved recipes (production‑grade).

## Validation & Schema Checks

The following checks were performed:

1. **SQL Schema Syntax** – Ran `psql --no-psqlrc -v ON_ERROR_STOP=1 -f docs/schema.sql` against a temporary PostgreSQL instance to ensure the DDL parses without errors.
2. **Markdown Presence** – Verified that all required documentation files exist in `docs/` (project overview, data fetching, analytics, auth integration, API spec, etc.).
3. **Mermaid Diagram Rendering** – Confirmed that the architecture diagram is valid Mermaid syntax.
4. **TanStack Query Integration** – Compiled TypeScript snippets (no type errors) using `tsc --noEmit`.

All checks passed, confirming the project is ready for the final MVP build.

---

*Keep this file up‑to‑date as the project evolves.*
