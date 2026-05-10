#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[deploy-full] repo: ${REPO_ROOT}"
echo "[deploy-full] pulling latest main..."
git pull --ff-only origin main

echo "[deploy-full] installing backend dependencies..."
npm --prefix backend install

echo "[deploy-full] installing frontend dependencies..."
npm --prefix frontend install

echo "[deploy-full] building frontend..."
npm --prefix frontend run build

echo "[deploy-full] restarting pm2 app..."
pm2 restart projectamo-backend --update-env

echo "[deploy-full] validating nginx..."
sudo nginx -t

echo "[deploy-full] reloading nginx..."
sudo systemctl reload nginx

echo "[deploy-full] health check..."
curl --fail --silent http://127.0.0.1:3001/api/health
echo

echo "[deploy-full] done"
