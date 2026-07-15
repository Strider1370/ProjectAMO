# ProjectAMO

ProjectAMO는 한국 공항과 항공로를 대상으로 한 항공 기상 운영 대시보드입니다. Vite/React 프론트엔드와 Node/Express 백엔드로 구성되어 있으며, 항공 기상 데이터를 수집, 정규화, 저장한 뒤 지도 오버레이, 공항 패널, 항로 브리핑, 모니터링 화면에 제공합니다.

## 주요 기능

- Mapbox GL 기반 항공 기상 지도 대시보드
- 공항 마커와 공항별 METAR, TAF, AMOS, 경보, 공항 정보 패널
- 레이더, 위성, 낙뢰, SIGWX, SIGMET/AIRMET, KIM 지상풍 오버레이
- 항공 WFS 레이어와 ADS-B 항공기 레이어
- IFR/VFR 항로 검색, 절차/항법점 조회, 경로 미리보기, 수직 프로파일 생성
- `/monitoring` 경로의 별도 운항/지상 모니터링 화면
- `DATA_PATH` 기반 백엔드 데이터 캐시와 `latest.json` 스냅샷 보관

## 기술 스택

- 프론트엔드: React 19, Vite 7, Mapbox GL, lucide-react
- 백엔드: Node.js, Express, node-cron, fast-xml-parser, sharp, h5wasm
- 검증: Node test runner, Playwright 기반 responsive smoke/screenshot 스크립트
- 배포 문서: AWS EC2, PM2, nginx 기준으로 정리

## 저장소 구조

```text
ProjectAMO/
  frontend/           React/Vite 앱, Mapbox UI, 패널, 항로 브리핑, 모니터링 화면
  backend/            Express API 서버, 수집 스케줄러, 파서, 프로세서, 데이터 캐시 접근
  shared/             프론트엔드와 백엔드가 공유하는 상수
  scripts/            로컬 헬퍼 스크립트와 ProjectAMO dev 런처
  docs/               아키텍처, 운영, 온보딩, 배포, 검증 문서
  artifacts/          로컬 생성 스크린샷, 로그, 리뷰 산출물
```

자세한 파일 역할은 `Architecture.md`를 참고하세요.

## 사전 준비

- Node.js와 npm
- 프로젝트에서 사용하는 기상/지도 서비스 API 키
- 루트, `frontend/`, `backend/` 각각의 npm 의존성
- 수직 프로파일을 사용할 경우 terrain tile 데이터

## 환경 변수

저장소 루트에 `.env` 파일을 만듭니다. 백엔드는 상위 경로를 탐색해 `.env`를 읽고, 프론트엔드는 Vite 설정의 `envDir: '..'`를 통해 루트 `.env`를 읽습니다.

```dotenv
API_AUTH_KEY=your_kma_api_key
API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
DATA_PATH=./backend/data

VITE_MAPBOX_TOKEN=your_mapbox_token

# 선택 항목
AIRKOREA_API_KEY=
KMA_UV_API_KEY=
ADSB_CLIENT_ID=
ADSB_CLIENT_SECRET=
BACKEND_HOST=127.0.0.1
BACKEND_PORT=3001
```

주의 사항:

- 실제 API 키는 커밋하지 마세요.
- `DATA_PATH`가 없으면 백엔드는 기본값으로 `backend/data`를 사용합니다.
- 수직 프로파일용 terrain tile은 `$DATA_PATH/terrain/tiles/` 아래에 있어야 합니다.
- 외부 API 키가 없거나 네트워크가 막혀 있으면 수집 로그에 오류가 날 수 있습니다. 그래도 기존 `latest.json` 캐시가 있으면 UI는 마지막 저장 데이터를 계속 사용할 수 있습니다.

## 설치

루트, 프론트엔드, 백엔드 의존성을 각각 설치합니다.

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

## 로컬 개발

