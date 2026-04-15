#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="homenews-postgres"
VOLUME_NAME="homenews-pgdata"
DB_NAME="homenews"
DB_USER="homenews"
DB_PASS="homenews"
DB_PORT="5433"
# pgvector/pgvector:pg17 is PostgreSQL 17 with pg_trgm + pgvector extensions
# pre-installed. Needed for Phase 15 (keyword + fuzzy + semantic search).
IMAGE="pgvector/pgvector:pg17"

# Check if container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  # Container exists — check if running
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "PostgreSQL container '${CONTAINER_NAME}' is already running."
  else
    echo "Starting existing container '${CONTAINER_NAME}'..."
    docker start "${CONTAINER_NAME}"
  fi
else
  echo "Creating new PostgreSQL container '${CONTAINER_NAME}' (${IMAGE})..."
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASS}" \
    -p "${DB_PORT}:5432" \
    -v "${VOLUME_NAME}:/var/lib/postgresql/data" \
    "${IMAGE}"
fi

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1; then
    echo "PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

echo "ERROR: PostgreSQL did not become ready in time."
exit 1
