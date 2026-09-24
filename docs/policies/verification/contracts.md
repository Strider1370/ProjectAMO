# Browser verification contracts

Run a focused contract with `npm run dev:contract -- --grep <id>`. The command checks ports, then Playwright owns the fixed-data backend and frontend lifecycle. `dev:test` only stops automatic collection; it does not provide route or weather fixtures.

## 반복 실행 (개발 중)

`npm --prefix frontend run dev:contract:fast -- contracts/<id>.spec.mjs -g "<테스트 이름>"`

desktop 한 종, 재시도 없음, 이미 떠 있는 서버 재사용(`CONTRACT_REUSE_SERVER=1`). 실측상 태풍 계약 12개가 재시도 포함 5.9분 → 재시도 없이 2.2분이고, 서버 재사용까지 하면 한 건은 30초 안쪽이다.

fast 실행의 `CONTRACT_DATA_PATH`는 재사용할 backend의 `DATA_PATH`와 같아야 한다. package script는 현재 `DATA_PATH`를 전달하고, 값이 없으면 기본 `backend/data`를 사용한다. 기본 `dev:contract`는 매번 ignored artifacts 아래 고유 data root를 만들어 runner와 backend에 함께 전달하고 종료 때 정리한다. 테스트 계정 fixture는 실제 테스트 시작 뒤 그 격리 DB에만 설치되므로 `--list`나 테스트 탐색은 DB를 열지 않는다.

**병합 전 검증은 `dev:contract`를 쓴다.** 세 뷰포트 전부, 매번 새 서버에서 시작한다.

### 계약을 쓸 때 지킬 것

기능이 늘수록 화면 글자로 요소를 찾는 방식은 반드시 깨진다. 실제로 `/자료 없음/`이 레이더 이동의 "이동 자료 없음"과, `/^태풍/`이 태풍 패널의 "태풍 목록 닫기" 버튼과 겹쳐 계약이 실패했다.

- 이름만으로 찾지 말고 소유 패널·클래스로 범위를 좁힌다.
- 같은 종류가 여러 개일 수 있으면(태풍 2개, 패널 2개) 반드시 대상을 지정한다.
- 지도 소스의 데이터를 단언할 때 `querySourceFeatures`를 쓰지 않는다. 그것은 이미 그려진 타일을 읽어 `setData` 직후를 반영하지 못한다. `getSource(id).serialize().data`를 본다.

### 현 화면과 플랫폼 범위

- 지도 계약은 제품의 현재 source/layer 상수로 대상 ID를 잡고, style 교체 뒤에는 source·layer 존재, 가시성, 쌓임 순서를 확인한다. Mapbox 내부 paint 직렬화값은 구현 세부사항이므로 opacity의 정확 문자열을 계약으로 고정하지 않는다.
- 설정은 모바일 `더보기 → 설정`, 접힌 데스크톱은 설정 유틸리티 메뉴를 연 뒤 그 안의 `설정`으로 들어간다. 같은 접근성 이름의 첫 버튼을 곧바로 모달 진입점이라고 가정하지 않는다.
- `CHANGELOG[0]`과 `CURRENT_VERSION`으로 새 릴리스 모달을 확인한다. 특정 과거 버전 문자열을 최신 릴리스의 대용으로 쓰지 않는다.
- `/monitoring`은 벽걸이 전용이며 모바일 폭에서는 메인으로 redirect한다. monitoring visual 계약의 mobile 프로젝트는 이 제품 정책을 명시적으로 skip한다.
- 모바일은 토큰/알약 route 입력 표면을 제공하지 않는다. `route-token-input`의 mobile 프로젝트는 skip하고, 제공되는 단계형 브리핑 흐름은 `route-workflow`에서 검증한다.
- reduced-motion은 전환을 사실상 0초로 줄이되 정보 회전 자체를 멈추게 하는 계약이 아니다. 엔진별 `0s`/미세 시간 직렬화 차이는 수치 범위로 비교한다.

### 사파리 엔진(`ipad-safari`)

