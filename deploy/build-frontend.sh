#!/usr/bin/env bash
# 프론트엔드 빌드 — 새 폴더에 만들고 성공했을 때만 교체한다.
#
# 왜 이렇게 하나:
#   vite는 빌드를 시작할 때 결과물 폴더를 먼저 비운다. nginx는 그 폴더를 그대로 서빙하므로,
#   빌드가 중간에 죽으면 index.html이 없어져 사이트가 404로 내려간다. 실제로 그렇게 죽었다
#   (2026-08-19, 메모리 부족으로 vite가 SIGABRT). 새 폴더에 만들고 마지막에 이름만 바꾸면
#   무슨 일이 있어도 이전 화면이 살아 있다.
#
#   메모리 한도: 운영 서버가 1.9GB뿐인데 그 위에서 백엔드가 계속 돌아 빌드가 기본 한도에
#   걸려 죽었다. 스왑 2GB가 받쳐 주므로 한도를 올려 준다. 이래도 계속 죽으면 빌드를 서버
#   밖으로 빼야 한다(로컬 빌드 또는 CI).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd -- "${SCRIPT_DIR}/../frontend" && pwd)"

DIST="${FRONTEND_DIR}/dist"
STAGING="${FRONTEND_DIR}/dist.new"
PREVIOUS="${FRONTEND_DIR}/dist.old"

rm -rf "${STAGING}"

echo "[build] building into $(basename "${STAGING}")..."
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" \
  npm --prefix "${FRONTEND_DIR}" run build -- --outDir "${STAGING}" --emptyOutDir

# 빌드가 죽으면 set -e로 여기 못 온다 — dist는 손도 안 댄 채 남는다.
[ -f "${STAGING}/index.html" ] || { echo "[build] index.html이 없다 — 교체하지 않는다" >&2; exit 1; }

echo "[build] swapping in the new build..."
rm -rf "${PREVIOUS}"
[ -d "${DIST}" ] && mv "${DIST}" "${PREVIOUS}"
mv "${STAGING}" "${DIST}"
rm -rf "${PREVIOUS}"

echo "[build] done"
