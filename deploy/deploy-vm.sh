#!/usr/bin/env bash
set -euo pipefail

exec 9>/tmp/projectamo-deploy.lock
flock -n 9 || { echo "[deploy] another deployment is already running" >&2; exit 1; }

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

# pm2 재시작 직후엔 backend가 아직 부팅 중이라 즉시 curl은 실패(exit 7)한다. 준비될 때까지 재시도.
echo "[deploy] health check..."
for i in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:3001/api/health; then echo; echo "[deploy] healthy"; break; fi
  [ "$i" = "20" ] && { echo; echo "[deploy] health check FAILED after 20s" >&2; exit 1; }
  sleep 1
done

echo "[deploy] done"
