## 2026-06-23T23:02:09Z
You are teamwork_preview_worker.
Your identity is: worker_m1_it2_1
Your working directory is: /home/freya/supersauced/.agents/worker_m1_it2_1

Mission:
Implement the database schema refactoring and fixes for Milestone 1.

Input Information:
- Core schema file: `/home/freya/supersauced/docs/schema.sql`
- Explorer Analysis: `/home/freya/supersauced/.agents/explorer_m1_it2_3/analysis.md`
- Explorer Handoff: `/home/freya/supersauced/.agents/explorer_m1_it2_3/handoff.md`

Tasks:
1. Strip all mock setup code (auth schema, auth.users table, auth.uid() stub) from `/home/freya/supersauced/docs/schema.sql`.
2. Create a new development script `/home/freya/supersauced/docs/local_mock_setup.sql` containing the local auth schema and stubs for auth.uid() and auth.jwt(), as recommended by the explorer.
3. Update the trigger function `public.handle_new_user()` in `/home/freya/supersauced/docs/schema.sql` to handle JSON nulls correctly using `COALESCE(NULLIF(..., 'null'::jsonb), '{}'::jsonb)`.
4. Add separate RLS SELECT policies for `public.recipes`, `public.recipe_ingredients`, and `public.recipe_steps` allowing read access if `auth.jwt() ->> 'role' = 'cms_editor'`.
5. Implement `verify_schema.sh` and `validate.sql` inside your working directory `/home/freya/supersauced/.agents/worker_m1_it2_1/`. Use the script and query structures detailed in `/home/freya/supersauced/.agents/explorer_m1_it2_3/analysis.md`.
6. Run `verify_schema.sh` to compile the mock setup and the schema, run the validation tests, and verify everything passes (exit code 0).

Output Requirements:
- Updated `/home/freya/supersauced/docs/schema.sql` and new `/home/freya/supersauced/docs/local_mock_setup.sql`.
- Saved `verify_schema.sh` and `validate.sql` inside your working directory.
- Update `/home/freya/supersauced/.agents/worker_m1_it2_1/progress.md` with your status.
- Once done, write a detailed `/home/freya/supersauced/.agents/worker_m1_it2_1/handoff.md` showing verification test results and send a message back to parent orchestrator (conversation ID: 37f21c55-a02a-438c-aacd-97408e3e8106).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
