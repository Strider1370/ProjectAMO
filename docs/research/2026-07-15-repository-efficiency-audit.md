# ProjectAMO 저장소 효율성 감사 보고서

- 작성일: 2026-07-15
- 상태: 조사 및 교차검토 완료, 구현 미적용
- 범위: 디렉터리 구조, 죽은 코드와 자산, 중복 구현, 직접 의존성, 반복 수동 작업, 빌드·테스트·배포 워크플로
- 제외: 기능 설계 변경, 보안·성능 감사, 현재 Claude/Codex가 수정 중인 dirty WIP
- 입력 보고서: `architecture-review-ko.html` — OS 임시 디렉터리에 있는 기존 deepening 중심 아키텍처 리뷰

## 1. 결론

기존 아키텍처 보고서는 백엔드 briefing seam, route-briefing, MapView를 중심으로 **모듈을 더 깊게 만드는 구조 개선**을 다룬다. 이 보고서는 그 내용을 반복하지 않고, 계속 개발할 때 누적되는 **불필요한 파일·복제·의존성·수동 검증 비용**을 다룬다. 두 보고서는 경쟁 관계가 아니라 상호 보완 관계다.

이번 감사에서 확인한 보수적 감축 후보는 다음과 같다.

| 항목 | 보수적 효과 | 조건 |
| --- | ---: | --- |
| 소스 코드 | 약 950 LOC | live helper를 보존하고 부분 삭제할 때 |
| 정적 자산 | 약 20.67 MiB | RKPC public URL의 외부 소비가 없음을 확인할 때 |
| 루트 직접 의존성 | 7개 | dirty `package-lock.json` 작업과 충돌 없이 정리할 때 |
| 문서·fixture 재배치 | 순감축 0 | 저장소 탐색성과 소유권 개선 목적 |

가장 먼저 해야 할 일은 삭제가 아니라 **테스트 게이트 복구**다. 기존 아키텍처 보고서는 백엔드 테스트가 녹색이라는 전제에서 리팩터링 순서를 제안하지만, 현재 환경의 백엔드 `npm test`는 assertion 348개가 통과한 뒤에도 프로세스 종료 문제로 실패한다. 지원 Node 버전과 세션 타이머 정리를 먼저 확정해야 이후 삭제와 리팩터링을 싸게 검증할 수 있다.

## 2. 조사 방법과 신뢰도

세 개의 read-only 연구 트랙을 병렬 수행했다.

1. 디렉터리·파일·자산·문서 위치 및 exact duplicate 조사
2. manifest·import graph·죽은 export·중복 구현·직접 의존성 조사
3. 테스트·빌드·개발 실행기·캡처·배포 워크플로 조사

이후 세 개의 독립 리뷰 트랙으로 다음을 다시 확인했다.

1. 삭제 후보의 dynamic/public 소비 가능성과 live caller
2. LOC·bytes·dependency 수치의 중복 집계
3. 기존 `architecture-review-ko.html`과의 범위 중복 및 모순

증거 등급은 다음처럼 사용한다.

- **직접 검증**: 명령 실행 결과 또는 exact hash/caller 확인
- **정적 검증**: source·manifest·문서상 명확하지만 런타임 미실행
- **조건부**: 저장소 밖 소비 또는 제품 정책 확인이 필요

## 3. 우선순위 요약

| 우선순위 | 분류 | 조치 | 근거 |
| --- | --- | --- | --- |
| P0 | test gate | 지원 Node 버전 고정 및 백엔드 테스트 종료 문제 해결 | 현재 `npm test`가 신뢰 가능한 gate가 아님 |
| P2 | conditional delete | 미사용 RKPC PNG 30개 삭제 | 20.67 MiB, 저장소 내부 참조 없음; 외부 URL 확인 필요 |
| P0 | shrink | legacy 날씨 표시 복제본을 shared로 통합 | 약 340 LOC, 88.9 KB |
| P0 | delete | 머신 종속 BAT 실행기 2개 삭제 | 잘못된 절대 경로, npm 실행기로 대체됨 |
| P1 | delete | 죽은 UI·test-only API 부분 삭제 | 약 500 LOC |
| P1 | delete | 루트 중복 직접 의존성 7개 제거 | frontend 소유 패키지와 중복 |
| P1 | workflow | root `check`와 최소 CI gate 추가 | 테스트 파일은 많지만 전체 진입점 없음 |
| P2 | workflow | 캡처·모바일 감사·배포 스크립트의 실패 계약 정리 | 덮어쓰기, exit 0, 비결정적 설치 |
| P2 | move | status·fixture·prototype 소유 위치 정리 | 저장소 크기보다 탐색 비용 문제 |
| P3 | shrink | SIGMET/AIRMET processor와 Haversine 중복 축소 | 작고 위험 대비 효과가 낮음; 다음 수정 시 처리 |

