#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="supersauced-local-verifier-$(date +%s)"
PG_IMAGE="postgres:16"

echo "========================================="
echo "Starting Database Schema Verification"
echo "========================================="

echo "Starting container: $CONTAINER_NAME..."
docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres -d "$PG_IMAGE" > /dev/null

cleanup() {
  echo "Stopping and removing container $CONTAINER_NAME..."
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Waiting for database to accept connections..."
until docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done
echo "Database is ready."

echo "Loading auth schema mocks (docs/local_mock_setup.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/local_mock_setup.sql

echo "Loading proposed database schema (.agents/explorer_m2_2_retry/proposed_schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < .agents/explorer_m2_2_retry/proposed_schema.sql

echo "Executing functional validation suite (docs/test_schema.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/test_schema.sql

echo "Executing adversarial validation suite (docs/adversarial_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/adversarial_tests.sql

echo "Executing challenger stress validation suite (docs/challenger_stress_tests.sql)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/challenger_stress_tests.sql

echo "========================================="
echo "SUCCESS: Database Schema Verification Passed"
echo "========================================="
exit 0
