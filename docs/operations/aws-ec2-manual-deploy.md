# AWS EC2 Manual Deployment

이 문서는 현재 운영 서버 `3.34.113.37` (도메인 `www.projectamo.co.kr`) 기준의 ProjectAMO 수동 배포 절차를 정리합니다.

기준 환경:

- Host: `3.34.113.37`
- Domain: `projectamo.co.kr`, `www.projectamo.co.kr`
- SSH user: `ec2-user`
- App path: `/opt/projectamo/current`
- Shared data path: `/opt/projectamo/shared/data`
- Backend port: `3001`
- Public entry: `nginx :80/:443` (80은 443으로 리다이렉트, Let's Encrypt 인증서)
- Process manager: `PM2`

## 1. SSH 접속

로컬 키 파일 예시:

```bash
ssh -i ~/.ssh/key.pem ec2-user@3.34.113.37
```

`ubuntu` 계정이 아니라 `ec2-user` 계정을 사용합니다.

## 2. 서버 기본 구조

```text
/opt/projectamo/
  current/       -> git checkout
  shared/data/   -> generated runtime data
```

애플리케이션 체크아웃 위치:

```bash
cd /opt/projectamo/current
```

## 2.5 .env 필수 항목 (운영)

`.env`는 `/opt/projectamo/current/.env`에 있으며 **커밋하지 않는다**(참고: `backend/.env.example`).
운영(`NODE_ENV=production`)에서 아래가 없으면 backend가 부팅 시 크래시한다.

- `SESSION_SECRET` — 세션 서명 시크릿. **운영 필수.** 없으면 `Error: SESSION_SECRET is required in production`로 pm2 크래시 루프.
  - 최초 세팅/신규 서버:
    ```bash
    cd /opt/projectamo/current
    grep -q '^SESSION_SECRET=' .env || echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
    pm2 restart projectamo-backend --update-env
    ```
- `KMA_AUTH_KEY`(기상청), 기타 수집 API 키 — 없으면 국내 수집만 실패(백엔드 자체는 뜸).
- 해외 기상(NOAA)은 무인증이라 추가 키 불필요.

> ⚠️ 새 기능이 새 필수 env를 요구할 수 있다(예: 0.2.3 로그인 도입 시 `SESSION_SECRET`). 배포 후 `/api/health`가 죽어 있으면 §6으로 PM2 로그부터 확인.

## 3. 빠른 배포

의존성 변경이 없으면 fast deploy를 사용합니다.

```bash
cd /opt/projectamo/current
bash deploy/deploy-vm.sh
```

이 스크립트는 다음을 수행합니다.

1. `git pull --ff-only origin main`
2. `bash deploy/build-frontend.sh` — **새 폴더(`frontend/dist.new`)에 빌드하고 성공했을 때만 `dist`와 교체**
3. `pm2 restart projectamo-backend --update-env`
4. `sudo nginx -t`
5. `sudo systemctl reload nginx`
6. `curl http://127.0.0.1:3001/api/health`

### 빌드가 죽어도 사이트는 살아 있다

vite는 빌드를 시작할 때 결과물 폴더를 먼저 비운다. nginx는 그 폴더를 그대로 서빙하므로,
예전 방식(`dist`에 직접 빌드)에서는 **빌드가 중간에 죽으면 `index.html`이 사라져 사이트가 404**로
내려갔다. 2026-08-19에 실제로 그렇게 죽었다 — 서버 메모리 1.9GB에서 백엔드가 도는 채로
빌드가 돌다가 vite가 `SIGABRT`로 중단됐고, 그 순간부터 운영 사이트가 404였다.

지금은 `deploy/build-frontend.sh`가 새 폴더에 빌드하고 **`index.html`이 실제로 만들어졌을 때만**
폴더 이름을 바꾼다. 빌드가 죽으면 이전 화면이 그대로 서빙된다.

같은 스크립트가 Node 힙 한도를 `--max-old-space-size=1536`으로 올린다(스왑 2GB가 받친다).
필요하면 환경변수로 덮어쓸 수 있다:

```bash
NODE_OPTIONS="--max-old-space-size=1024" bash deploy/deploy-vm.sh
```

**이래도 계속 죽으면** 빌드를 서버 밖으로 빼야 한다 — 로컬 빌드 후 `rsync`, 또는 CI(GitHub Actions)
빌드. 번들이 계속 커지는 중이라(현재 메인 청크 3.2MB) 언젠가 그 시점이 온다.

참고:

- 서버에서 `deploy/deploy-vm.sh`에 execute bit가 없을 수 있으므로 `./deploy/deploy-vm.sh` 대신 `bash deploy/deploy-vm.sh`로 실행하는 편이 안전합니다.

## 4. 전체 배포

다음 중 하나가 바뀌면 full deploy를 사용합니다.

- `backend/package.json`
- `backend/package-lock.json`
- `frontend/package.json`
- `frontend/package-lock.json`
- 새 런타임 dependency를 요구하는 backend/frontend 코드

명령:

```bash
cd /opt/projectamo/current
bash deploy/deploy-vm-full.sh
```

이 스크립트는 다음을 수행합니다.

1. `git pull --ff-only origin main`
2. `npm --prefix backend ci`
3. `npm --prefix frontend ci`
4. `bash deploy/build-frontend.sh` (fast deploy와 같은 방식 — 성공 시에만 교체)
5. `pm2 restart projectamo-backend --update-env`
6. `sudo nginx -t`
7. `sudo systemctl reload nginx`
8. `curl http://127.0.0.1:3001/api/health`

실제 사례:

- `netcdfjs`가 backend에서 새로 필요해진 상태에서 fast deploy를 돌리면 PM2는 재시작되지만 backend가 정상 기동하지 않을 수 있습니다.
- 이런 경우 `deploy-vm-full.sh`로 다시 배포해야 합니다.

## 5. 배포 후 확인

로컬 health:

```bash
curl -i http://127.0.0.1:3001/api/health
```

정상 예시:

```json
{"ok":true,"uptime":17.34154136}
```

PM2 상태:

```bash
pm2 status projectamo-backend
```

위성 수집 메모리 확인:

```bash
pgrep -af 'backend/src/satellite/worker-entry.js' || true
ps -o pid,ppid,rss,etimes,args -C node
curl -fsS http://127.0.0.1:3001/api/snapshot-meta
```

PM2 backend는 장기 실행 API/스케줄러이고, IR/FOG·CI/CTPS·VI006 위성 수집은
작업마다 별도 Node 자식 프로세스로 실행된다. 수집 중에는 자식 PID가 하나만
보여야 하며, 완료 뒤에는 없어져야 한다. 자식 종료 뒤 부모 RSS가 작업마다 계속
누적되는지 24시간 동안 기록한다. PM2 재시작은 이 구조의 기본 해결책이 아니다.

nginx 응답:

```bash
curl -I http://127.0.0.1/
```

배포된 git revision 확인:

```bash
cd /opt/projectamo/current
git rev-parse --short HEAD
git rev-parse --short origin/main
```

두 값이 같아야 합니다.

## 6. 장애 확인

backend가 `3001` 포트에서 응답하지 않으면 먼저 PM2 로그를 봅니다.

```bash
pm2 logs projectamo-backend --lines 80 --nostream
```

자주 볼 항목:

- `SESSION_SECRET is required in production` → `.env`에 `SESSION_SECRET` 추가(§2.5) 후 `pm2 restart --update-env`
- `ERR_MODULE_NOT_FOUND` → 새 의존성 미설치. `bash deploy/deploy-vm-full.sh`로 재배포
- `.env` 누락
- `DATA_PATH` 잘못된 경로
- collector upstream API 오류

collector 오류는 일부 있어도 backend 자체는 떠 있을 수 있습니다. 먼저 `/api/health`가 살아 있는지 확인합니다.

## 7. 운영 메모

- 공개 트래픽은 `nginx`만 받습니다.
- backend는 `127.0.0.1:3001`에만 바인드되어야 합니다.
- terrain/runtime data는 `/opt/projectamo/shared/data` 아래를 사용합니다.
- vertical profile terrain tiles는 `/opt/projectamo/shared/data/terrain/tiles/` 아래에 있어야 합니다.

## 8. 현재 기준 배포 요약

2026-06-24 실제 배포 기준:

- 서버: `3.34.113.37` (도메인 `www.projectamo.co.kr`)
- 계정: `ec2-user`
- 배포 커밋: 서버에서 `git rev-parse --short HEAD`로 확인
- HTTPS: `/etc/letsencrypt/live/projectamo.co.kr/` 인증서 사용, nginx `projectamo.conf`
- fast deploy 실패 원인 예시: 새 dependency 미설치
- 해결: `bash deploy/deploy-vm-full.sh` 실행 후 health/pm2/nginx 재확인

이전 서버(`13.124.1.201`)에서 도메인 구매 후 신규 인스턴스(`3.34.113.37`)로 이전됨.
