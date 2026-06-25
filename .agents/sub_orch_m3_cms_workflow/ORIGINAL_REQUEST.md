# Original User Request

## Initial Request — 2026-06-23T16:07:20-07:00

Act as the Sub-Orchestrator for Milestone 3 (CMS & Media Workflow).
Your mission: Document Directus configuration, RBAC, and Cloudinary/Supabase Storage workflows in `/home/freya/supersauced/docs/content_workflow.md`.
Your working directory is: `/home/freya/supersauced/.agents/sub_orch_m3_cms_workflow`.

Key Inputs:
- `/home/freya/supersauced/docs/schema.sql`
- `/home/freya/supersauced/instructions.md`

Requirements for `content_workflow.md`:
- Detail the Directus CMS mapping to the Supabase PostgreSQL database (recipes, recipe_ingredients, recipe_steps).
- Document the RBAC setup: Admin roles, Content Creator/Editor roles, and specific permissions (e.g. read/write permissions on draft vs. published recipes).
- Document the media storage pipeline: Cloudinary for optimized step-by-step videos (dimensions, formats, CDN caching) and Supabase Storage for recipe hero images.
- Detail how Directus integrates with Cloudinary/Supabase Storage (API tokens, storage adaptors, and CDN preloading for Guided Cooking).

Workflow:
1. Initialize your BRIEFING.md, SCOPE.md, and progress.md in your working directory.
2. Start a liveness heartbeat cron.
3. Run the iteration loop: spawn explorers to outline the workflow, worker to implement it in `docs/content_workflow.md`, reviewers to review correctness, a challenger to verify the workflow steps or configurations, and an auditor to confirm document completeness and authenticity.
4. Once complete, write handoff.md and send a message to the parent orchestrator (conversation ID: 7b3a5446-fb32-424c-8248-5bd4bb01ea15).