## 4. 상세 발견

### 4.1 테스트 게이트가 현재 리팩터링 안전망이 아니다

**등급: P0 · 직접 검증 · correctness**

근거:

- `backend/package.json:9`의 테스트 명령은 `node --test --test-force-exit`를 사용한다.
- `backend/src/auth/session.js:23-26`의 session store 정리 타이머는 프로세스 종료와 상호작용할 수 있다.
- 현재 Node `v24.15.0`에서 backend `npm test --silent` 실행 결과는 348 pass, file failure 3개, exit 1, 약 8.9초였다.
- 실패 파일을 단독 `node --test`로 실행하면 3/3 pass였다.
- 단독 실행에 `--test-force-exit`를 더하면 libuv `UV_HANDLE_CLOSING` assertion으로 exit 1이었다.
- force-exit 없이 전체 suite를 실행하면 30초 뒤에도 프로세스가 종료되지 않았다.
- root·frontend·backend manifest에 `engines`, `packageManager`, 버전 파일이 없다.
- 반면 frontend에서 plain `node --test`는 358/358 pass, 약 1.45초였다.

최소 조치:

1. 실제 배포에서 지원할 Node 버전을 하나 고정한다.
2. 그 버전에서 backend suite를 다시 실행한다.
3. session store 타이머를 명시적으로 정리하거나 `unref` 가능한 구조로 만들고, 가능하면 `--test-force-exit`를 제거한다.
4. 그 뒤에만 frontend test, backend test, frontend build를 묶는 root `check`를 추가한다.

검증:

- `npm test`가 assertion 통과뿐 아니라 정상 exit 0으로 끝나야 한다.
- `npm run check`가 새 checkout에서 단일 명령으로 끝나야 한다.

### 4.2 미참조 RKPC 기상 PNG 30개

**등급: P2 · 조건부 delete · 신뢰도 높음**

대상:

- `frontend/public/airport_weather/RKPC/`
- tracked PNG 30개
- 합계 21,670,261 bytes, 약 20.67 MiB

근거:

- 저장소 내부에서 `airport_weather`, `day_*`, `golden_*`, `night_*` URL 또는 filename caller가 발견되지 않았다.
- 현재 monitoring 날씨 표시는 `frontend/src/features/monitoring/legacy/utils/weather-icon-registry.js`가 import하는 SVG를 사용한다.
- `MetarCard.jsx:32-45`의 title art는 `/gisang-i/*` 경로를 사용한다.

주의:

`frontend/public` 자산은 source import 없이 직접 URL로 외부에서 소비할 수 있다. 저장소 내부 무참조만으로 외부 계약 부재가 증명되지는 않는다.

최소 조치:

1. 배포 접근 로그 또는 사용자 확인으로 `/airport_weather/RKPC/*` 직접 소비가 없는지 확인한다.
2. 확인되면 디렉터리 전체를 삭제한다.
3. frontend build와 monitoring smoke를 실행한다.

### 4.3 shared와 monitoring legacy의 날씨 표시 복제

**등급: P0 · shrink · 신뢰도 매우 높음**

중복:

- `frontend/src/features/monitoring/legacy/utils/weather-visual-resolver.js`
- `frontend/src/shared/weather/weather-visual-resolver.js`
- legacy/shared `weather-icon-registry.js`
- legacy/shared `WeatherIcon.jsx`
- legacy BasMilius SVG 32개와 `frontend/src/assets/...`의 대응 SVG

확인 결과:

