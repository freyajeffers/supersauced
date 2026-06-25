## 2026-06-23T21:02:32-07:00
You are the Worker for Milestone 3 (CMS & Media Workflow).
Your working directory is: /home/freya/supersauced/.agents/teamwork_preview_worker_m3.
Your parent conversation ID is: 0123ff98-7ca2-402f-8d73-7c032eadebd1.

Your task is to merge, enrich, and rewrite the documentation in `/home/freya/supersauced/docs/content_workflow.md` to establish a complete Content Workflow and Integration Guide.

You MUST read the following key input files:
- /home/freya/supersauced/instructions.md
- /home/freya/supersauced/docs/schema.sql
- /home/freya/supersauced/.agents/teamwork_preview_explorer_m3_1_gen2/handoff.md
- /home/freya/supersauced/.agents/teamwork_preview_explorer_m3_2_gen2/proposed_content_workflow_rbac.md
- /home/freya/supersauced/.agents/teamwork_preview_explorer_m3_3_gen2/proposed_content_workflow_media_section.md

Requirements for content_workflow.md:
1. Detail the Directus CMS mapping to the Supabase PostgreSQL database (recipes, recipe_ingredients, recipe_steps). Ensure database columns align perfectly with Directus collections and fields. Detail UI interfaces (Toggle, Dropdown with choices, Numeric input with decimal step 0.1 for ingredients quantity) and validation settings (O2M nested tables, deferrable unique constraint on (recipe_id, step_number)).
2. Document the RBAC setup: Admin roles, Content Creator/Editor roles, and specific permissions (e.g. read/write permissions on draft vs. published recipes). Provide direct collection-level filter JSONs for Creators/Editors and database-level Supabase RLS policies (SQL code).
3. Document the media storage pipeline: Cloudinary for optimized step-by-step videos (MP4 H.264 profile, resolution 720p/1080p, 10MB limit, dynamic f_auto/q_auto caching parameters) and Supabase Storage for recipe hero images (public bucket, caching header Cache-Control: public, max-age=31536000, immutable).
4. Detail how Directus integrates with Cloudinary/Supabase Storage (API tokens, S3 storage adaptor environment variables, event hooks for automated uploads).
5. Document CDN preloading mechanics for Guided Cooking (sliding window caching logic, including React Native / Expo FileSystem code).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please write the updated content to `/home/freya/supersauced/docs/content_workflow.md` (overwriting the old one). Provide a handoff report at `/home/freya/supersauced/.agents/teamwork_preview_worker_m3/handoff.md` and send a message back to the parent (conversation ID: 0123ff98-7ca2-402f-8d73-7c032eadebd1).
