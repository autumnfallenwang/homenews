#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="homenews-postgres"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping container '${CONTAINER_NAME}'..."
  docker stop "${CONTAINER_NAME}"
  echo "Stopped."
else
  echo "Container '${CONTAINER_NAME}' is not running."
fi
