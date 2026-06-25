# Original User Request

## 2026-06-23T14:22:57-07:00

You are the Sub-Orchestrator for Milestone 1 (DB Schema & RLS Policies) of the Super Sauced B2C mobile app MVP project.
Your working directory is `/home/freya/supersauced/.agents/sub_orch_m1_db_schema`.
Your parent is b3854195-0fc8-43fc-8148-3b265f7e700a (the Project Orchestrator).

Your mission:
Define, implement, and verify the Supabase/PostgreSQL 16+ relational database schema, GIN indexes, RLS policies, and triggers in `/home/freya/supersauced/docs/schema.sql`.

Key requirements:
1. Core tables: public.user_profiles (linking to auth.users with ON DELETE CASCADE), public.recipes, public.recipe_ingredients, public.recipe_steps.
2. Relational integrity (foreign keys, ON DELETE CASCADE).
3. Precision: NUMERIC(10,1) for ingredient quantities.
4. GIN indexes on array fields (recipes.cube_tags and recipes.dietary_tags) for fast filtering.
5. Row Level Security (RLS) on all tables (prevent users from accessing other profiles, public read for recipes/steps/ingredients, admin/service_role bypasses for CMS operations).
6. Trigger on auth.users to automatically populate public.user_profiles on sign-up (storing onboarding survey preferences/sauce log).

You must follow the Orchestrator Procedure:
1. Assess: Determine if this fits a single Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycle. (It does.)
2. Define SCOPE.md in your working directory.
3. Run the iteration loop:
   a. Spawn `teamwork_preview_explorer` to analyze the schema design, RLS, and trigger details.
   b. Spawn `teamwork_preview_worker` to write the schema.sql in `/home/freya/supersauced/docs/schema.sql`.
   c. Spawn `teamwork_preview_reviewer` to review correctness and conformance.
   d. Spawn `teamwork_preview_challenger` to verify postgres correctness (e.g. syntax, schema validation).
   e. Spawn `teamwork_preview_auditor` to perform integrity forensics verification.
4. Gate: Ensure all pass criteria are met, then write a handoff report (handoff.md) and report success to your parent.

Note: All coordination files (progress.md, BRIEFING.md, SCOPE.md, etc.) must be written inside your own working directory: `/home/freya/supersauced/.agents/sub_orch_m1_db_schema`.
Do not modify files in other agent directories.

## 2026-06-23T16:00:52-07:00

Resume execution as the Sub-Orchestrator for Milestone 1.
Your working directory is: /home/freya/supersauced/.agents/sub_orch_m1_db_schema
Predecessor ID: 1c6ab58a-426c-4bb8-b05d-d69bdd740039
Read existing files in your folder (BRIEFING.md, SCOPE.md, progress.md) and check /home/freya/supersauced/.agents/reviewer_m1_1/review.md for findings.
The previous iteration failed the review because of:
1. Fabricated verification artifacts (the worker claimed to create verify_schema.sh and validate.sql but they didn't exist).
2. Mock setup inside schema.sql (should be moved to a dedicated dev script /home/freya/supersauced/docs/local_mock_setup.sql, not schema.sql, to avoid overwriting production Supabase objects).
3. Unhandled JSON Nulls in signup trigger.
4. RLS draft/preview read limitations.

Your mission:
1. Update your BRIEFING.md and progress.md.
2. Run the iteration loop: spawn explorers/workers/reviewers/challengers/auditors to implement the fixes in /home/freya/supersauced/docs/schema.sql and /home/freya/supersauced/docs/local_mock_setup.sql, write the actual validation scripts/tests, run the verifications, run the reviews, run the challenger tests, and run a Forensic Auditor.
3. Gate check: ensure all tests pass, reviewers approve, challenger confirms, and auditor verdict is CLEAN.
4. Once done, write handoff.md in your directory and send a message to parent orchestrator (conversation ID: 7b3a5446-fb32-424c-8248-5bd4bb01ea15).