- resolver 두 파일은 byte-identical이다: 6,994 bytes, 225 LOC.
- registry는 import depth만 다르다: 약 61 LOC.
- `WeatherIcon.jsx`는 import path만 다르다: 약 54 LOC.
- legacy SVG 32개는 모두 shared asset과 hash-identical이다: 77,393 bytes.
- 실제 소스 감축량은 SVG·LICENSE 텍스트를 제외한 약 340 LOC다.

live legacy caller:

- `TafTimeline.jsx:16,21`
- `MetarCard.jsx:27,29`
- `GroundForecastPanel.jsx:1`
- `GroundCurrentWeatherCard.jsx:6`
- `GroundHourlyStrip.jsx:1`

이 caller들은 `MonitoringPage.jsx:20-25,485-508,628`에서 실제 렌더된다. 따라서 `monitoring/legacy` 전체는 죽은 코드가 아니다.

최소 조치:

1. 위 다섯 caller의 import 7개를 shared 모듈로 변경한다.
2. legacy resolver, registry, `WeatherIcon.jsx`, SVG 32개만 삭제한다.
3. `/monitoring` Playwright smoke와 frontend 전체 test/build를 실행한다.

### 4.4 안전하게 줄일 수 있는 죽은 코드

#### 4.4.1 compact METAR/TAF/RVR view model

**등급: P1 · delete · 약 220 LOC**

- `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`의 production importer는 `WarningCarousel.jsx` 하나다.
- importer가 사용하는 것은 `buildCurrentWarningModel()`뿐이다.
- `formatRvrSummary`, `buildCompactMetarModel`, `buildCompactTafModel`은 해당 파일과 테스트에서만 나타난다.

전체 파일을 삭제하면 안 된다. `currentWeatherViewModel.js:1-7,10,29-40,59-174`의 compact 전용 import·상수·helper와 `currentWeatherViewModel.test.js:51-137`만 제거한다. `fmtKstShort` import, warning model, 관련 테스트는 유지한다.

#### 4.4.2 AircraftProfileField와 named-profile CRUD

**등급: P1 · partial delete · 약 95~100 LOC**

- `frontend/src/features/route-briefing/AircraftProfileField.jsx`는 importer가 없다.
- `listProfiles`, `saveProfile`, `deleteProfile`, `setLastUsed`는 orphan component와 테스트에서만 사용된다.
- `getLastUsed()`는 `useRouteBriefing.js:7,45,104`에서 순항고도·속도 초기값으로 사용된다.

따라서 orphan UI와 named-profile CRUD만 삭제하고 `getLastUsed`와 그 최소 테스트는 유지한다.

#### 4.4.3 EtdField와 전용 입력 helper

**등급: P1 · partial delete · 약 82 LOC**

- `frontend/src/features/route-briefing/EtdField.jsx`는 importer가 없다.
- 현재 UI는 `RouteBriefingPanel.jsx:435-467`의 Fluent DatePicker/TimePicker를 사용한다.
- `buildEtdIso`, `etdFields`는 orphan component와 테스트에서만 사용된다.
- `formatBriefingTime()`과 ETA 계산은 여러 live caller가 사용한다.

따라서 `EtdField.jsx`, `buildEtdIso`, `etdFields`와 해당 전용 테스트만 삭제한다. `formatBriefingTime`, `computeEtaIso`, `etaCalc.js`는 유지한다.

#### 4.4.4 WarningTab

**등급: P1 · delete · 41 LOC**

- `frontend/src/features/airport-panel/tabs/WarningTab.jsx`는 importer가 없다.
- 현재 공항 경보는 `AirportPanel.jsx:13,122`의 `WarningCarousel`이 담당한다.

파일 삭제 시 `AirportPanel.css:1240-1284`, `Architecture.md:150`, `WarningCarousel.jsx:7`의 낡은 설명과 전용 스타일도 함께 확인한다.

#### 4.4.5 오래된 CommonJS 날씨 아이콘 매핑

**등급: P1 · delete · 31 LOC**

- `shared/weather-icons.js`는 저장소 참조가 없다.
- 현재 frontend icon registries가 역할을 대체한다.

대체물 추가 없이 파일만 삭제한다.