iPad는 실제로 사파리에서 돈다. `ipad-landscape`는 Chromium으로 못박혀 있고 그 엔진은 바꾸지 않는다 — 계약 24개와 스냅샷 기준선이 전부 그것에 걸려 있어, 엔진을 갈면 무관한 것들이 함께 흔들린다.

대신 `ipad-safari` 프로젝트가 `grep`으로 좁힌 계약만 WebKit으로 돌린다. **입력 초점·키보드처럼 엔진마다 다른 동작을 검사하는 계약은 여기에 등록한다.** 계약 전부를 두 엔진으로 돌리는 비용은 지지 않는다.

WebKit 실행에는 시스템 라이브러리가 필요하다(`sudo npx playwright install-deps webkit`). 없으면 이 프로젝트만 실패하므로, 그 상태에서는 `--project`로 다른 프로젝트를 골라 돌린다.

## Active

2026-09-24 개인키 전환: `copilot-labs.spec.mjs`의 `copilot-chat-labs` 12개와 기존 대화12개·표시설정6개, 합계 **30 pass / retries0**. 계정별 기본OFF, 키 저장만으로 활성화하지 않음, 탭 동기화, 키 삭제, 저장 실패, 익명 안내를 네 화면/엔진에서 확인했다. [개인키 인수](../../evaluation/ai-copilot/2026-09-24-personal-key.md).

2026-09-24 후속 운영자 키 전환: 위 개인키 계약은 이력으로 대체한다. `copilot-chat` 20개 + `copilot-chat-labs` 20개 **40 pass / retries0**. 키 없는 실험실 기본 OFF·ON/OFF 탭 동기화·잔여 1→0회·소진 후 답변 유지/새 질문 차단/재로드·서버 설정 없음·익명을 네 화면/엔진에서 검증했다. 계정별 KST 하루 5회 원자적 차감·재시작 보존·중복 방지는 별도 Node HTTP/DB 테스트로 검증한다. [현재 계약·인수](../../evaluation/ai-copilot/2026-09-24-operator-quota.md).

`copilot-chat.spec.mjs` 최종 전체 **76 pass / 재시도0**(2026-09-24): chat20개 + route56개, 네 화면/엔진. 기능OFF의 기존 공항 화면 사용과 공급자HTTP503→명시적 동일요청 재확인8개를 추가했다. [통합 인수 기록](../../evaluation/ai-copilot/2026-09-24-final-integration.md). 아래 행의 과거 실행 수와 중복 합산하지 않는다.

2026-09-24 후속 인수: `copilot-personal` 44건과 `copilot-route-create` 20건, 합계 **64 pass**. 구형 입력의 사용자 생성→실제 context 브리핑, 항법자료 publication 교체→브라우저 갱신 후 구결과 가져오기 차단/새 결과 적용을 포함한다. [상세 기록](../../evaluation/ai-copilot/2026-09-24-legacy-publication.md).

`copilot-route` 보관 결과 계약에 cold-entry 단면 스타일 및 읽기 전용 경유점 시간선 검사를 추가해 네 화면/엔진 **4 pass**. 별도 명시 실행 스크립트 `frontend/scripts/copilot-stored-nwp-eval.mjs`로 기존 KIM/DEM의 두 경로 REST 동등성과 네 화면×KST/UTC **8건**을 검증했다. 일반 offline gate가 로컬 격자를 요구하지 않도록 분리하며 실제 LLM 시험으로 간주하지 않는다. [명령·최종 산출물·실패 정정](../../evaluation/ai-copilot/2026-09-24-stored-nwp.md).

