# A01·A11·A15 공통 경계 조사 — S004

기준 `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41`, `main`, 2026-09-12. 주 담당의 읽기 전용 조사다. 현재 세션 문서 변경 외 앱 소스 변경은 없다. 최종 OBS 대응은 상위 [진단표](../audit.md)에서 관리한다.

## A01: 범위와 import 경계

`git ls-files -z` 2,248개를 15영역에 주 소유자 하나씩 배정했다. 원시 파일별 표와 분류 스크립트는 `artifacts/refactoring/S004/{inventory.json,inventory.mjs,tracked-files.zlist}`. 테스트는 A13, 자산/CSS는 A12를 우선 배정하고 기능별 조사는 이 교차 영역까지 소비자로 추적한다. 분류 수는 읽기 완료 수나 복잡도 지표가 아니다.

- 진입: `frontend/src/main.jsx → app/App.jsx → 메인 shell/MapView` 및 `/monitoring`, `/terminal`, `/lounge`, `/airport/:icao/models`, `/admin`. `/test`, `/draw`, `/kml`, `/dev`는 DEV 조건의 진입이다.
- 서버: `backend/server.js → HTTP adapter, auth/session, organizations, briefing, admin/dev`; `backend/src/index.js → collector-registry → processorBindings/runWithLock → processor → 일반 store/전용 격자·영상 store`. `collect.js`는 수동 단발 진입이다.
- 일반 자료: `api-client/parser → processor → liveCache 및 DATA_PATH → 활성 뷰 cache → readLatest/snapshot-meta → weatherApi/useSnapshotPolling → 화면`. 기관 고정 브리핑과 개인 경로는 별도 서비스·저장 계약을 유지한다.
- 소스 graph: 테스트 제외 JS/MJS/JSX 601개, 상대 literal import/export/dynamic import 1,297 edges. 금지 방향(backend→frontend/src, frontend/shared→app/features) 0, 다중파일 SCC 0. 86개 unresolved target은 모두 CSS/자산이다. 정규식 기반이므로 계산식 import, CJS require, import.meta.glob, CSS @import, 런타임 파일 읽기는 이 수치 밖이다. import 순환이 전혀 없다는 전체 증명으로 쓰지 않는다.
- 별도 tooling 예외: `backend/scripts/audit-terminal-{destinations,airlines}.mjs`는 frontend terminalFlightSimulation을 직접 import한다(W02-08). 런타임 source graph 밖의 실제 두 경계 위반이며, root 개발 도구 이동 또는 명시적 tooling 예외 후보로 보존한다. runtime 0건 수치를 저장소 전체 0건으로 해석하지 않는다.
- `backend/src/config.js`가 `frontend/public/data/navdata/airports-overseas.json`을 읽는 것은 프론트 JS import가 아닌 정적 공항 목록 공유다. 소유권을 정리할 여지는 있으나 해당 이유만으로 금지 import로 집계하거나 복사본을 새로 만들지 않는다.

판정: 현재 기능 소유권과 backend/frontend 경계 유지. server.js/MapView/useRouteBriefing의 크기만으로 분리 작업을 선정하지 않는다. 구체적인 오류·검증 경계를 먼저 카드로 만든다. 동적 import 전체 AST 증명과 운영 bundle graph는 추가 확인이며, 성능은 B04에서 실제 요청으로 구분한다.

### S004 주 담당의 근거 재확인

다음 임시 도구는 실제 소스의 함수/훅/라우터를 사용했고 앱 파일은 변경하지 않았다. 메모리 DB·synthetic session/응답·artifacts 자료만 사용하며 실제 외부 발송/수집은 없다. 도구와 JSON/log는 `artifacts/refactoring/S004/`에 있고, 원시 파일이 없을 때도 [보고서](../report.md)의 입력·결과로 재구성할 수 있다.

