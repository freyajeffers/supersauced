#!/usr/bin/env bash
set -euo pipefail

# 1. Configuration
CONTAINER_NAME="supersauced-db-stress-verifier-$(date +%s)"
PG_IMAGE="postgres:16"

echo "========================================="
echo "Starting Database Stress & Security Verification"
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
echo "Loading auth schema mocks (docs/local_mock_setup.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/local_mock_setup.sql

echo "Loading database schema (docs/schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/schema.sql

echo "Executing functional validation suite (docs/test_schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/test_schema.sql

echo "Executing adversarial validation suite (docs/adversarial_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/adversarial_tests.sql

echo "Executing custom stress test suite (docs/stress_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stress_tests.sql

echo "Executing concurrent user profile insert stress test..."
./docs/concurrent_inserts.sh "$CONTAINER_NAME"

echo "========================================="
echo "SUCCESS: All Stress & Security Verifications Passed!"
echo "========================================="
exit 0
