#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ -d .git ]; then
  git pull --ff-only
fi

python3 scripts/import_equipment_brands.py
python3 scripts/import_equipment_models.py
docker builder prune -af || true
docker image prune -af || true
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