| 임시 도구 | 실제 확인한 좁은 경계 | 일반화하지 않은 범위 |
| --- | --- | --- |
| repro-data-view | airport_info의 demo fallback→live 게시 | 나머지6 collector는 코드 확인 |
| repro-collector-boundaries | 해외예보 pre-abort→빈 게시, coords-only KTG 완료,20ms timeout/body80ms 성공 | 실제 upstream·모든 취소/중단 단계 |
| repro-polling-keys / repro-client-decode | NOTAM 초기전용 diff, convective key, optional200 malformed body→bundle reject, null/undefined 차이 | NOTAM 초기전용은 명시 테스트의 의도이므로 단순 버그 해석 철회 |
| repro-polling | production React hook·제어 clock에서 두 initial 응답 역순→옛 값 commit | fixture의 old-live/new-demo 이름은 label이며 실제 view 전환 재현은 아님 |
| repro-saved-route | 복원한 routeModel의 enRouteSegments/sourceCycle이 refresh·재저장에서 소실 | 실제 저장HTTP/모든 대안 geometry |
| repro-raster | actual transition controller A→B pending→A→늦은B에서 표시 B | 실제 Mapbox style 전체 및 장기 memory 원인 |
| repro-observations | wind unit/missing·VV200·AMOS500의 두 소비자 결과 | 원자료 AMOS unit 및 공급자 발생 빈도 |
| repro-organization | 메모리DB actual create/validator로 material400·geometryA/B·invalid복합alert400뒤version2 | 실제 다중창/파일경합/전체권한HTTP |
| repro-terminal | nullAMOS+METAR25→0°C, cursor1의 새편성3회old | 부모 rail 전환은 정적추적, 장시간browser는 미실행 |
| repro-admin | 미적재health의4신호ok, 낙뢰0/공항2→activeCount2, 불완전db명만으로오늘백업true | 실제HTTP/운영 장애·프로세스 중단/restore 미실행 |
| repro-personal | actual HTTP routes/alerts: T1감시/T0재개,3원본+2감시→5상한, invalidETA POST201/PATCH200 | 실제로그인·push·개인화면·3공항 평가 |

대표 성능은 [기준선 B04/B05](../baseline.md)에 별도로 있다. 지도 전환 heap은 idle/switch 각5 대조까지 했으나 retaining owner·plateau·해제 후 회수는 미확인이다. 전광판 측정은 운항 종료 화면이어서 populated board의 장시간 성능이 아니다. 기관24 browser pass도 파일경합/권한회수/409 계약 전체의 증거가 아니다.

## A11: 시간·부분 실패·활성 뷰

읽은 계약: data-and-time, route-briefing-source-contract, map-and-layers, entry-sequences. 직접 대조: `shared/{route-model,nwp-time-selection,briefing-status}.js`, `backend/src/{store,config}.js`, `dev/{data-view,demo-mode}.js`, `briefing/{confidence,briefing-composer,enroute-cross-section}.js`, 서버 latest/snapshot-meta/briefing 경로, `frontend/src/{app/{useWeatherPolling,snapshotMeta,pollingData},api/weatherApi,shared/{timezone/TimeZoneContext,demoMode/useDemoMode,weather/helpers}}`.

유지할 구조:

- 저장·비교는 UTC/epoch, compact 시각은 source parser 경계, 표시 UTC/KST는 별도 선택. 경로 거리·시각 규칙과 unresolved 상태는 root shared 모델을 재사용한다. 사용처의 기본 시각 인수는 실제로 주입되는지 대조하며 `Date.now()` 문자열만으로 결함을 판정하지 않는다.
- `pollingData.mergePollingData`는 실패 `undefined`를 이전 값으로 유지하고 HTTP 200 `null`을 실제 빈자료로 받아들인다. 일부 키 실패 시 snapshot을 전진시키지 않는 현재 폴링 규칙은 재시도 가능성을 보존한다.
- `data-view`는 `.active-data` symlink rename과 `.view.json`으로 모드·revision·유효시각을 묶는다. collector의 base_path와 화면의 active_path가 분리돼야 한다. 기존 시연 뷰 구현 전체를 재작성할 필요는 없다.
- `confidence`는 missing/stale METAR와 TAF의 ETA 비포함을 서로 구분한다. 정상 상태로 채우지 않는 shared briefing 상태 모델을 유지한다.

