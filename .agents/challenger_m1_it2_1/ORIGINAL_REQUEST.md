## 2026-06-23T16:06:18-07:00
You are teamwork_preview_challenger.
Your working directory is `/home/freya/supersauced/.agents/challenger_m1_it2_1`.
Your role is to write stress tests, generators, or verification scripts to empirically verify the correctness and robustness of the database schema and RLS setup.

You must:
1. Initialize your working directory (create BRIEFING.md, progress.md) and update them as you work.
2. Read the database files in `docs/`: `docs/schema.sql`, `docs/local_mock_setup.sql`, `docs/test_schema.sql`, `docs/verify_schema.sh`.
3. Create additional test assertions or a test script to stress-test or check edge cases of:
   - User profile triggers (e.g. inserting multiple users with complex raw metadata concurrently or in a sequence, ensuring no collisions or slow-downs).
   - RLS policy bypasses (e.g. testing that `cms_editor` cannot insert or delete, only read draft/published, unless they are admin/service_role; verifying that `anon` and `authenticated` roles are strictly blocked from writing to `recipes`, `recipe_ingredients`, `recipe_steps`).
   - Cascade delete stress test (e.g. deleting a recipe with a large number of ingredients and steps, or deleting a user with a large profile history).
   - Deferrable unique constraint on steps (e.g. verifying that a standard non-deferrable constraint would fail immediately, and verifying that the deferred constraint allows multi-step swap transactions correctly).
4. Run your tests (you can use `./docs/verify_schema.sh` or spin up a container yourself to execute them).
5. Document your tests and results in a handoff report (handoff.md) in your folder, and send a completion message to the parent (d52d13fc-f259-494f-9d21-93286c38f6d3, the Sub-Orchestrator).

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.
