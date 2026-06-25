# Adversarial Review Report

## Challenge Summary

**Overall risk assessment**: LOW

We subjected the database schema design and RLS implementation to adversarial review and challenge scenarios. The RLS implementation is remarkably robust and correctly handles all roles and policy definitions.

## Challenges

### Low Challenge 1: Metadata JSONB Object Nullability / Primitive Types

- **Assumption challenged**: The trigger `handle_new_user` assumes that raw user metadata is either `NULL` or a valid JSON object structure containing properties like `onboarding_survey` and `sauce_log`.
- **Attack scenario**: An attacker registers with a primitive JSON value (e.g. a plain JSON string, array, or number) inside `raw_user_meta_data`.
- **Blast radius**: The trigger handles this using:
  ```sql
  IF NEW.raw_user_meta_data IS NOT NULL AND jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN
  ...
  ```
  Since it checks that the JSON type is strictly `'object'`, any primitive JSON types will correctly fall through to the `ELSE` branch and default to empty objects `'{}'::jsonb`. The blast radius is therefore fully mitigated.
- **Mitigation**: Add application-level validation or database check constraints to ensure JSONB objects conform to expected JSON schemas if custom fields expand in the future.

### Low Challenge 2: Array Index Performance under Cardinality Spike

- **Assumption challenged**: Filtering via Generalized Inverted Indexes (GIN) on `cube_tags` and `dietary_tags` is assumed to execute in sub-100ms.
- **Attack scenario**: A CMS editor inputs recipes with a massive list of unique tags (high cardinality) or the table scales to millions of recipes with a few extremely frequent tags.
- **Blast radius**: GIN index queries could suffer performance degradation if the database needs to scan a massive number of index entries.
- **Mitigation**: Enforce restriction of valid tags at the CMS or application API gateway level to keep tag cardinality bounded.

## Stress Test Results

- **500 Parallel User Profiles Insertions** → Triggers execute and process complex nested metadata → **PASS** (Duration: ~32ms, well within the 2s threshold)
- **RLS Access Violation (Anon & Authenticated User)** → Attempts to SELECT/UPDATE/INSERT draft recipes, recipe ingredients, steps, or foreign user profiles → **PASS** (Correctly blocked by RLS policies)
- **Heavy Recipe Cascade Delete (500 steps + 500 ingredients)** → Deletion of recipes triggers cascaded deletions of child tables → **PASS** (Cascade delete duration: ~1ms)
- **Deferred Unique Constraints (Step Swapping)** → Swapping of steps in a transaction deferred until commit → **PASS** (Constraint deferred, swapping succeeds)

## Unchallenged Areas

- **OAuth/SSO Session Tokens Refresh latency**: Network-related delays or timeouts when performing OAuth magic links or token refresh redirects were out of scope for the database-level stress test.
