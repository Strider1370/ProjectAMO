#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[deploy-full] repo: ${REPO_ROOT}"

# 이전 배포의 npm install이 남긴 lockfile 변경이 ff-only pull을 막지 않도록 먼저 되돌린다.
# 커밋된 lockfile이 정본이며, 필요한 설치는 커밋본 기준으로 다시 이뤄진다.
echo "[deploy-full] discarding local lockfile churn..."
git checkout -- frontend/package-lock.json backend/package-lock.json 2>/dev/null || true

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

# pm2 재시작 직후엔 backend가 아직 부팅 중이라 즉시 curl은 실패(exit 7)한다. 준비될 때까지 재시도.
echo "[deploy-full] health check..."
for i in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:3001/api/health; then echo; echo "[deploy-full] healthy"; break; fi
  [ "$i" = "20" ] && { echo; echo "[deploy-full] health check FAILED after 20s" >&2; exit 1; }
  sleep 1
done

echo "[deploy-full] done"