#### 4.4.6 JS theme token mirror

**등급: P1 · 조건부 delete · 118 LOC**

- `frontend/src/shared/theme/tokens.js`의 runtime importer는 없다.
- `tokens.test.js`만 이 파일을 import한다.
- 실제 runtime은 `tokens.css`를 사용한다.
- 그러나 `docs/design/design-language.md:53`과 `tokens.css:2`는 JS token mirror를 canvas/WebGL용 정본으로 설명한다.

먼저 CSS-only를 정본으로 삼는다는 결정을 하고 디자인 헌법과 CSS 주석을 고친 뒤 `tokens.js`와 자체 동기화 테스트를 삭제한다. 문서 계약을 그대로 둔 채 삭제하면 안 된다.

### 4.5 루트가 frontend 의존성을 중복 소유한다

**등급: P1 · delete · 직접 의존성 7개**

대상:

- `@vitejs/plugin-react`
- `lucide-react`
- `mapbox-gl`
- `react`
- `react-dom`
- `vite`
- `concurrently`

근거:

- 앞의 여섯 패키지는 frontend manifest가 소유하고 실제 frontend source가 사용한다.
- root source에는 이 여섯 패키지의 importer가 없다.
- `scripts/projectamo-dev.mjs`는 명시적으로 `frontend/node_modules/vite`를 실행한다.
- `concurrently`는 root `dev` script 한 곳에서만 사용하며, 기존 `projectamo-dev.mjs serve`가 같은 두 서버를 관리한다.
- root preprocessing script는 `@turf/turf`, `@turf/union`을 실제 사용하므로 제거 대상이 아니다.

최소 조치:

- root `dev`를 기존 `dev:serve`의 alias로 바꾼다.
- 위 일곱 직접 의존성을 root manifest에서 제거한다.
- `@turf/union`은 preprocessing-only이므로 제거가 아니라 `devDependencies` 이동 후보로만 본다.

주의:

root `package-lock.json`은 다른 작업으로 이미 dirty 상태다. lockfile 변경을 덮어쓰지 말고 현재 작업과 함께 재생성·검토해야 한다.

### 4.6 머신 종속 BAT 실행기

**등급: P0 · delete · 신뢰도 매우 높음**

- `Launch-ProjectAMO-Dev.bat:4`
- `Open-ProjectAMO-Dev.bat:4-14`

두 파일은 존재하지 않는 `C:\Users\Jond Doe\Desktop\Project\ProjectAMO`를 하드코딩한다. `Open`은 시작 실패 시 2초 간격으로 무한 polling한다. `docs/dev-server-and-capture.md:12`도 사용하지 말라고 명시하며, root npm scripts가 이미 repo-relative 실행기를 제공한다.

최소 조치는 두 BAT와 문서 경고를 함께 삭제하는 것이다. 새 wrapper는 만들지 않는다.

### 4.7 디렉터리와 문서 소유권 드리프트

이 항목은 저장소 크기를 줄이기보다 탐색 비용과 잘못된 활성 상태를 줄인다.

#### 실행 fixture가 plan archive 아래 있음

- 현재: `docs/superpowers/plans/fixtures/`
- 규모: 10개, 409,707 bytes
- live caller: `frontend/scripts/route-import-capture.mjs:11`, `route-import-real-files-capture.mjs:11`

`frontend/test/fixtures/route-import/`로 이동하고 두 스크립트와 과거 계획의 실행 경로를 갱신한다. 이동 후 두 capture를 재실행해야 한다.

#### 완료 status와 연구 결과가 active status에 남음

archive 가능:

- `docs/superpowers/status/2026-07-07-dev-mode-console-status.md`
- `docs/superpowers/status/cleanup-dead-code-and-stale-docs.status.md`

조건부 archive/move:

- `overseas-weather-noaa.md`: live Playwright 후속 내용을 활성 계획으로 옮긴 뒤 archive
- `overseas-data-research.md`: `docs/research/`로 이동하고 두 inbound plan reference 갱신
- root `status.md`: 아직 사용자 환경 검증 checklist가 있으므로 삭제하지 말고 `docs/superpowers/status/2026-07-07-route-forecast-alert.status.md`로 이동

