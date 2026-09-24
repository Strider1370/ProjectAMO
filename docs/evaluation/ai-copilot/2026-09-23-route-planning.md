# 경로 계산 공용화 (5A)

후속 상태(2026-09-24): [항법자료 publication 교체·브라우저 갱신 연속 인수](2026-09-24-legacy-publication.md) 네 화면/엔진4건 및 관련 합동64건을 통과했다. 아래 ‘운영 갱신 인수 남음’은 당시 기록이며, 운영 원본 변경/배포와 격리 자료 인수를 구분한다.

## 구현과 경계

- 루트 `shared/route-planning/`에 환경 독립 계산을 추출했다. 기존 frontend 경로 모듈은 호환 export/브라우저 adapter이며 backend는 frontend **소스**를 import하지 않는다. 서버 파일 adapter가 기존 배포 항법자료인 `frontend/public/data/navdata`를 읽는 것은 별도 자료 의존성이다.
- `createNavdataProvider({readJson, publicationId})`가 파일 읽기·합성 그래프·절차·IAP 캐시의 수명주기를 소유한다. 동시 호출은 같은 promise를 공유하고 실패한 파일 읽기는 재시도한다. 새로운 publication은 새 인스턴스를 사용하며 이전 계산의 캐시를 별도로 비우지 않는다.
- 서버 `createFileRoutePlanningProvider`는 항법/국내 절차 파일과 누락 상태를 한 번에 캡처하고 내용 hash를 붙인다. 브라우저와 동일한 graph 입력을 위해 선택적 해외 확장 파일도 캡처하지만 새 서버 진입점의 지원 범위는 국내 IFR 그대로다. 캡처 전후 파일 identity가 바뀌면 거부한다. production에서는 `frontend/dist/data/navdata`의 같은 파일군 hash와 비교해 불일치를 거부한다(`servedNavdataRoot`로 배포 경로 주입 가능). 브라우저는 기존 HTTP reader와 페이지 수명 캐시를 유지한다. 실행 중인 페이지의 자동 AIRAC 교체/파일군 원자 배포까지 완성했다고 주장하지 않는다.
- `planRoute`는 국내 IFR의 절차 선택 → 항로 문자열 → 편집기의 확장/정규화 → 절차 좌표 결합 → 공통 routeModel → 프로파일 입력/ETA를 합성한다. 호출자에게 ETD·고도·TAS를 요구한다. 미지원 범위·경유 조건을 임의로 버리거나 모델이 좌표를 만들지 않는다.
- 화면의 자동 생성·수동 적용도 공통 `prepareRouteDraft`, `buildEditorPreview`, `buildAppliedRouteInputs`를 사용한다. React 수명주기/요청 revision/지도·초안 변경·기상 호출은 기존 hook에 남긴다. VFR/해외/기관 기존 흐름을 새 국내 IFR 진입점으로 제한하지 않는다.
- 기본 성능 상수는 shared로, 사용자 localStorage는 frontend에 남겼다. Mapbox layer/interaction도 frontend에 남기고 순수 geometry만 옮겼다. 새 dependency·LLM 호출·기상 수집·배포 없음.

## 추출 전 비교 기준

`shared/fixtures/route-planning-baseline.json`을 **기존 코드로 먼저** 생성했다. 이후 테스트가 자기 구현으로 기대값을 다시 만들지 않는다. 항법자료 publication `2026-06-25`, ETD `2026-09-23T12:03:00Z`, FL310, TAS450, 입력 풍향 고정. 이는 계산 동등성 fixture이지 최신 운항 자료 인수가 아니다.

| 조건 | 출발 절차 / 도착 절차 / 대표 접근 | 기존 전체 거리 추정 | ETA |
| --- | --- | ---: | --- |
| RKSS→RKPC, 양쪽 270° | BULTI2T / DOTOL2M / DUKAL RWY25 | 243.55 NM | 12:35:28.400Z |
| RKPC→RKSS, 양쪽 90° | KAMIT2E / OLMEN2U / DOKDO RWY14L | 246.31 NM | 12:35:50.480Z |
| RKSI→RKPK, 양쪽 180° | OSPOT2H / GAYHA3KALOD / GAYHA RWY18 circling 대표선 | 184.83 NM | 12:27:38.640Z |
| RKSS→RKPC, 풍향 없음 | BULTI2U / DOTOL2P / YUMIN RWY07 | 243.55 NM | 12:35:28.400Z |

