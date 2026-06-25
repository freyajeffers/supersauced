#!/usr/bin/env bash
set -euo pipefail

# 1. Configuration
CONTAINER_NAME="supersauced-db-verifier-$(date +%s)"
PG_IMAGE="postgres:16"

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

# Load files sequentially
echo "Loading auth schema mocks (local_mock_setup.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < local_mock_setup.sql

echo "Loading database schema (schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < schema.sql

echo "Executing functional validation suite (test_schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < test_schema.sql

echo "Executing adversarial validation suite (adversarial_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < adversarial_tests.sql

echo "Executing challenger stress validation suite (challenger_stress_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < challenger_stress_tests.sql

echo "========================================="
echo "SUCCESS: Database Schema Verification Passed"
echo "========================================="
exit 0