완료 plan 이동:

- `tasks/design-system-phase1/plan.md` → `docs/superpowers/archive/plans/2026-06-28-design-system-phase1.md`

#### production public에 있는 design prototype

- `frontend/public/airport-panel-redesign.html`
- source importer는 없지만 세 문서가 작동 프로토타입으로 참조한다.
- `/api/*` relative fetch와 `/logo3_01.png`를 사용해 Vite public origin을 전제로 한다.

static reference로 강등할지 먼저 결정해야 한다. 작동형이면 public에 유지하거나 새 origin/base를 구성한다. 정적 참고본이면 비작동 참고 자료임을 명시하고 문서 참조 세 곳을 갱신한 뒤 `docs/superpowers/specs/refs/`로 이동한다.

### 4.8 전체 테스트와 CI 진입점 부재

**등급: P1 · workflow**

- root `package.json:6-14`에는 `test` 또는 `check`가 없다.
- `frontend/package.json:6-14`에는 두 개의 좁은 테스트 script만 있다.
- 현재 frontend test 파일은 61개, backend test 파일은 65개다.
- `scripts/projectamo-dev.mjs`의 `verify`는 서버 시작과 readiness를 확인할 뿐 test/build gate가 아니다. 문서도 이를 readiness 검증으로 올바르게 설명한다.
- `.github/workflows`가 없다.

최소 조치:

1. frontend에 `"test": "node --test"`를 추가한다.
2. 백엔드 종료 문제를 고친 뒤 root `check` 하나에 frontend test, backend test, frontend build를 묶는다.
3. 원격 push/PR gate가 필요할 때 CI job 하나가 `npm run check`만 실행하게 한다.

CI가 아직 필요하지 않은 개인 로컬 저장소라면 3번은 보류해도 된다. 로컬 `check`가 먼저다.

### 4.9 캡처 증거가 덮어써지고 manifest가 없음

**등급: P2 · 정적 검증**

- `frontend/scripts/responsive-screenshots.mjs:6-8,30-43`
- `Architecture.md:227`
- `docs/dev-server-and-capture.md:144-150`

현재 matrix는 6 viewport × 3 route = 18 image다. 동일 phase/label로 다시 실행하면 동일 filename을 사용하며, commit·matrix·command를 기록하는 manifest가 없다.

새 프레임워크를 만들지 말고 timestamped run directory와 JSON manifest 하나만 추가한다.

### 4.10 모바일 감사가 실패를 성공으로 반환할 수 있음

**등급: P2 · 정적 검증**

- `frontend/scripts/mobile-audit.mjs:34-36,129-131`
- `frontend/scripts/mobile-audit-capture.mjs:89-104`

실패 상태를 기록하지만 `process.exitCode` 또는 실패 exit가 없다. 기록된 상태 중 하나라도 실패하면 `process.exitCode = 1`을 설정한다. 두 script의 역할이 완전히 겹치는지는 구현 시 다시 확인하고, 겹칠 때만 하나를 삭제한다.

### 4.11 배포가 lockfile을 두고도 비결정적으로 설치함

**등급: P2 · 정적 검증**

- `deploy/deploy-vm-full.sh:11-26`
- `deploy/deploy-vm.sh:11-20`

세 lockfile은 모두 lockfileVersion 3으로 유효하지만 full deploy는 `deploy-vm-full.sh:20,23`에서 두 번의 `npm install`을 사용하고, 배포 전에 이전 lockfile churn을 되돌린다. 일반 `deploy-vm.sh`에는 install 단계가 없다.

최소 조치는 full deploy의 두 install을 `npm ci`로 바꾸는 것이다. 일반 deploy는 dependency 변경이 없다는 fast-path 계약을 명시하고, 그 계약이 없다면 필요한 `npm ci`를 추가한다. test/build를 deploy script에 다시 중복하지 말고 pre-merge `check`에 둔다.

### 4.12 persistent dev launcher의 종료 계약이 약함

**등급: P2 · 정적 검증**

- `scripts/projectamo-dev.mjs:55,73-93,155-166,182-190`