### MAIN-01 — 시연 캐시를 실황 수집기의 이전 값으로 사용

확인된 오류. `airport-info-processor.js:42`는 실패 공항을 `store.getCached('airport_info')`에서 보충한다. 이 API는 `store.js:253`의 활성 화면 cache이고, 저장(`store.save`)은 항상 실황 base_path에 게시한다. 따라서 시연 중 해당 수집기가 실패하면 과거 시연 자료가 실황 최신 파일에 들어갈 수 있다. `data-view.js`의 원자 전환 자체가 원인은 아니다.

주 담당 임시 재현: `node artifacts/refactoring/S004/repro-data-view.mjs` 종료 0. 독립 artifacts root에 `live-value`와 `demo-value`를 준비하고 demo view 활성화, 15개 fetch를 모두 synthetic 오류로 대체. 외부 호출 0. `processAirportInfo()`가 `saved:true`를 반환하고 실황 `airport_info/latest.json`의 RKSI는 `_stale:true, diagnosticSource:demo-value`; 유지했어야 할 이전 실황은 `live-value`였다. 원시 결과 `repro-data-view.json`.

영향: 시연 종료 뒤 실황 API/공항 안내에 과거 시연의 공항정보가 남을 수 있다. 코드 패턴은 takeoff_fcst·TAF previous·ground_forecast·terminal_flights·overseas_forecast 및 flight-category 파생 경계에도 존재하므로 W03의 기능별 대조를 통합한다. 이 재현은 airport_info 한 종류만 실행한 증거이며 다른 종류의 런타임 재현을 대신하지 않는다.

제안: collector가 이전 실황을 읽는 API를 명시적으로 제공하고 화면 읽기와 호출자를 분리. 각 타입의 부분 실패·TAF previous·파생 입력을 같은 기준으로 검증한다. 저장 형식 변경 없이 할 수 있는 범위부터 선정하며, 사용자 선정 전 구현하지 않는다.

### MAIN-02/03/04 — 취소·KTG 완료·전송 body 수명 추가 재현

`node artifacts/refactoring/S004/repro-collector-boundaries.mjs` 종료 0, 외부 fetch 0. 모두 artifacts의 독립 data root 또는 fake response만 사용했다.

- 해외 예보: 이전 RJAA 자료를 저장한 뒤 함수 호출 전에 AbortController를 abort. 반환 `saved:true, airports:0, failed:[]`, 실황 latest의 airports는 빈 객체. 실패 fallback 문제와 별개의 취소→게시 결함을 확인했다.
- KTG: 1×1 coords만 있고 고도 grid가 없는 회차, forecast_hours=[0]으로 제한. 첫 process는 `hours:1, altLevels:0`의 index/latest를 게시, 두 번째는 `already_collected`. 기존 파일별 원자 쓰기는 회차 완료를 보장하지 못한다.
- transport: 선언 timeout20ms에 header는 즉시 반환하고 body는80ms 뒤 완료하는 fake fetch. 요청은 status200/success이고 전달받은 signal은 abort되지 않았다. body deadline 밖이라는 코드 의미를 확인했으며 실제 공급자 timeout 발생 빈도는 측정하지 않았다.

각 변경 후보의 범위·위험·선행·검증은 [보고서 RF-101/102/105](../report.md)에 기록한다. 기존 소스를 수정하지 않았다.

### 추가 확인할 질문