좌표 몇 개만 비교하지 않고 편집기 전체·최종 geometry·routeModel·profile request의 SHA-256 및 원래 절차 ID·문자열·거리·ETA를 대조한다. 추출 후 Node와 실제 Chromium 브라우저에서 네 조건 모두 일치했다. 서버에서 생성한 네 결과는 기존 `normalizeRouteContext`와 서버 절차 catalog 검증도 issues 없이 통과했다.

기존 의미를 보존한다: 풍향이 없으면 첫 활주로 그룹, 경로 후보는 기존 전체 거리 추정 순서, ETA는 기존 거리/TAS 추정이다. 대표 접근선·풍향 누락·ETA 근거를 `assumptions`에 명시한다. 실제 허가 경로, 안전 순위, 풍향 보정 성능 계산 또는 최신 AIRAC 확인으로 포장하지 않는다.

## 발견과 검증

- 최초 desktop browser: 계산 동등성 1 pass, 실제 자동 생성 UI 1 fail. 공항을 입력한 직후 버튼을 누르면 패널의 절차 배열이 아직 비어 있어 추천이 null로 끝났다. 브라우저 adapter가 클릭 시 캡처한 공항의 절차/IAP를 기다리도록 보완했다. 이후 해당 UI 1 pass. 고정 sleep으로 문제를 감추지 않았다.
- root shared planner 10개, backend file provider 3개 최종 통과. 새 publication의 그래프/절차/IAP 분리, 이전 snapshot 보존, 누락 IAP 유지, 수동 DCT/사용자 지점/VFR, 미지원/잘못된 입력 거부, AIRAC 이름이 같아도 내용이 다른 빌드 거부 포함. `route-planning-provider-final.log`.
- `npm run check` 최종 실행 성공: backend **1,354 pass / 1 skip**, frontend **1,706 pass**, shared **24 pass**(새 planner 10개 포함), launcher7/nginx4 및 production build 성공. 기존 large chunk 경고 유지. 이후 backend provider 테스트에 서버 context/절차 catalog 대조 assertion을 추가하고 해당 2개 재실행 성공. `route-planning-final-check.log`, `route-planning-context-check.log`.
- 위 전체 검사 뒤 production 빌드 대조와 선택적 graph 확장 캡처를 보완했고, backend/shared **13/13**을 재실행했다. 로컬 production 모드 provider 생성에서 원본/빌드 파일군 hash 일치도 확인했다(`route-planning-build-match.json`). 실제 운영 서버 배포/기동 검증은 아니다.
- 브라우저 회귀 **55 pass / 6 skip**, retries=0, 8.9분. desktop/iPad Chromium/mobile/iPad WebKit의 새 계산 동등성·자동 생성 **8/8**, 기존 입력안·늦은 응답 8개, 토큰 12개, desktop/iPad/mobile 가져오기 12개와 워크플로 15개 통과. 기존 workflow의 화면별 6 skip은 성공에 넣지 않았다. 새 계약 console 파일 8개에서 pageerror 0. `route-planning-browser-regression.log`.
- 기존 해외/FIR 후보 선택·수동점/저장 경로 복원 단위 회귀도 전체 frontend 검사에 포함된다. 해외/기관의 실제 인증 브라우저 전체 인수를 추가 실행했다고 주장하지 않는다. 서버와 MCP 기존 프로세스는 재시작하지 않았으며 이번 계산 모듈은 아직 대화 실행기에 연결하지 않았다.

## 남은 범위

5B의 자연어 입력 확인→생성 도구→소유자 context 등록→브리핑→화면 열기/MCP 연결은 아직 아니다. 3~4단계 잔여 실제 인증·공급자 연속 인수, 실자료 단면/고도 비교 설명, 6 저장 경로/알람, 7 전체 품질·운영 인수도 남는다. Luna 추론 기본값과 `.env`는 바꾸지 않았다.