| Contract | Features / owners | Viewports | Preconditions | Spec | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `copilot-chat` | 기상이 플로팅 창·메시지·접기·취소·LLM 미설정 | desktop, iPad landscape, mobile, **ipad-safari** | 인증/AI 응답 fixture, 실제 공급자 호출과 별도 | `frontend/verification/contracts/copilot-chat.spec.mjs` | frontend | active — 2026-09-24 화면 action 연결 후 기존 12개 재통과 |
| `copilot-chat-actions` | 공항 상세·기상 레이어 명시 클릭 실행·상태 확인 영수증 | desktop, iPad landscape, mobile, **ipad-safari** | 실제 action 준비 함수 + 인증/AI HTTP fixture. 클릭 전 무변경, 공항 패널/기상 토글·재실행·접기 후 영수증, 모호/위조 action 차단 | `frontend/verification/contracts/copilot-ui-actions.spec.mjs` | backend + frontend + shared | active — 2026-09-24 네 화면/엔진 검증. 실제 인증/OpenAI 공항·AIRMET 2턴은 별도 [실측 기록](../../evaluation/ai-copilot/2026-09-24-ui-actions.md) |
| `copilot-route-planning` | 브라우저/서버 계산 동등성·기존 자동 생성 UI 적용 | desktop, iPad landscape, mobile, **ipad-safari** | 추출 전 네 국내 IFR 조건 고정: 절차/편집기/geometry/model/profile/거리/ETA 대조, 실제 항법자료·풍향 fixture; weather 계산 응답은 fixture | `frontend/verification/contracts/copilot-route-planning.spec.mjs` | backend + frontend + shared | active — 2026-09-23 8개 통과(서버 재사용, retries=0), 영향 회귀 포함 55 pass/6 skip. [기록](../../evaluation/ai-copilot/2026-09-23-route-planning.md); LLM 신규 경로 도구 인수는 별도 |
| `copilot-route-create` | 새 경로 조건 확인·보관 브리핑·확인 후 편집기 가져오기 | desktop, iPad landscape, mobile, **ipad-safari** | 실제 서버 planner/runtime, 기상 없음 명시; 인증/대화 API는 fixture. 서버 geometry 일치·자동 재조회 없음·publication 및 동일 label 항로 변경 차단 | `frontend/verification/contracts/copilot-route-create.spec.mjs` | backend + frontend + shared | active — 2026-09-23 네 화면/엔진16 pass, 후속 모바일 launcher 가림 수정4 pass/가장자리 hit-test. [기록](../../evaluation/ai-copilot/2026-09-23-personal-routes.md); 실제 공급자 연속 인수 남음 |
| `copilot-personal` | 본인 저장 경로 선택·확인 후 불러오기·현재 재브리핑 출처 | desktop, iPad landscape, mobile, **ipad-safari** | 메모리 DB의 실제 개인 도구/runtime; 로그인·모델 응답은 fixture. 원본 변경/삭제·동명 후보·구형 초안·대체 경로·VFR 기하·키보드 초점·자동 기상 조회/쓰기 없음·보관 출처 및 만료 검사. 수동 ETA와 보관 결과의 시각을 분리해 왕복 보존 검사 | `frontend/verification/contracts/copilot-personal.spec.mjs` | backend + frontend + shared | active — 2026-09-24 전체40 pass(기존36+시각 왕복4). [실제8턴/시각 검증](../../evaluation/ai-copilot/2026-09-24-live-browser.md). 저장 도구의 현재 재브리핑 실제 공급자 인수는 별도; 알람은 다음 행 |
| `copilot-personal-alerts` | 예정 비행 알람 등록/해제의 명시 확인·동일 요청 재시도 | desktop, iPad landscape, mobile, **ipad-safari** | 메모리 DB의 실제 준비/확인 서비스; 인증·채팅·확인 HTTP는 fixture. 등록/변경안 취소 응답 유실, 만료, 원본 변경, 다중 ETD 선택, 원본/FK 이력 보존 | `frontend/verification/contracts/copilot-personal-alerts.spec.mjs` | backend + frontend | active — 2026-09-24 네 화면/엔진28 pass, retries=0. [오류/재시도 기록](../../evaluation/ai-copilot/2026-09-24-personal-alerts.md). 실제 인증/OpenAI/확인 API 등록·해제 [8턴 통합](../../evaluation/ai-copilot/2026-09-24-live-browser.md) 별도 통과 |
| `copilot-route` | 적용 경로 등록·맥락 충돌 선택/재확인/해제·고도 표·같은 보관 결과 열기·만료·입력안 확인/충돌·지연 응답 | desktop, iPad landscape, mobile, **ipad-safari** | committed navdata + 서버 shared runtime fixture; 현재/이전 경로 입력 및 conversation ID 대조, 최신 재계산 없음과 결과/지도 ID 대조; 입력안 사용자 확인·UTC/고도 보존·이전 계산 폐기 | `frontend/verification/contracts/copilot-chat.spec.mjs` | backend + frontend | active — 2026-09-23 52개 전체 통과 후 지연 응답 사례 4개 추가 및 입력안 영향 범위 20개 재통과(서버 재사용, retries=0); [검증 기록](../../evaluation/ai-copilot/2026-09-23-route-settings.md). 실제 공급자·다중 실경로 인수는 별도 |
| `responsive-baseline` | app shell and release notice; `App.jsx`, `UpdatesModal.jsx`, layout, `MapView.jsx` | desktop, iPad landscape, mobile | local app only; no route/weather fixture | `frontend/verification/contracts/responsive-baseline.spec.mjs` | frontend | active — release notice coverage added and passed 2026-08-15 |
| `map-base` | `MapView.jsx`, basemap switcher, weather overlays | desktop, iPad landscape, mobile | local map style/assets; no route/weather fixture. Mobile verifies its exposed 기본 지도/기상 레이어 only; 지형 선택·CI/CTPS+basemap 조합은 desktop/iPad surface | `frontend/verification/contracts/map-base.spec.mjs` | frontend | active — passed 2026-07-19 |
| `satellite-assets` | isolated satellite publication contract; IR/FOG, VI006, CI, CTPS overlay assets | desktop, iPad landscape, mobile | deterministic satellite metadata and image/GeoJSON fixtures | `frontend/verification/contracts/satellite-assets.spec.mjs` | backend + frontend | active — validates all four published satellite asset families remain browser-loadable |
| `monitoring` | `MonitoringPage.jsx` | desktop, iPad landscape | local monitoring data; mobile is redirected away from /monitoring | `frontend/verification/contracts/monitoring.spec.mjs` | frontend | active — passed 2026-07-28 |
| `admin-console` | 관리자 자료 상태·API 사용량·서버 상태 | desktop, iPad landscape, mobile | verification admin fixture | `frontend/verification/contracts/admin-console.spec.mjs` | backend + frontend | active — API 실행 결과·다음 정상 호출 확인 포함 |
| `terminal-signage` | `/terminal`; compact destination-queue frames, per-slot active/pending transitions, and low-frequency same-day minimum selection | desktop 1920×1080 plus RKPC 1319×960 evidence | committed 2026-08-02 KAC schedule simulation; weather APIs stubbed | `frontend/verification/contracts/terminal-signage.spec.mjs` | frontend | active — six-frame RKPC uniqueness, mixed slot transitions, RKPU/RKJY three-flight extension, RKNY honest exhaustion, and RKJB empty-state coverage added 2026-08-02 |
| `taf-worsening-alert-one-row` | TAF worsening alert; `AlertPanel.jsx`, `MonitoringPage.jsx` | desktop, iPad landscape | `monitoring-fixture.mjs` TAF with +2시간 visibility(9999→1200m) and ceiling(3000→400ft) degradation; new and previous structures | `frontend/verification/contracts/monitoring.spec.mjs` in `TAF worsening alert shows one row listing every worsened element` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-worsening-alert-timeline-outline` | TAF worsening alert timeline highlighting; `TafTimeline.jsx` | desktop, iPad landscape | same TAF fixture; validates blinkGroup outline on 5-row bars, not scale ticks | `frontend/verification/contracts/monitoring.spec.mjs` in `TAF worsening alert outlines the affected timeline slot` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-amd-severity-escalation` | AMD TAF severity; `AlertPanel.jsx`, alert-triggers.js | desktop, iPad landscape | `buildTafPayload({ reportStatus: 'AMENDMENT' })` escalates from warning to critical | `frontend/verification/contracts/monitoring.spec.mjs` in `an AMD worsening alert sorts above a regular one` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-replacement-not-stacking` | TAF alert row replacement; `alert-engine.js`, lifecycle with issued key | desktop, iPad landscape | `page.clock.install()` + `runFor(61s)` triggers polling; hash change detected; new row replaces old by issued time comparison | `frontend/verification/contracts/monitoring.spec.mjs` in `a new TAF replaces the previous TAF alert row instead of stacking` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `airport-panel` | `AirportPanel.jsx` | desktop, iPad landscape, mobile | RKSI must be in the local airport list; no live weather assertion | `frontend/verification/contracts/airport-panel.spec.mjs` | frontend | active — passed 2026-07-19 |
| `airport-model-comparison` | 공항 패널 → 상세 예보 분석, 공통 시각·기온/RH·모델 운고·부분/빈자료·갱신 실패·셀 펼침·호버 툴팁·그래프 클릭 무변경 | desktop, iPad landscape, mobile | `model-comparison-fixture.mjs`: 고정 now, RKPU09Z 실자료 값 + 명시적 synthetic 13시간. Mobile verifies the analysis body; KIM 연직 참고 rail의 무안 이미지 탭은 desktop/iPad surface only | `frontend/verification/contracts/airport-model-comparison.spec.mjs` | backend + frontend | active — 2026-09-07: 전체 관련51/51, 사용자 피드백 반영 후 분석 화면33/33 통과 |
| `notam-and-settings` | `NotamPanel.jsx`, `SettingsModal.jsx` | desktop, iPad landscape, mobile | local app state only; mobile has settings but no NOTAM entry | `frontend/verification/contracts/notam-and-settings.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-import` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed `rksi-rkpk-multi.gpx` fixture; local airport/navdata | `frontend/verification/contracts/route-import.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-workflow` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed navdata; `route-fixture.mjs` intercepts exposure, altitude, profile, cross-section, briefing APIs | `frontend/verification/contracts/route-workflow.spec.mjs` | frontend | active — passed 2026-08-15 (토큰 입력으로 전환 후 재확인) |
| `route-token-input` | 경로 토큰(알약) 입력칸; `RouteTokenField.jsx`, `lib/routeTokens.js`, `useRouteBriefing.js` | desktop, iPad landscape, mobile, **ipad-safari** | committed navdata; `route-fixture.mjs`. 알약 요소는 `.rtf-pill`, 입력칸은 `.rtf-input` — 이름으로 찾지 않는다 | `frontend/verification/contracts/route-token-input.spec.mjs` | frontend | active — passed 2026-08-15 (iPad 가로 7건, 사파리 엔진 7건) |
| `route-touch-draw` | `routePreview.js` `bindIfrClickInteraction` 그리기 모드 | iPad landscape (휴대폰 레이아웃에는 '그리기' 버튼이 없음) | committed navdata; `route-fixture.mjs`; CDP `Input.dispatchTouchEvent`로 실제 터치 제스처 발생 | `frontend/verification/contracts/route-touch-draw.spec.mjs` | frontend | active — passed 2026-08-05 |
| `echo-top` | `echoTopLayers.js`, `useEchoTopOverlay.js`, `EchoTopCard.jsx`, `WeatherLegends.jsx` | desktop, iPad landscape, mobile | fixture intercepts `echotop_meta.json`, the overlay WebP and `/api/radar/echo-top-point`; radar `echo_meta.json` supplies the 5-minute axis | `frontend/verification/contracts/echo-top.spec.mjs` | frontend | active — passed 2026-07-26 (21/21) |
| `radar-wissdom-qpf` | WISSDOM/QPF weather overlay model, layers, vertical rail, status card, and legends | desktop, iPad landscape, mobile | fixture publishes deterministic KST radar 10:20/10:25, WISSDOM heights, QPF +10/+30 metadata, legends, and images | `frontend/verification/contracts/radar-wissdom-qpf.spec.mjs` | frontend | pending — authored 2026-08-05; intentionally not run in Task 8 |
| `briefing-view` | `BriefingView.jsx`, `MapView.jsx` | desktop, iPad landscape, mobile | committed navdata; `route-fixture.mjs` provides two cross-section forecast times; mobile verifies the fullscreen vertical-profile controls | `frontend/verification/contracts/briefing-view.spec.mjs` | frontend | active — mobile fullscreen coverage added 2026-07-28 |
| `moa-activation` | `useMoaActivation.js`, `moaActivation.js`, `aviationWfsLayers.js` MOA 레이어 | desktop | `moa-activation-notam.mjs`가 `/api/notam`을 가로챔(2026-07-25 라이브 NOTAM 캡처, 유효시각만 상대값); 커밋된 `moa.geojson` | `frontend/verification/contracts/moa-activation.spec.mjs` | frontend | active — passed 2026-07-26 (3/3, desktop) |
| `typhoon` | `typhoonLayers.js`, `typhoonOverlaySync.js`, `TyphoonPanel.jsx`, `typhoonColors.js`, `WeatherOverlayPanel.jsx`, backend `typhoon-geometry.js` | desktop, iPad landscape, mobile | `typhoon-snapshot.json`(2018년 19호·20호) + `typhoon-dujuan-2026.txt`(2026-09-18 두쥐안 현재·예보)로 `/api/typhoon`을 가로챔; 개별 표시·전체 토글/스타일 전환 후 유지·연속 확률 영역과 원형 강풍/폭풍 반경 병기·간결한 범례·과거/현재/예상 표식 및 24시간 라벨·700px 패널과 3칸 주요 지표·제목 옆 표시 수·빈 목록/수집 실패 검증 | `frontend/verification/contracts/typhoon.spec.mjs` | frontend | active — verified 2026-09-19 (기존 43 passed, hover 2 skipped; 경로 표식 7 passed/터치 hover 2 skipped; 원형 반경 전환 후 시각 선택·표시 유지 6 passed; 제목 배지 6 passed; 최종 700px/지표 너비 조정 후 3표면 3 passed; 단위 35 passed, build 통과, 2개 줌 화면 확인. 서버 재사용) |
| `airmet-symbols` | `advisoryLayers.js` 기호 합성(`measureIconInk`, 마커 캔버스), `WeatherOverlayPanel.jsx` AIRMET 타일 | desktop (기호 합성은 뷰포트 무관) | `airmet-surface-phenomena.json`(운영 API 캡처: SFC_WIND 270°/30KT, SFC_VIS 5000M FG/BR)이 `/api/airmet`을 가로챔; 합성된 마커 이미지의 불투명 픽셀을 직접 측정 | `frontend/verification/contracts/airmet-symbols.spec.mjs` | frontend | active — passed 2026-08-25 (1/1, desktop) |
| `terrain-hazard` | `terrainHazardLayer.js`, `terrain-rgb-tiles.js`(`/api/terrain/rgb`), `WeatherOverlayPanel.jsx` 지형 그룹, 공용 고도 레일 | desktop | 커밋된 DEM(`backend/data/terrain/tiles`)과 `fir.geojson`; 대한해협 [128.4, 35.0] zoom 7.2 고정 카메라 — 지리산은 칠해지고 대마도는 칠해지지 않음을 픽셀로 확인 | `frontend/verification/contracts/terrain-hazard.spec.mjs` | frontend | active — passed 2026-08-03 (1/1, desktop) |
| `my-map` | `MyMapPanel.jsx`, `MyMapSharingActions.jsx`, `useMyMap.js`, `myMapStore.js`, `mapOrganizationStore.js`, 기관 지도 API, `Sidebar.jsx`, `useRouteBriefing.js` 지도파일 거부 | desktop; iPad/mobile 최신 작성·공유 검증은 통합 단계에서 수행 | 커밋된 `test/fixtures/my-map/folders.kmz`·`folders.kml`; 선택적 실제 두 KMZ; 공유는 격리된 DB와 실제 두 로그인 세션. 기상 레이어 순서는 슬롯 배정으로 확인 | `frontend/verification/contracts/my-map.spec.mjs`, `my-map-sharing.spec.mjs` | frontend/backend | active — 2026-09-21 desktop 기존 18개+기관 HTTP 1개 통과, 기관 UI 저장 지연 결함 수정 후 영향 3개 통과. 상세·로그는 `docs/design/proposals/2026-09-21-flight-map-sharing-progress.md`. 이전 iPad 보기 검증은 2026-08-14 이력이며 최신 전체 완료 근거가 아님 |

## Registered next

| Contract | Preconditions | Status |
| --- | --- | --- |
| `traffic-panel` | Vite on 5173; `/api/adsb` returning aircraft data. Guarantee: sidebar 항적 → panel opens; ADS-B enable + operator/altitude/search filters → map aircraft count matches panel `보이는 항공기 N / 전체 M`; reload preserves filters, display off | capture — `node frontend/scripts/traffic-panel-capture.mjs`; active 2026-07-31 |

## Phase A coverage and legacy mapping

| Existing asset | Meaning retained | Phase A disposition / replacement |
| --- | --- | --- |
| `responsive-smoke.mjs` | main shell has no horizontal overflow at six legacy viewports | retained until `responsive-baseline` passes; partially replaced by three contractual viewports |
| `responsive-screenshots.mjs` | 18-image main/monitoring baseline evidence | retained; screenshot baseline is not yet fully absorbed |
| `airport-panel-capture.mjs` | RKSI airport tabs | partially replaced by `airport-panel`; retained for visual/tab-content evidence |
| `map-chrome-capture.mjs` | MET panel and overlay toggles | partially replaced by `map-base`; retained for visual evidence |
| `monitoring-capture.mjs` | ops and ground monitoring routes | partially replaced by `monitoring`; retained for visual evidence |
| `briefing-capture.mjs` | RKSS→RKPC IFR search and briefing creation | partially replaced by `route-workflow` and `briefing-view`; retained for RKPC visual evidence |
| `briefing-smoke.mjs` | IFR flow, alternate, map and briefing sections | partially replaced; retained because alternate/map-section scope is not yet contractual |
| `briefing-redesign-capture.mjs` | desktop briefing result | partially replaced by `briefing-view`; retained for visual evidence |
| `notam-tab-capture.mjs` | briefing NOTAM tab | planned: `notam-and-settings` or `briefing-view` |
| settings / NOTAM controls | NOTAM map visibility and saved time zone | partially replaced by `notam-and-settings`; briefing-specific NOTAM remains planned |
| `vprofile-scroll-capture.mjs` | vertical profile modal and scroll behavior | partially replaced by `route-workflow`; retained for scroll visual evidence |
| `vfr-fix-search-capture.mjs` | VFR fix search | partially replaced by `route-workflow`; retained for fix-search coverage |
| `vfr-layout-capture.mjs` | VFR waypoint layout/editing | partially replaced by `route-workflow`; retained for layout/edit coverage |
| `route-save-load-capture.mjs` | VFR save/load and local storage | retained: save/load is outside current contract scope |
| `route-import-capture.mjs` | synthetic GeoJSON/GPX import | partially replaced by `route-import`; retained for GeoJSON visual evidence |
| `route-import-real-files-capture.mjs` | real GeoJSON/GPX/KML import | partially replaced by `route-import`; retained for real-file format coverage |
| `moon-section-capture.mjs` | airport moon tab, desktop/mobile overflow | planned: `airport-panel` |
| `fir-tick-zoom-capture.mjs` | FIR ticks at map zooms | retained: manual visual evidence remains outside the semantic contract |
| `overseas-airway-clip-capture.mjs` | overseas airway clipping | retained: manual visual evidence remains outside the semantic contract |
| `mobile-audit.mjs` | mobile map, panels, airport, monitoring | held: split across `map-base`, `airport-panel`, `route-workflow`, `monitoring` |
| `mobile-audit-capture.mjs` | mobile captures and axe audit | held: split across the same contracts; live route data is not a fixture |
| `lint-colors.mjs` | static color lint | not browser-capable; retained outside this migration |

No legacy script is deleted in Phase A. The current baseline contract replaces only its pass/fail responsive-overflow assertion; it does not replace the legacy screenshot matrix.