- data-view 변경 중 initial/poll/deferred 요청이 서로 뒤늦게 완료되면 이전 뷰 값이 새 뷰 state를 덮는가? `useSnapshotPolling`의 mountedRef는 세대 구분이 아니므로 W04에서 호출자와 재현 절차 확인.
- `canonicalHash`는 `_stale`와 fetched_at을 제외한다. 단순 staleness 변경이 snapshot hash를 바꾸지 않는 것은 사실이나 실제 UI stale 소비자·별도 health 표시까지 확인하기 전 독립 결함으로 확정하지 않는다.
- `formatRvr()`의 없는 항목 → `2000+`는 주석으로 명시된 현행 표시 규칙이다. 도메인 계약을 따로 검증하지 않은 상태에서 리팩토링으로 표시 의미를 변경하지 않는다.

## A15: 문서·프로토타입·기타 추적 파일

- 현재 진입 문서는 AGENTS/CLAUDE, Architecture, docs/README, policies와 operations다. 공통 안내 두 파일은 동일하게 유지한다. docs/archive의 과거 테스트 개수·완료 기록을 S004 기준선으로 쓰지 않았다.
- `prototypes/destination-weather-comparison/AGENTS.md`를 읽었다. 이 디렉터리는 자체 package/Vite와 Sites build/worker/test:sites가 있는 독립 프로토타입이다. 서브 지시의 화면 구현·시각 변경·Sites handoff 조건은 이번 읽기 전용 진단에서 실행 조건이 아니다. 주 앱에서의 직접 import는 발견하지 못했으나 자체 build/배포 소비자가 있으므로 미사용 삭제 후보로 삼지 않는다. 실제 외부 Sites 배포 여부는 미확인이다.
- `prototypes/skewt/`는 thermo/Skew-T 계산 스크립트와 HTML/SVG/PNG 연구 산출물이다. 주 앱 production 진입에서 참조하지 않는다. 연구 재현 용도로 보존하며 이 진단에서 생성 스크립트 실행은 하지 않았다.
- `frontend/src/features/design-test/`는 실제 `/test` DEV 진입이다. 외부 프로토타입과 다르며 이름만으로 제거하면 개발 디자인 확인 기능을 잃는다. build에서 DesignTestPage chunk가 출력되는 사실과 사용자가 실제 내려받는지는 B04에서 분리한다.
- `frontend/graphify-out`, `backend/graphify-out`는 추적된 생성 분석 결과이고 손코드 복잡도에서 제외했다. `reference/html/KR-ENR-{3.1,3.3,4.1}-en-GB.html`은 AIP 조사·변환 원본 계열이다. navdata 생성기는 scripts의 reviewed AIP → enroute.json 경로이며 공항/해외/procedure 목록과 분리돼 있다. AIP HTTP 최신 자료 자체는 외부 확인하지 않았다.
- 현행 운영 문서의 Cache Policy는 API별 no-cache/no-store를 구분하나 같은 문서 After deploy는 모든 `/api/*`가 no-store라고 검사하도록 적혀 있다. `server.js sendRevalidatedJson`과 캐시 회귀 테스트는 ETag/no-cache를 명시한다. 문서만 믿고 정상 revalidation을 제거하는 일을 막도록 후속 문서 후보에 포함한다.
- 계약 등록부에는 과거 통과 날짜, 24개 계약이라는 설명, 제한된 등록 목록이 남아 있다. 실제 spec/engine/fixture 목록은 W01에서 대조하고 S004 실행 결과와 별도로 표시한다.

판정: archive/연구/프로토타입 보존. 실행 가능한 현행 안내의 fixture·환경·캐시 검사 문구는 근거에 맞추는 소규모 후보. 이번에는 정책·운영 문서도 고치지 않고 진단 문서에만 차이를 기록한다. 외부 CI·운영 nginx/PM2·Sites 실제 상태는 읽지 않았으며 로컬 코드 진단을 운영 상태 확인으로 표현하지 않는다.
