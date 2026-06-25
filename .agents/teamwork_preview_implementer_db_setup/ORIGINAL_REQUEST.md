## 2026-06-24T17:23:30Z

Set up the database guide and implementation under backend_guide/database/. Follow the modular recommendations from Explorer 1 and 3:
1. Create the migrations folder containing versioned migration scripts (00001_extensions.sql, 00002_core_schema.sql, 00003_indexes.sql, 00004_rls_policies.sql, 00005_triggers.sql).
2. Create mocks/auth_mock_setup.sql for local development.
3. Create tests/ directory with 01_functional_test.sql, 02_adversarial_test.sql, and 03_stress_performance_test.sql.
4. Create scripts/verify_schema.sh which uses a postgres:16 Docker container to run all migrations and test suites, verifying that everything passes. Ensure it runs and verifies successfully.
5. Create a detailed backend_guide/database/README.md detailing schema design, RLS policies, migrations, and verification steps.
