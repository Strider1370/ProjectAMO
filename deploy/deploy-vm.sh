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

# 자기 자신을 업데이트한 뒤에는 새 내용으로 다시 시작한다.
# bash는 실행 중인 스크립트 파일을 읽어 가며 도는데, 위의 pull이 바로 이 파일을 바꿔치기한다.
# 다시 시작하지 않으면 이번 실행은 끝까지 옛 내용으로 돌아, 배포 절차를 고쳐도 그 변경이
# "다음 배포부터" 적용된다. 2026-08-19에 그래서 새 안전망이 안 걸린 채로 사이트가 내려갔다.
if [ "${PROJECTAMO_DEPLOY_REEXEC:-}" != "1" ]; then
  export PROJECTAMO_DEPLOY_REEXEC=1
  echo "[deploy] restarting with the pulled script..."
  exec bash "${BASH_SOURCE[0]}" "$@"
fi

# 관리자 콘솔의 "배포 시각"이 읽는 파일. git 파일 수정시각에 기대는 것보다 정확하다.
date -Iseconds > .deployed-at
echo "[deploy] building frontend..."
bash deploy/build-frontend.sh

# 앱 이름이 아니라 **설정 파일을 지목해서** 재시작한다.
# `pm2 restart <이름>`은 pm2가 자기 안에 들고 있는 설정을 쓸 뿐 ecosystem.config.cjs를 다시
# 읽지 않는다. 그래서 그 파일을 고쳐도 아무 일이 일어나지 않는다 — 2026-07-15에 넣은 설정이
# 한 달 내내 죽어 있었는데 아무도 몰랐다(2026-08-19 발견). 파일을 지목해야 반영된다.
echo "[deploy] restarting pm2 app from ecosystem.config.cjs..."
pm2 restart ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] validating nginx..."
sudo nginx -t

echo "[deploy] reloading nginx..."
sudo systemctl reload nginx

# pm2 재시작 직후엔 backend가 아직 부팅 중이라 즉시 curl은 실패(exit 7)한다. 준비될 때까지 재시도.
# 설정이 실제로 걸렸는지 확인한다. 파일만 보고 "됐겠지" 하다가 한 달을 놓쳤다.
echo "[deploy] verifying process options..."
expected_opts="$(node -p "require('./ecosystem.config.cjs').apps[0].env.NODE_OPTIONS || ''")"
if [ -n "${expected_opts}" ]; then
  app_pid="$(pm2 jlist | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].pid")"
  actual_opts="$(tr '\0' '\n' < "/proc/${app_pid}/environ" | sed -n 's/^NODE_OPTIONS=//p')"
  if [ "${actual_opts}" = "${expected_opts}" ]; then
    echo "[deploy] NODE_OPTIONS applied: ${actual_opts}"
  else
    echo "[deploy] NODE_OPTIONS mismatch — 파일: '${expected_opts}' / 실제: '${actual_opts}'" >&2
    exit 1
  fi
fi

echo "[deploy] health check (backend)..."
for i in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:3001/api/health; then echo; echo "[deploy] backend healthy"; break; fi
  [ "$i" = "20" ] && { echo; echo "[deploy] backend health check FAILED after 20s" >&2; exit 1; }
  sleep 1
done

# 화면도 확인한다. 백엔드만 보면 nginx가 내보내는 페이지가 깨져도 "healthy"로 끝난다 —
# 2026-08-19에 빌드가 죽어 dist가 빈 채로 사이트가 404였는데 배포는 성공으로 보고했다.
echo "[deploy] health check (site)..."
# -L: :80은 :443으로 넘기므로 리다이렉트를 따라간다. -k: 자기 자신에게 IP로 붙으면
# 인증서 이름이 안 맞는다(발급은 도메인 기준). 여기서 보는 것은 화면이 나오느냐다.
site_code="$(curl --silent --location --insecure --output /dev/null --write-out '%{http_code}' --max-time 15 http://127.0.0.1/ || true)"
if [ "${site_code}" = "200" ]; then
  echo "[deploy] site healthy"
else
  echo "[deploy] site returned ${site_code} — 화면이 정상적으로 나오지 않는다" >&2
  exit 1
fi

echo "[deploy] done"
