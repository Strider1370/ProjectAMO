# S004 현재 기준선과 성능 측정

2026-09-12 실행·측정 기록. [진단 보고서](report.md)의 근거이며 과거 검사 결과를 현재 통과로 사용하지 않았다. 구현 전 기준 `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41`, main. 소스·설정·영구 테스트 수정 없음.

## B01 환경·자료

WSL2 Linux x86_64(kernel 6.18.33.2), Node v22.23.1, npm 10.9.8. `.nvmrc` 일치. 16 logical CPU, 메모리 15,935,136 KiB. root/frontend/backend node_modules 설치 확인. 시작 시 3001/5173 사용 없음. 시작 미커밋은 `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, 신규 `docs/refactoring/`이며 그대로 보존했다.

실황 `backend/data/.active-data → .`를 읽어 확인. 브라우저용으로 26종 `*/latest.json`(6,872,175 B)을 ignored `artifacts/refactoring/S004/browser-data`에 복사했다. 파일별 SHA256은 `browser-data-manifest.json`. 성능 자료에는 같은 latest와 KIM/KTG/공항 모델 비교 저장 파일을 별도 `perf-data`에 복사했다. DB·실황 포인터를 복사하거나 시연 모드를 실제로 바꾸지 않았다. 모든 새 재현의 데이터와 로그는 S004 artifacts 내부다. 복사된 METAR/TAF fetched_at은 2026-09-10T12:30Z, NOTAM은2026-08-25T15:57Z이며 최신 실황 검증 자료가 아니다. KIM run2026091006, KTG run2026091000을 성능 입력으로 고정했다. browser fixture가 대체하는 자료와 이 복사본의 실제 응답을 구분한다.

**목록 조회 경계의 실제 제한:** 최초 브라우저 `--list`에는 DATA_PATH 격리가 누락됐다. top-level admin fixture가 기존 DB를 열고 schema init을 수행했으며 로그상 두 계정은 이미 있어 신규 생성 0이었다. 사전 DB 해시가 없어 기존 파일 불변을 증명할 수 없다. 이후 브라우저 본 실행은 runner와 server 모두 동일한 artifacts DATA_PATH로 격리했다. 이 경계를 RF-103으로 기록했다.

## B02 단위·통합·빌드

| 실제 실행 | exit | 결과 | 로그 |
| --- | --- | --- | --- |
| `npm run check`, DATA_PATH/TMPDIR 격리, DISABLE_COLLECTION unset | 0 | backend 1,141 pass / 0 fail / 1 skip, frontend 1,539 pass / 0 fail, production build 성공. 총 24.37 s | `check-standard.log`, `check-standard-result.json` |
| `node --test shared/*.test.js` | 0 | 14 pass / 0 fail / 0 skip | `shared-test.log` |
| 첫 check: DISABLE_COLLECTION=1 전역 주입 | 1 | backend 1,139 pass / 2 fail / 1 skip; frontend/build 생략 | `check.log` |
| 첫 check 뒤 frontend test 및 build 개별 실행 | 0 / 0 | frontend 1,539 pass; build 성공 | `frontend-test.log`, `build.log` |

위 로그의 공통 접두사는 `artifacts/refactoring/S004/`이다. 처음 두 backend 실패는 `api-cache-policy`의 200 대신 503, `snapshot-meta-cache`의 null hash였다. NODE_ENV=test는 시작 cache init을 하지 않는데 DISABLE_COLLECTION이 readLatest의 disk fallback을 끄는 실행 환경 충돌이었다. 실제 기본 검사 조건으로 바로잡은 check에서 통과했으므로 앱 결함으로 집계하지 않는다.

backend skip 1개는 QCD 실제 HDF5의 9 sweeps 사례다. `artifacts/radar-qcd/*.h5`가 없어 실행하지 않았다. synthetic parser 통과가 이 자료 검증을 대신하지 않는다. root test discovery 밖 shared/Python/deploy/prototype 범위는 [W01](audit/W01.md)에 분리했다. 추가 오프라인 실행은 Python ENR3.1 4건·ENR3.3 3건 통과, change candidates/inspect amendment의 main assertion 각각 종료0, nginx rate-limit 정적 Node1건 통과, stubbed deploy lock shell 종료0이다(`offline-checks.log`, 총0.60s). 네트워크/실제 배포는 실행하지 않았다. 독립 prototype test:sites는 별도 build 의존으로 이번 주 앱 기준선에서 미실행이며 미검증으로 남긴다.

## B03 주요 브라우저

기본 계약 `npm run dev:contract -- --grep 'responsive-baseline|map-base|notam-and-settings|route-token-input|route-import|route-workflow|briefing-view|airport-panel|airport-model-comparison|monitoring-visual|monitoring-ground-signage|terminal-signage|admin-console' --retries=0 --reporter=list,json --output=../artifacts/refactoring/S004/browser-main-results`.

환경: DATA_PATH=`artifacts/refactoring/S004/browser-data` 절대경로, DISABLE_COLLECTION=1, TMPDIR=S004/tmp, PLAYWRIGHT_JSON_OUTPUT_NAME=S004/browser-main.json. 3001/5173 관리형 새 server, workers1, 재시도0. 2026-09-11 15:34:15 UTC 시작, 1,896.03s, exit1. **357사례: 214 pass / 58 fail / 85 skip / flaky0**. 서로 다른 기능·뷰포트 사례를 합산한 수이며 독립된 58개 결함을 뜻하지 않는다.

| 기본 project | 엔진·표면 | pass | fail | skip |
| --- | --- | ---: | ---: | ---: |
| desktop | Chromium 1440×900; signage는 spec에서1920×1080 | 87 | 21 | 5 |
| ipad-landscape | Chromium, Playwright iPad Pro11 landscape device | 64 | 12 | 37 |
| mobile | Chromium, Pixel5 device | 46 | 24 | 43 |
| ipad-safari | WebKit, iPad Pro11 landscape; route-token-input만 | 17 | 1 | 0 |

| 계약 파일(.spec.mjs) | pass | fail | skip |
| --- | ---: | ---: | ---: |
| admin-console | 30 | 0 | 0 |
| airport-model-comparison | 52 | 6 | 2 |
| airport-panel | 3 | 0 | 0 |
| briefing-view | 17 | 3 | 7 |
| map-base | 4 | 7 | 4 |
| monitoring-ground-signage | 2 | 6 | 16 |
| monitoring-visual | 0 | 12 | 0 |
| notam-and-settings | 6 | 2 | 1 |
| responsive-baseline | 3 | 3 | 0 |
| route-import | 9 | 3 | 0 |
| route-token-input | 53 | 14 | 5 |
| route-workflow | 13 | 1 | 4 |
| terminal-signage | 22 | 1 | 46 |

기관 계약은 정확한 파일 두 개를 지정했다: `npm run dev:contract -- --config=playwright.organization.config.js organization-briefing.spec.mjs organization-presentation.spec.mjs --retries=0 --reporter=list,json --output=../artifacts/refactoring/S004/browser-organization-results`. 같은 격리 환경, JSON은 browser-organization.json. 16:06:32 UTC 시작, 218.53s, exit0. **24 pass / 0 fail / 0 skip**. Chromium/WebKit 각각 desktop1920×1080, touch ipad1180×820, touch compact1024×768. 일반 grep만 썼을 때 project 이름으로 전체 spec이 선택되는 위험은 피했다.

확인한 기관 흐름은 기존 화면/API를 통한 revision 브리핑, 초기 오류의 retry/return, 이탈 뒤 늦은 응답 차단, 발표의 후보·고도·확대·style 전환에서 exact resource 유지다. ACL/동시편집/실제 PDF export 전체를 이 24건이 대신하지 않는다. WebKit emulation은 실제 iPad/Safari 기기 검증이 아니다. Firefox는 미실행/미설정이다.

### 실패 분류와 다음 검증

| 관찰 묶음 | 사례 수 | 현재 근거·판정 |
| --- | ---: | --- |
| map-base | 7 | 지형 옵션·구름꼭대기 이름이 현재 UI와 다름. radar stack은 style 전환 전 옛 kma-radar-overlay/0.88을 검사하지만 실제 toggle은 HSR/0.85. selector/fixture/resource drift 확인(W05-08), style 교체 제품 결함 증거로 사용하지 않음 |
| release notes | 3 | v0.3.0 펼침/lastseen을 하드코딩; CURRENT_VERSION=0.4.0. 기존 업데이트 동작과 기대값 불일치 |
| 설정 저장 desktop/iPad | 2 | 첫 설정 클릭은 utility menu를 열고 그 안의 설정을 눌러야 modal 진입. 같은 spec의 다른 사례는 두 단계 진입 후 통과. 값 저장 자체 실패로 단정하지 않음 |
| mobile token 입력 | 13 | RouteBriefingPanel.jsx:919의 IFR 점진 노출 조건으로 .rtf-box가 아직 없음. helper는 더보기/공항 선택 없이 곧바로 box를 기다림. 실제 모바일 토큰 입력 동작은 해당 실패에서 미실행 |
| 대안 batch 요청 계약 | 1 | 사라진 ‘적용’ 버튼을 대기. 현행 토큰 확정 적용 동작에 맞는 진입/oracle 필요. RF-110의 인자 문제와 이 timeout을 동일 원인이라고 하지 않음 |
| terminal 간격 | 1 | 국내 목적지는 의도적으로 local clock을 생략하지만 검사가 null의 bottom을 읽어 TypeError(W08-C06). 실제 간격 수치 회귀는 측정하지 못함 |
| 공항 모델 참고 | 6 | KIM 참고 확대 버튼/샘플 이미지 부재. W07-08 검수: 초기 탭은 sounding(단열선도)인데 테스트는 profile(연직시계열)을 기대. 실제 snapshot에 단열선도 이미지/확대 버튼 존재. 초기 탭 drift이며 EC 실제 F018 계산 오류 근거가 아님 |
| monitoring visual | 12 | desktop/iPad8건은 캡처의 자료·레이아웃 차이, mobile4건은 폭719 이하 `/` redirect 이후 monitoring selector 대기. 기대/실제 이미지를 확인했으며 전부 폰트 회귀로 단정하지 않음 |
| ground signage | 6 | header/row geometry16 또는23px 차이3건, 라벨/weekly 선택자 대기2건, reduced-motion0s 기대와 실제1e-05s1건. W08/W12에서 의미 있는 레이아웃 문제와 허용 motion 값 구분 |
| briefing cloud 캡처 | 3 | 실제 크기가 기대663×434에서663×462 등으로 변화. cloud geometry assertion과 screenshot 차이를 분리; 원인/의도 확인 전 baseline 승인 없음 |
| FPL 절차 토큰 | 3 | DOTOL2P pill0 기대1; snapshot의 STAR picker는 DOTOL2P인데 문자열에서는 절차 토큰이 빠짐. 실제 상태 불일치 관찰, 자동 적용·절차 sync의 정확한 원인은 추가 조사 |
| WebKit profile | 1 | 화면에 ‘Terrain tiles are not prepared’가 명시됨. 격리 root에 terrain 미복사, fixture로 처리되지 않은 응답 경로. 엔진의 렌더 결함이라고 판정하지 않음; interception/요청 경계를 먼저 조사 |

합계58. 좁은 원인이 미확인인 항목은 RF-123과 해당 영역 후속에 남긴다. 이번에는 앱 수정, 계약 수정, screenshot baseline 갱신·재승인, 실패를 숨기는 skip 추가를 하지 않았다.

85skip은 대부분 표면 전용이다: terminal46, ground-signage16, 나머지23은 desktop header/iPad NAVLOG/mobile exit·fullscreen·SID·자동생성·단계이동·NOTAM 등 명시 조건. skip은 통과 수에 포함하지 않는다. 세부 원문은 browser-main-summary.json 및 각 spec의 annotation. trace는 on-first-retry 설정인데 이번 retries0이므로 trace가 없을 수 있으며 screenshot/error-context/console을 근거로 썼다.

캡처는 Linux에서만 비교했다. fixture는 모든 화면의 시계를 고정하지 않고 모니터링은 Date.now 기반 자료를 만든다. Mapbox 외부 요청을 일부 fixture가 차단한다. console.json은 수집하지만 모든 console/pageerror가 자동 실패 oracle인 것은 아니다. QCD 실제 파일, live 수집, 인증 제공자 외부 callback, 장시간 전광판, 저장 원격/오프라인 충돌, 전체 지도 layer 조합, 실제 조직 파일 공개·PDF는 미실행 범위를 유지한다.

## B04 프론트 성능

production 산출물 현재 1,221파일 81,993,806 B. JS/MJS 32파일 6,324,993 B, CSS 12파일 1,057,658 B, font 812파일 15,934,512 B. 나머지는 이미지·정적 JSON/GeoJSON 등이다. 상세 `build-inventory.json`.

entry JS `index-CikAs0TS.js` 3,347,094 B / gzip level6 951,568 B, entry CSS `index-B5pDLqQa.css` 726,022 B / gzip level6 190,028 B. 이는 전체 파일 크기이며 실제 첫 화면 전송량과 다르다. Vite gzip 표시값은 별도 압축 구현·실행 조건의 값으로 구분한다. 조직·터미널·개발 화면의 지연 chunk가 존재하며 build 출력이 곧 초기 다운로드를 뜻하지 않는다. 과거 폰트 최적화 수치는 복사하지 않았다.

`python3 artifacts/refactoring/S004/run-command.py bench-browser-run node artifacts/refactoring/S004/bench-browser.mjs`, exit0, 104.61s. Chromium149.0.7827.55, production dist, 로컬 gzip(Node zlib level6) static harness+실제 test bootstrap API, viewport1440×900, CPU/network throttle 없음. API의 실제 env는 스크립트에서 DATA_PATH=perf-data/NODE_ENV=test/DISABLE_COLLECTION unset으로 바꾼다(driver receipt는 주입 전 값). auth/admin/background collector를 시작하지 않고 ADS-B/callsign은 harness에서 차단했다. 외부 Mapbox/font는 관찰하며 강제로 같은 응답을 만들지 않았다. 별도 agent는 읽기 전용 작은 조사만 수행했고 다른 검사·브라우저·빌드는 실행하지 않았다.

각 경로 5개 fresh context에서 첫 방문→같은 context 재방문, 각 상태 font ready 뒤3초 대기. 메인은 DOM shell과 map canvas 생성시각, 터미널은 option-one DOM 생성시각을 썼다. **메인 지도 실제 타일의 전체 준비 시간·LCP/INP·실기기 체감 시간을 측정한 것이 아니다.** 캡처를 확인했으며 터미널은 복사 자료와 현재시각 조합상 ‘금일 운항 종료’ 화면이다. 운항표가 채워진 장시간 전광판 성능으로 일반화하지 않는다.

표 값은 중앙값(최솟값–최댓값), 시간ms·전송bytes다.

| 경로/상태, n=5 | DOM 준비ms | canvas 생성ms | 브라우저 요청수 | local resource transfer B |
| --- | ---: | ---: | ---: | ---: |
| main-first | 363.9 (323.9–371.7) | 774.7 (592.9–818.7) | 118.0 (118.0–118.0) | 2125259.0 (2125259.0–2125259.0) |
| main-revisit | 198.8 (193.6–245.3) | 471.7 (431.3–531.1) | 109.0 (109.0–109.0) | 16772.0 (16772.0–16772.0) |
| terminal-first | 992.5 (985.1–995.9) | 해당없음 | 42.0 (41.0–43.0) | 1657136.0 (1636412.0–1657136.0) |
| terminal-revisit | 877.2 (865.9–898.6) | 해당없음 | 37.0 (37.0–37.0) | 2100.0 (2100.0–2100.0) |

local resource transfer는 main document 제외 Resource Timing 합계다. cross-origin TAO가 없는 응답은 크기0일 수 있어 전체 internet wire bytes라고 하지 않는다. 요청수는 브라우저 request event이며 cache 요청·worker/blob 등이 포함돼 완료 resource 수와 다르다. 서버 측 static body 전송 합계도 따로 수집했다(main first3,127,204 B/revisit5,445 B, terminal first 중앙1,553,243 B/revisit1,850 B). worker·main document·완료 시점의 범위가 달라 Resource Timing 합계와 직접 빼서 효과를 계산하지 않는다.

실제 main 초기 script는 entry1개(decoded3,347,094 B, encoded956,739 B), terminal은 **동일 entry+TerminalPage+공통 index**, script decoded3,431,544 B/encoded988,055 B다. 재방문에서는 script/CSS network transfer0이었다. 본문 gzip의 실제 Node/Vite 값과 앞의 별도 gzip 계산값은 구현·설정이 다른 측정으로 구분한다. lazy terminal runtime 분리는 이미 있지만 eager App import가 큰 main entry를 공유하므로 RF-124는 **화면 진입별 bundle 경계** 후보이지 기존 lazy 동작을 다시 구현하자는 제안이 아니다. 개발 DesignTest/기관 chunk는 이 초기 요청에서 다운로드되지 않았다.

지도 기본↔단색10회, 선택 직후2초 대기+매회 full GC: JS used heap33.72→95.88 MiB, canvas1개 유지, DOM nodes696→702, JS event listener265(일부268)→265, pageerror0. 선택 UI 반영 중앙63.57ms(56.25–241.87), 지도 타일 준비 시간은 아니다. 이 **단일 시계열만으로 누수를 확정하지 않고** fresh context의 idle 대조와 반복5회 추가 측정을 진행했다. `bench-map-memory.mjs/json`의 idle/switch 각5 fresh context 대조(각10회2초 대기, 매회 GC)가 종료0,246.32s로 끝났다. 증가 중앙값은 idle0.216MiB(0.205–0.231), switch62.009MiB(61.756–62.257), pageerror0. 전환에 종속된 증가가 반복됐으며 retaining owner·장기 plateau·해제 후 회수는 아직 확인하지 않았다(RF-126). GPU/WebGL/native memory와 장시간 plateau는 미측정이다.

캡처: `production-main-{first,revisit}.png`, `production-terminal-{first,revisit}.png`, `production-map-after-10-switches.png`. 원시 `bench-browser.json`, 요약 `performance-summary.json`.

## B05 서버·자료 처리

`python3 artifacts/refactoring/S004/run-command.py bench-api-run node artifacts/refactoring/S004/bench-api.mjs`, exit0, 5.21s. script 내부 DATA_PATH=perf-data, NODE_ENV=test, DISABLE_COLLECTION unset. 실제 Express app+store 초기화 후 ephemeral loopback port에서 요청했다. driver/server가 같은 Node 프로세스라 CPU/RSS에는 client·JSON 처리 overhead가 포함된다. 다른 전체 검사/브라우저와 순차 실행했다.

입력: RKSI[126.4407,37.4602]→[126.9,36.7]→[127.5,36]→RKPK[128.938,35.1795], 표본 간격250m, ETD2026-09-10T15Z/ETA16Z, 15,000ft. 시간 규칙은 같은 baseTime15Z와 마커3개·offset없음. KIM2026091006, KTG2026091000의 같은 자료를 사용했다. grid cold는 application cache만 clear하고 OS page cache는 비우지 않았다. 모든 요청은 HTTP200이며 단면은21levels다. get meta 첫 요청 n1은 초기 비용 참고값이고 나머지는 각각 n5다.

| 요청 | n | elapsed ms 중앙(범위) | CPU ms 중앙(범위) | 자료 read 횟수 중앙 | read bytes 중앙 | decoded 응답B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| snapshot-meta-first | 1 | 32.7 (32.7–32.7) | 35.2 (35.2–35.2) | 25 | 5405066 | 3823 |
| snapshot-meta-warm | 5 | 3.3 (3.2–4.2) | 6.4 (6.2–7.3) | 0 | 0 | 3823 |
| metar-warm | 5 | 3.3 (2.8–4.0) | 4.9 (1.9–7.3) | 1 | 54182 | 25479 |
| cross-section-grid-cold | 5 | 355.8 (285.9–387.4) | 458.2 (327.5–501.4) | 36 | 114736979 | 5153129 |
| cross-section-grid-warm | 5 | 112.4 (108.3–117.5) | 145.0 (134.2–162.9) | 4 | 63264 | 5153129 |
| cross-section-time-rules-same-hour | 5 | 289.2 (285.6–324.1) | 331.6 (323.1–349.1) | 35 | 114126422 | 5038181 |
| route-briefing-warm | 5 | 101.5 (81.5–127.6) | 117.7 (85.5–207.5) | 4 | 63264 | 46212 |
| model-comparison-RKSI | 5 | 8.4 (7.9–11.0) | 7.6 (7.0–14.9) | 12 | 1198266 | 125486 |

단면의 일반 warm 대비 시간 규칙 경로는 median112.35→289.23ms,4→35reads,63,264→114,126,422B였다. 입력 분기에 따라 응답 필드/계산이 약간 다르므로 2.57배 전체 차이를 전부 파일 cache 미사용의 인과 효과로 간주하지 않는다. `enroute-cross-section.js:215-227,273`에서 해당 KIM/KTG read가 공통 cachedGrid를 우회하는 코드와 관찰 I/O가 일치한다. 실제 사용자 경로는 waypoint 시간 offset/저장된 nwpTimeSelection의 refresh 및 후속 단면 요청이며 초기 모든 요청이 이 분기를 타는 것은 아니다.

RSS는 같은 프로세스 연속 workload 중 약225.7–842.1MB 범위였다. GC를 고정하지 않았고 V8 재사용·driver buffer가 포함되므로 endpoint별 독립 peak 또는 메모리 누수 값으로 사용하지 않는다. 각 sample의 before/after RSS와 grid cache hit/miss는 원시 bench-api.json에 있다. 시간 규칙 캐시 후보(RF-125) 외에 meta/METAR를 무조건 추가 캐시하는 작업은 추천하지 않는다. 정상 bounded cache와 snapshot-meta warm0 file read는 유지할 근거다.

원시 공급자 자료를 새로 수집하거나 실제 production collector/worker를 실행하지 않는다. 따라서 실제 수집 worker의 CPU·RSS, 장시간 메모리·자료 보존량 증가율은 미측정으로 남긴다. 이 제한을 API 측정값으로 대신하지 않는다.

## S009 마감 검증 추가 기록

S009 최종 `npm run check`은 고유 격리 `DATA_PATH`·`TMPDIR`, `DISABLE_COLLECTION` unset에서 exit 0이었다(`artifacts/refactoring/S009/final/s009-final-20260912T052829Z-1048414/logs/npm-check.exit`; 마감 문서 편집 뒤 같은 조건으로 재실행도 exit 0). 원본 `backend/data/projectamo.db` SHA-256은 전후 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62`이고, `git diff --check`, `AGENTS.md`와 `CLAUDE.md` 동일성, 3001/5173 비점유를 마감 불변식으로 확인했다.

이는 S004 B03의 357사례 결과나 B04/B05 성능 기준선을 대체하지 않는다. S009 browser는 RF-107~109 5 pass, admin 30, settings 5, RF-123 FPL 1·terminal 69·ground 8·monitoring visual 8의 집중 결과만 추가했다. 전체 browser final은 마지막 세 수정 전에 시작했다가 독립 검토 결함으로 중단했고 사용자의 과검증 중단 지시 후 재실행하지 않았으며, 모바일 route-token 최종 묶음도 중단되어 전체 pass 수로 합산하지 않는다.
