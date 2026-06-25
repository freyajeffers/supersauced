#!/usr/bin/env bash
set -euo pipefail

# 1. Configuration
CONTAINER_NAME="supersauced-db-verifier-$(date +%s)"
PG_IMAGE="postgres:16"

# Determine base paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo "Starting Database Schema Verification"
echo "========================================="

# Start clean postgres instance
echo "Starting container: $CONTAINER_NAME..."
docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres -d "$PG_IMAGE" > /dev/null

# Hook for automatic cleanup on exit (normal exit or error)
cleanup() {
  echo "Stopping and removing container $CONTAINER_NAME..."
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Wait until postgres is ready inside container
echo "Waiting for database to accept connections..."
until docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done
echo "Database is ready."

# Load mock auth setup first
echo "Loading auth schema mocks (auth_mock_setup.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/mocks/auth_mock_setup.sql"

# Load migration scripts in order
echo "Running migrations..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/migrations/00001_extensions.sql"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/migrations/00002_core_schema.sql"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/migrations/00003_indexes.sql"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/migrations/00004_rls_policies.sql"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/migrations/00005_triggers.sql"

# Execute test suites
echo "Executing functional validation suite (01_functional_test.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/tests/01_functional_test.sql"

echo "Executing adversarial validation suite (02_adversarial_test.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/tests/02_adversarial_test.sql"

echo "Executing stress performance validation suite (03_stress_performance_test.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$DB_DIR/tests/03_stress_performance_test.sql"

echo "========================================="
echo "SUCCESS: Database Schema Verification Passed"
echo "========================================="
exit 0
