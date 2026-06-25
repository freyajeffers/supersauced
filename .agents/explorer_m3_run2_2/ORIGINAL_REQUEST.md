## 2026-06-24T21:49:10Z
You are a read-only exploration agent. Your working directory is: /home/freya/supersauced/.agents/explorer_m3_run2_2.
Your task is to investigate and design the implementation strategy for Milestone 3: FastAPI Recipes & Steps.

Please:
1. Read the API spec at `/home/freya/supersauced/docs/api_spec.yaml` for:
   - GET, POST `/recipes`
   - GET, PUT, DELETE `/recipes/{id}`
   - GET, POST `/recipe_ingredients`
   - GET, PUT, DELETE `/recipe_ingredients/{id}`
   - GET, POST `/recipe_steps`
   - GET, PUT, DELETE `/recipe_steps/{id}`
2. Read the database migration files under `/home/freya/supersauced/backend_guide/database/migrations/` to understand the table schema, GIN indexes, and RLS policies.
3. Inspect the existing FastAPI app structure, Pydantic schemas, dependencies (`app/api/deps.py`), config, security, auth and profiles routers to understand the coding standards and patterns.
4. Detail exactly:
   - What schemas need to be defined (Pydantic models for Recipes, Ingredients, Steps) in `/home/freya/supersauced/backend_guide/app/schemas/`.
   - How the routers in `/home/freya/supersauced/backend_guide/app/api/v1/` should be structured for Recipes, Ingredients, and Steps, and how they should be registered in `app/main.py`.
   - How to implement tags array filtering (query parameters `cube_tags` and `dietary_tags` for GET `/recipes`) using Supabase client (e.g. comma-separated parsing and mapping to PostgreSQL contains/overlaps query).
   - How to handle authentication (verify JWT via local verification, construct user-scoped client) and authorize writes (POST, PUT, DELETE). Note that recipes/ingredients/steps RLS select policies allow read access for published recipes, or for users with the role 'cms_editor'. Evaluate how updates/inserts/deletes should be handled (do they require 'cms_editor' role? or should they use the service client / user client?).
   - Detailed plans for pytest units and integrations under `/home/freya/supersauced/backend_guide/tests/` (e.g. mock queries and responses, checking authentication, filtering, and error handling).
5. Produce a detailed handoff report in `/home/freya/supersauced/.agents/explorer_m3_run2_2/handoff.md` summarizing your findings and recommended strategy. Do not write any code files directly. Update `/home/freya/supersauced/.agents/explorer_m3_run2_2/progress.md` to track your progress and set your liveness timestamp.