권장 실행 방식은 저장소에 포함된 ProjectAMO dev 런처를 사용하는 것입니다. 이 런처는 백엔드와 프론트엔드를 저장소 기준 경로에서 실행하고, 준비 상태를 확인하며, Windows 환경의 `Path`/`PATH` 중복 문제를 피하도록 만들어져 있습니다.

두 dev 서버가 정상적으로 뜨는지 확인:

```bash
npm run dev:verify
```

백엔드와 프론트엔드를 계속 실행:

```bash
npm run dev:serve
```

기본 주소:

- 프론트엔드: `http://127.0.0.1:5173`
- 백엔드 헬스체크: `http://127.0.0.1:3001/api/health`

기존 루트 실행 명령도 사용할 수 있습니다.

```bash
npm run dev
```

로컬 서버를 열거나 Playwright로 캡처할 때는 `docs/dev-server-and-capture.md`의 절차를 우선 따르세요.

## 빌드

프론트엔드 빌드:

```bash
npm run build
```

빌드 결과 미리보기:

```bash
npm run preview
```

## 테스트와 검증

백엔드 테스트:

```bash
npm --prefix backend test
```

프론트엔드 집중 테스트:

```bash
npm --prefix frontend run test:layout
npm --prefix frontend run test:airport-panel
```

서버를 자동으로 띄우고 responsive smoke 실행:

```bash
npm run dev:smoke
```

서버를 자동으로 띄우고 responsive screenshot baseline 생성:

```bash
PROJECTAMO_SCREENSHOT_PHASE=manual PROJECTAMO_SCREENSHOT_LABEL=after npm run dev:screenshots
```

Windows PowerShell에서는 다음처럼 실행합니다.

```powershell
$env:PROJECTAMO_SCREENSHOT_PHASE = 'manual'
$env:PROJECTAMO_SCREENSHOT_LABEL = 'after'
npm.cmd run dev:screenshots
```

스크린샷은 아래 경로에 저장됩니다.

```text
artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMMSS>_<label>/
```

## 백엔드 API 개요

백엔드는 `/api/*` 아래에서 `no-store` JSON API를 제공하고, `/data/*` 아래에서 생성된 레이더/위성/SIGWX 등 오버레이 자산을 제공합니다.

주요 엔드포인트:

- `GET /api/health`
- `GET /api/snapshot-meta`
- `GET /api/metar`
- `GET /api/taf`
- `GET /api/warning`
- `GET /api/sigmet`
- `GET /api/airmet`
- `GET /api/sigwx-low`
- `GET /api/lightning`
- `GET /api/amos`
- `GET /api/adsb`
- `GET /api/kim/surface-wind`
- `POST /api/vertical-profile`

백엔드 스케줄러는 서버 시작과 함께 실행되며, `backend/src/config.js`의 주기에 따라 항공 기상 데이터를 갱신합니다.

## 운영과 배포

운영/배포 관련 문서는 아래를 참고하세요.

- `docs/operations.md`
- `docs/aws-ec2-manual-deploy.md`
- `docs/briefing-architecture.md`

문서화된 VM 배포 구조는 PM2로 백엔드를 관리하고, nginx를 공개 reverse proxy로 사용하며, 생성/캐시 데이터는 `DATA_PATH=/opt/projectamo/shared/data` 아래에 둡니다.

## 기여자 참고 사항

- 코드 변경 전 `CLAUDE.md`, `Architecture.md`, `EntryPoints.md`를 먼저 확인하세요.
- 지도 관련 기능은 가능하면 소유 feature 모듈에 둡니다. `MapView.jsx`는 Mapbox 생명주기, basemap 전환, style readiness, 고수준 composition에 집중해야 합니다.
- UI, CSS, 레이아웃, 반응형, 디자인 작업은 `docs/design/design-language.md`(디자인 헌법, 단일 출처)를 따르세요.
- 로컬 서버 실행, Playwright 스크린샷·캡처 작업은 `docs/dev-server-and-capture.md`를 따르세요.