bounded command는 `finally`에서 cleanup하지만 persistent `serve`는 반환된 server handle을 버리고 parent `SIGINT`/`SIGTERM` handler가 없다. detached POSIX child가 Ctrl+C 후 포트를 점유할 가능성이 있다.

최소 조치는 server handle을 유지하고 shutdown handler 하나를 등록하는 것이다. 구현 전후에 3001/5173 port listener를 비교한다.

### 4.13 일회성 capture script 표면적

**등급: P2 · medium confidence · yagni**

- `frontend/scripts/*.mjs` 중 20개가 `chromium.launch`와 `PROJECTAMO_URL`을 반복한다.
- 19개가 mkdir/navigation을 반복한다.
- npm script로 노출된 것은 responsive screenshot 하나뿐이다.

지금 공통 capture framework를 만들지 않는다. 증거 보존 기간이 끝난 one-off script부터 삭제·archive하고, 실제로 남은 active script 사이에서 반복이 확인될 때만 작은 helper를 추출한다.

### 4.14 다음 수정 때만 처리할 작은 중복

**등급: P3 · 보류**

- `backend/src/processors/airmet-processor.js`와 SIGMET processor/parser wrapper: 약 55 LOC 감축 가능
- `frontend/src/features/personal/lib/haversine.js`, `routePreview.js`, `routePlanner.js`: Haversine 공식 세 벌, 약 25~30 LOC 감축 가능

둘 다 현재 즉시 작업할 만큼 효과가 크지 않다. 해당 영역에 다음 기능 변경이 생겼을 때 기존 parser 또는 거리 helper 하나로 합친다.

## 5. 현재 WIP에서만 발견된 위험

`.githooks/`는 현재 untracked 작업이므로 기존 저장소 부채 수치에서 제외했다.

다만 활성 `core.hooksPath`는 `.githooks`이고, `.githooks/post-commit:1-15`가 동기식 `graphify update .` 후 `exit 0`한다. 뒤쪽 `:17-216`의 background/filter block은 도달 불가능하다. 이 상태로 커밋하면 의도한 hook이 실행되지 않고 커밋이 느려질 수 있으므로 현재 hook 작업을 완료하기 전에 앞쪽 중복 block을 제거해야 한다.

## 6. 오탐 및 삭제하면 안 되는 항목

- `frontend/src/features/monitoring/legacy/` 전체: standalone monitoring 화면에서 live다.
- `reference/html/`: `generate_navdata.py:12-16,122-128,199-207`이 실제 파싱한다.
- `frontend/public/briefing-charts/`: `BriefingSynopsis.jsx`가 사용하는 의도된 sample runtime data다.
- docs와 frontend에 중복된 briefing chart 약 1.96 MiB: 정확히 중복이지만 mockup standalone 요구가 불명확해 감축량에서 제외했다.
- public SIGMET/AIRMET duplicate hash: dynamic folder/name 의미가 live라 삭제 근거가 아니다.
- `@xmldom/xmldom`: Node GPX/KML 테스트에서 필요하다.
- `cors`: direct-origin credentialed dev 지원이 문서화돼 있다.
- `playwright`: frontend evidence script와 backend NOTAM crawler에서 모두 live다.
- `@turf/turf`, `@turf/union`: root preprocessing script에서 live다.
- `measure-route-payload.js`, `create-user.js`: CLI entry point다.
- one-caller `useMapTools`, `briefingApi`: 단순 pass-through가 아니라 coordination/error-handling seam이다.
- `aircraftProfiles.js` 전체: `getLastUsed`가 live다.
- `briefingTime.js`, `etaCalc.js` 전체: formatting/ETA caller가 다수 존재한다.
- `currentWeatherViewModel.js` 전체: warning model이 live다.
- 미완료 airport-panel prototype-to-React plan: 아직 후속 phase가 있으므로 archive하면 안 된다.

## 7. 기존 아키텍처 보고서와의 관계

기존 HTML이 다루는 주요 항목은 다음 세 그룹이다.

- backend briefing seam: confidence warnings, enroute composer, route table, hazard matcher
- route-briefing deepening: `useRouteBriefing`, auto-recommend, `BriefingView`, profile chart, `RouteBriefingPanel`
- MapView ownership: camera controller, NOTAM overlay hook, event-binding registry

