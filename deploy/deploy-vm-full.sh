#!/usr/bin/env bash
set -euo pipefail

exec 9>/tmp/projectamo-deploy.lock
flock -n 9 || { echo "[deploy-full] another deployment is already running" >&2; exit 1; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[deploy-full] repo: ${REPO_ROOT}"

echo "[deploy-full] pulling latest main..."
git pull --ff-only origin main

# 자기 자신을 업데이트한 뒤에는 새 내용으로 다시 시작한다.
# bash는 실행 중인 스크립트 파일을 읽어 가며 도는데, 위의 pull이 바로 이 파일을 바꿔치기한다.
# 다시 시작하지 않으면 이번 실행은 끝까지 옛 내용으로 돌아, 배포 절차를 고쳐도 그 변경이
# "다음 배포부터" 적용된다. 2026-08-19에 그래서 새 안전망이 안 걸린 채로 사이트가 내려갔다.
if [ "${PROJECTAMO_DEPLOY_REEXEC:-}" != "1" ]; then
  export PROJECTAMO_DEPLOY_REEXEC=1
  echo "[deploy-full] restarting with the pulled script..."
  exec bash "${BASH_SOURCE[0]}" "$@"
fi

echo "[deploy-full] installing backend dependencies..."
npm --prefix backend ci

echo "[deploy-full] installing frontend dependencies..."
npm --prefix frontend ci

echo "[deploy-full] building frontend..."
bash deploy/build-frontend.sh

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
