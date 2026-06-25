#!/usr/bin/env bash
set -euo pipefail

# 1. Configuration
CONTAINER_NAME="supersauced-db-test-${RANDOM}"

# Define cleanup function
cleanup() {
  echo "Cleaning up container ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Starting clean PostgreSQL 16 container..."
docker run --name "${CONTAINER_NAME}" -e POSTGRES_PASSWORD=postgres -d postgres:16

echo "Waiting for PostgreSQL to be ready..."
READY=false
for i in {1..30}; do
  if docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null 2>&1; then
    READY=true
    echo "PostgreSQL is ready!"
    break
  fi
  echo "Still waiting (attempt $i/30)..."
  sleep 1
done

if [ "$READY" = false ]; then
  echo "Error: PostgreSQL failed to start within 30 seconds."
  exit 1
fi

echo "Loading local_mock_setup.sql..."
docker exec -i "${CONTAINER_NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /home/freya/supersauced/docs/local_mock_setup.sql

echo "Loading schema.sql..."
docker exec -i "${CONTAINER_NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /home/freya/supersauced/docs/schema.sql

echo "Running validate.sql verification suite..."
docker exec -i "${CONTAINER_NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /home/freya/supersauced/.agents/worker_m1_it2_1/validate.sql

echo "Verification completed successfully!"
exit 0
