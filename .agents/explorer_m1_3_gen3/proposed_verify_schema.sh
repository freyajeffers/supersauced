#!/usr/bin/env bash
# =========================================================================
# DATABASE SCHEMA LOCAL VERIFICATION SCRIPT (verify_schema.sh)
# =========================================================================
set -euo pipefail

# Ensure working directory is the repository root
cd "$(dirname "$0")/.."

echo "========================================================="
echo "Starting Database Schema Local Verification"
echo "========================================================="

# 1. Start clean postgres 16 container
CONTAINER_NAME="supersauced-db-verify-$(date +%s)"
echo "Starting temporary PostgreSQL 16 container: $CONTAINER_NAME"
docker run --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -d postgres:16-alpine > /dev/null

# Register cleanup function to always stop/remove the container on exit
cleanup() {
  echo ""
  echo "Cleaning up: stopping and removing container $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 2. Wait for PostgreSQL to become healthy
echo -n "Waiting for PostgreSQL to start..."
PG_ISREADY=0
for i in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    PG_ISREADY=1
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ "$PG_ISREADY" -ne 1 ]; then
  echo "Error: PostgreSQL container failed to start in 30 seconds."
  exit 1
fi
echo "PostgreSQL is ready!"

# 3. Execute mock setup script
echo "Running local mock setup..."
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docs/local_mock_setup.sql

# 4. Execute schema script
echo "Compiling schema.sql..."
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docs/schema.sql

# 5. Run validation script
echo "Running validation tests..."
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docs/test_schema.sql

echo "========================================================="
echo "Verification SUCCESS! All tests passed."
echo "========================================================="
