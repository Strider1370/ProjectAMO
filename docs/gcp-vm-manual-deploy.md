# GCP VM Manual Deployment

이 문서는 `GCE VM + PM2 + nginx` 기준으로 ProjectAMO를 직접 배포할 때 필요한 작업만 순서대로 적은 문서입니다.

기준 경로:

- 코드 checkout: `/opt/projectamo/current`
- 런타임 데이터: `/opt/projectamo/shared/data`
- backend port: `3001`
- public entry: `nginx :80/:443`

필요 시 경로만 바꿔서 사용하면 됩니다.

## 1. VM 준비

Ubuntu 기준:

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

버전 확인:

```bash
node -v
npm -v
pm2 -v
nginx -v
```

## 2. 디렉터리 구조

```bash
sudo mkdir -p /opt/projectamo/current
sudo mkdir -p /opt/projectamo/shared/data
sudo chown -R $USER:$USER /opt/projectamo
```

권장 구조:

```text
/opt/projectamo/
  current/       -> git checkout
  shared/data/   -> backend generated data
```

이렇게 두면 코드 재배포와 데이터 보관을 분리할 수 있습니다.

## 3. GitHub 코드 배치

```bash
cd /opt/projectamo
git clone <YOUR_GITHUB_REPO_URL> current
cd current
npm install
npm --prefix frontend install
npm --prefix frontend run build
```

## 4. `.env` 작성

`/opt/projectamo/current/.env`

예시:

```env
KMA_AUTH_KEY=...
AIRKOREA_API_KEY=...
KMA_UV_API_KEY=...

BACKEND_HOST=127.0.0.1
BACKEND_PORT=3001
DATA_PATH=/opt/projectamo/shared/data

RADAR_CMP_TYPE=hsr
SATELLITE_CHANNEL=IR105
SATELLITE_REGION=KO
```

중요:

- `BACKEND_HOST=127.0.0.1`
- `DATA_PATH=/opt/projectamo/shared/data`

## 5. PM2 앱 등록 및 startup

이 repo에 포함된 [ecosystem.config.cjs](</C:/Users/Jond Doe/Desktop/Project/ProjectAMO/ecosystem.config.cjs>) 는 예시입니다. VM 경로에 맞게 `cwd`와 `DATA_PATH`만 확인한 뒤 사용합니다.

등록:

```bash
cd /opt/projectamo/current
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

startup 명령을 실행하면 PM2가 별도로 제시하는 `sudo ...` 명령을 한 번 더 실행해야 합니다.

상태 확인:

```bash
pm2 status
pm2 logs projectamo-backend
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/snapshot-meta
```

## 6. nginx reverse proxy 설정

예시 파일:

- [deploy/nginx/projectamo.conf.example](</C:/Users/Jond Doe/Desktop/Project/ProjectAMO/deploy/nginx/projectamo.conf.example>)

VM에서 적용:

```bash
sudo cp /opt/projectamo/current/deploy/nginx/projectamo.conf.example /etc/nginx/sites-available/projectamo.conf
sudo ln -s /etc/nginx/sites-available/projectamo.conf /etc/nginx/sites-enabled/projectamo.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

설정 의도:

- `/api/*` -> Node backend reverse proxy
- `/data/*` -> 가능하면 nginx가 직접 파일 서빙
- `frontend/dist` -> nginx가 직접 SPA 정적 파일 서빙
- `X-Forwarded-For`, `X-Forwarded-Proto` 전달
- `/api/*` rate limit 적용

## 7. 정적 파일 서빙 위치 결정

권장:

- 프론트 빌드 결과 `frontend/dist`는 nginx가 직접 서빙
- generated runtime data `backend/data`는 `/opt/projectamo/shared/data`에서 nginx가 직접 서빙
- Node는 API와 collector 역할만 수행

이 구조의 장점:

- Node 부하 감소
- 캐시 헤더 관리가 쉬움
- `/data/*` 큰 파일 응답을 nginx가 처리

정리:

- 프론트 정적 파일: `/opt/projectamo/current/frontend/dist`
- 생성 데이터: `/opt/projectamo/shared/data`

## 8. 방화벽 / 포트 정책

열어야 하는 외부 포트:

- `80`
- `443` (TLS 붙일 경우)

외부에 열지 말아야 하는 포트:

- `3001`

GCP VPC firewall 기준:

- ingress allow: `tcp:80`, `tcp:443`
- `3001`은 허용하지 않음

VM 내부 확인:

```bash
ss -lntp | grep -E ':80|:443|:3001'
```

정상 기대:

- nginx: `0.0.0.0:80`, `0.0.0.0:443`
- node: `127.0.0.1:3001`

## 9. nginx 캐시 헤더 운영 기준

현재 코드와 문서 기준 권장값:

- `/api/*`: `no-store`
- `/data/radar/echo_korea_<tm>.png`: `public, max-age=10800, immutable`
- `/data/satellite/sat_korea_<tm>.webp|png`: `public, max-age=10800, immutable`
- `/data/sigwx_low/fronts_<tmfc>.png`
- `/data/sigwx_low/clouds_<tmfc>.png`
  - 위 두 개도 `public, max-age=10800, immutable`
- `/data/radar/echo_meta.json`: `no-cache`
- `/data/satellite/sat_meta.json`: `no-cache`
- `/data/sigwx_low/fronts_meta_*.json`: `no-cache`
- `/data/sigwx_low/clouds_meta_*.json`: `no-cache`
- navdata / geojson / topojson / symbols / hashed frontend asset: `public, max-age=31536000, immutable`
- `index.html`: `no-cache`

이유:

- 레이더/위성/SIGWX overlay 파일은 3시간 loop 기준 재사용 가능
- meta JSON은 최신 선택 기준이라 재검증이 필요
- `index.html`은 새 배포를 빠르게 반영해야 함

## 10. 배포/업데이트 절차

```bash
cd /opt/projectamo/current
git pull --ff-only origin main
npm install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart projectamo-backend
sudo nginx -t
sudo systemctl reload nginx
```

## 11. 배포 후 확인

백엔드 직접:

```bash
curl -I http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:3001/api/snapshot-meta
```

공개 경로:

```bash
curl -I http://<YOUR_DOMAIN_OR_IP>/
curl -I http://<YOUR_DOMAIN_OR_IP>/api/health
curl -I http://<YOUR_DOMAIN_OR_IP>/data/radar/echo_meta.json
```

확인 포인트:

- `/api/*` -> `Cache-Control: no-store`
- radar/satellite/SIGWX frame -> `Cache-Control: public, max-age=10800, immutable`
- meta JSON -> `Cache-Control: no-cache`
- `SIGWX_LOW` history가 12개 수준으로 유지되는지 확인
- `pm2 restart` 후 기존 latest 데이터로 API가 바로 응답하는지 확인

## 12. TLS

도메인이 있으면 `certbot`으로 붙입니다.

예:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

TLS 적용 후에는:

- `80 -> 443` redirect
- `443` 공개
- `X-Forwarded-Proto https` 전달 유지

## 13. 운영 원칙

- 사용자에게는 마지막 `latest.json` 기반 데이터를 계속 제공
- collector 일시 실패가 화면 공백으로 바로 이어지지 않게 유지
- 운영자는 `pm2 logs`, `/api/health`, `/api/snapshot-meta`, 파일 수 보관 상태를 점검
