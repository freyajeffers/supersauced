# Super Sauced Documentation

<!-- toc -->

## Overview

**Super Sauced** is a fast‑to‑meal mobile and web platform that lets users discover, save, and cook recipes. This repository contains the full technical documentation for the MVP, including architecture diagrams, API specifications, authentication flows, data‑fetching strategy, analytics setup, build & deployment processes, and more.

## Documentation Index

| Section | File |
|---------|------|
| Project Overview | [project_overview.md](docs/project_overview.md) |
| Authentication & Onboarding | [auth_integration.md](docs/auth_integration.md) |
| Data Fetching & Caching (TanStack Query) | [data_fetching.md](docs/data_fetching.md) |
| Analytics (PostHog & Firebase) | [analytics_documentation.md](docs/analytics_documentation.md) |
| Cloudinary Media Integration | [cloudinary_integration.md](docs/cloudinary_integration.md) |
| Content Workflow (Directus ↔ Supabase) | [content_workflow.md](docs/content_workflow.md) |
| API Specification (OpenAPI) | [api_spec.yaml](docs/api_spec.yaml) |
| Build & Deployment (EAS + Vercel) | [build_deployment.md](docs/build_deployment.md) |
| Supabase Edge Functions | [supabase_edge_functions.md](docs/supabase_edge_functions.md) |
| Progress Log | [progress_log.md](docs/progress_log.md) |
| Validation & Schema Checks | [project_overview.md](docs/project_overview.md) (contains validation summary) |

## Quick Links

- **HTML version** of the docs can be found in the `docs_html/` directory after running `npm run generate-docs`.
- **OpenAPI UI**: Run `npx -y swagger-ui-dist@latest` with `docs/api_spec.yaml` to explore the API.

## How to Contribute

1. Fork the repository.
2. Make changes to the markdown files under `docs/`.
3. Run the validation script (`npm run validate-docs`) to ensure all docs and schemas are consistent.
4. Submit a pull request.

---

*Keep this README up‑to‑date as new documentation files are added.*

## Deploying Supabase Edge Functions

To deploy all edge functions locally, run the helper script:

```bash
cd backend/supabase/functions
./deploy_edge_functions.sh
```

Make sure you have the Supabase CLI installed and are logged in.

