#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="homenews-postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Removing container '${CONTAINER_NAME}'..."
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

echo "Recreating..."
exec "${SCRIPT_DIR}/db-start.sh"
