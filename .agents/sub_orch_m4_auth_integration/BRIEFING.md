# BRIEFING — 2026-06-23T16:07:20-07:00

## Mission
Document Apple/Google/Magic Link flows, secure storage, trigger execution, and Shopify synchronization in `/home/freya/supersauced/docs/auth_integration.md`.

## 🔒 My Identity
- Archetype: sub_orch
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/freya/supersauced/.agents/sub_orch_m4_auth_integration
- Original parent: parent
- Original parent conversation ID: 7b3a5446-fb32-424c-8248-5bd4bb01ea15

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/freya/supersauced/.agents/sub_orch_m4_auth_integration/SCOPE.md
1. **Decompose**: Decompose the task of documenting the Auth & Onboarding Flow into subtasks and milestones.
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Spawn Explorers, Worker, Reviewers, Challenger, Auditor to produce and verify `docs/auth_integration.md`.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at 16 spawns.
- **Work items**:
  1. Initialize working files and heartbeat cron [pending]
  2. Spawn explorers to analyze existing codebase schema and instructions [pending]
  3. Spawn worker to write `docs/auth_integration.md` [pending]
  4. Spawn reviewers to verify accuracy and completeness [pending]
  5. Spawn challenger to verify flows and triggers [pending]
  6. Spawn auditor to check integrity [pending]
- **Current phase**: 1
- **Current focus**: Initial setup and heartbeat initialization

## 🔒 Key Constraints
- Document Apple/Google/Magic Link flows, Keychain storage, profile triggers, and Shopify sync.
- Read schema.sql and instructions.md for context.
- Never reuse a subagent after it has delivered its handoff.
- Only modify metadata/state files (.md) in .agents/ folder directly. All source code/docs changes must be done by subagents.

## Current Parent
- Conversation ID: b3854195-0fc8-43fc-8148-3b265f7e700a
- Updated: 2026-06-23T23:08:01Z

## Key Decisions Made
- Use Project Orchestrator iteration loop: 3 Explorers, 1 Worker, 2 Reviewers, 2 Challengers, 1 Forensic Auditor.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| Explorer 1 | teamwork_preview_explorer | Explore Auth/Onboarding | failed | 07d537c0-e4c8-43d6-99ff-6ad3f072c930 |
| Explorer 2 | teamwork_preview_explorer | Explore Auth/Onboarding | failed | c22c6745-859d-4c5b-bfcc-4cd668f7178a |
| Explorer 3 | teamwork_preview_explorer | Explore Auth/Onboarding | failed | 7b848962-fac8-4ed9-abdc-ed9d779435d5 |
| Explorer 1 Gen 2 | teamwork_preview_explorer | Explore Auth/Onboarding | completed | c53f57c5-a657-4fdc-85cf-a80b56f2d566 |
| Explorer 2 Gen 2 | teamwork_preview_explorer | Explore Auth/Onboarding | completed | a0ec54aa-2b0e-428a-962f-b8462f30e676 |
| Explorer 3 Gen 2 | teamwork_preview_explorer | Explore Auth/Onboarding | completed | 0df56c91-1a9c-44ea-acab-258e0bb1073a |
| Worker 1 | teamwork_preview_worker | Write docs/auth_integration.md | completed | 2632780a-f8c3-44eb-9206-cc0d6c0529cf |
| Reviewer 1 | teamwork_preview_reviewer | Review docs/auth_integration.md | in-progress | 36e16ff5-84b3-4937-88ef-2a19f2714812 |
| Reviewer 2 | teamwork_preview_reviewer | Review docs/auth_integration.md | in-progress | f18ce2aa-846d-4d92-bd20-1e24393de6e7 |
| Challenger 1 | teamwork_preview_challenger | Challenge trigger/flows | in-progress | 7c3f1634-5771-4474-860e-3ea193c255ec |
| Challenger 2 | teamwork_preview_challenger | Challenge trigger/flows | in-progress | 0f0d8a79-e5c8-4237-82bf-10bc22c1517d |
| Forensic Auditor | teamwork_preview_auditor | Audit integrity/completeness | in-progress | ab851460-9bdf-4599-a3fc-35e46894b6d6 |

## Succession Status
- Succession required: no
- Spawn count: 12 / 16
- Pending subagents: 36e16ff5-84b3-4937-88ef-2a19f2714812, f18ce2aa-846d-4d92-bd20-1e24393de6e7, 7c3f1634-5771-4474-860e-3ea193c255ec, 0f0d8a79-e5c8-4237-82bf-10bc22c1517d, ab851460-9bdf-4599-a3fc-35e46894b6d6
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-11
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /home/freya/supersauced/.agents/sub_orch_m4_auth_integration/progress.md — heartbeat progress tracker
- /home/freya/supersauced/.agents/sub_orch_m4_auth_integration/SCOPE.md — milestone sub-orchestration scope
- /home/freya/supersauced/docs/auth_integration.md — main deliverable document