이번 보고서의 자산·죽은 코드·의존성·실행기·테스트·캡처·배포 항목은 위 그룹에 포함되지 않는다. route-briefing orphan field가 기존 보고서의 churn 관찰을 보강하지만, 같은 개선안을 반복하는 것은 아니다.

중요한 모순은 하나다. 기존 보고서가 여러 우선순위에서 “테스트가 탄탄하고 검증이 싸다”는 전제를 사용하지만 현재 backend test command는 green gate가 아니다. 기존 구조 개선의 방향은 유지할 수 있으나, 실행 순서는 테스트 게이트 복구가 먼저여야 한다.

## 8. 권장 실행 순서

### 0단계 — 안전망 복구

1. Node 버전 고정
2. backend test 정상 종료
3. frontend `test` 및 root `check` 추가

완료 조건: clean checkout에서 단일 `npm run check`가 exit 0.

### 1단계 — 동작 변경 없는 삭제

1. BAT 실행기 두 개
2. `WarningTab.jsx`
3. `shared/weather-icons.js`
4. orphan `AircraftProfileField.jsx`와 named-profile CRUD — `getLastUsed` 유지
5. orphan `EtdField.jsx`와 전용 helper — formatting/ETA 유지
6. compact current-weather builder/test — warning model 유지

완료 조건: frontend 전체 test/build와 관련 model tests 통과.

### 2단계 — shared/legacy 중복 통합

active monitoring import를 shared로 옮기고 legacy 복제본만 삭제한다.

완료 조건: frontend test/build 및 `/monitoring` Playwright smoke 통과.

### 3단계 — 의존성 소유권 정리

root `dev`를 관리형 launcher로 통일하고 직접 의존성 7개를 제거한다.

완료 조건: clean install, `npm run check`, root/frontend lockfile diff 검토.

### 4단계 — 조건부 자산·문서 정리

1. RKPC 외부 URL 소비 확인 후 삭제
2. 완료 status archive 및 연구 문서 이동
3. fixture를 frontend test 소유로 이동
4. prototype을 작동형으로 유지할지 static reference로 강등할지 결정

완료 조건: 기존 경로 참조 0건, 새 경로 링크 정상, route-import capture 통과.

### 보류

- SIGMET/AIRMET processor 통합
- Haversine helper 통합
- capture 공통 framework
- 기존 HTML의 큰 구조 리팩터링

이들은 앞 단계가 끝났거나 해당 영역에 실제 변경이 생길 때만 착수한다.

## 9. 구현 시 최소 검증표

| 변경 종류 | 최소 검증 |
| --- | --- |
| 죽은 frontend 코드 삭제 | frontend `node --test`, frontend build |
| monitoring 날씨 통합 | 위 검증 + `/monitoring` Playwright smoke |
| backend test gate | 지원 Node 버전에서 backend `npm test` exit 0 |
| dependency 정리 | clean install, root `check`, lockfile diff |
| route-import fixture 이동 | 두 route-import capture 실행 |
| public 자산 삭제 | 외부 URL 확인, build, 관련 화면 smoke |
| 캡처 스크립트 변경 | 같은 label로 두 번 실행해 별도 run과 manifest 생성 확인 |
| deploy install 변경 | disposable clean clone에서 deploy 후 `git status --porcelain`이 비어 있음 |

## 10. 최종 감축 점수판

`delete:` 죽은 UI, test-only API, 머신 종속 launcher, stale icon mapping을 제거한다.

`shrink:` live monitoring caller를 shared 날씨 모듈로 모으고 exact duplicate를 제거한다.

`native:` frontend 전체 테스트는 추가 runner 없이 Node `--test` discovery를 사용한다.

`yagni:` 새 capture framework, 새 launcher wrapper, 작은 parser abstraction은 만들지 않는다.

**net: 약 -950 source LOC, -7 direct dependencies, 외부 URL 확인 시 약 -20.67 MiB 가능.**

이 수치에는 문서·fixture 이동, 의도된 briefing chart duplicate, P3 parser/Haversine 축소, lockfile transitive package 감소를 포함하지 않았다.
