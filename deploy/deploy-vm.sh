#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[deploy] repo: ${REPO_ROOT}"
echo "[deploy] pulling latest main..."
git pull --ff-only origin main

echo "[deploy] building frontend..."
npm --prefix frontend run build

echo "[deploy] restarting pm2 app..."
pm2 restart projectamo-backend --update-env

echo "[deploy] validating nginx..."
sudo nginx -t

echo "[deploy] reloading nginx..."
sudo systemctl reload nginx

echo "[deploy] health check..."
curl --fail --silent http://127.0.0.1:3001/api/health
echo

echo "[deploy] done"
