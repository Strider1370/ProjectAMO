# 경로·브리핑 생성 통일 — 구현 플랜 (Plan)

- 날짜: 2026-07-13
- 성격: **how**(구현 순서·검증). what/why는 스펙 참조.
- 스펙: [`docs/superpowers/specs/2026-07-13-route-briefing-unification-design.md`](../specs/2026-07-13-route-briefing-unification-design.md)
- 관련: #13 알림, 딥링크 '전체 브리핑 보기'

## 원칙
- **위험한 것 먼저, 관문 통과 못 하면 다음 단계로 안 넘어간다.** 특히 Phase 0의 payload 실측이 이후 저장 전략을 가른다.
- 프론트 브라우저 동작은 **Playwright**로만 검증(`docs/dev-server-and-capture.md` 절차). Preview MCP 금지.
- 백엔드는 각 변경 후 `npm --prefix backend test` 그린 유지. 프론트는 `npm run build` 그린 유지.
- 각 Task는 **verify를 통과해야 done**. 완료 시 이 파일 체크박스 갱신(세션 간 핸드오프 겸용).

---

## 진행 현황 (세션 간 핸드오프 — 갱신하며 진행)
- [x] Phase 0 — 측정·안전망 ✅ (0.1 실측: dual-save IFR만 / 0.2 스케줄러 폴백 + 테스트, backend 325 그린)
- [~] Phase 1 — 저장 포맷(skeleton 캡처) — 1.1 코드 완료(빌드 그린, payload 실검증은 Phase 3 브라우저 세션에 배치). 1.2는 Phase 3 새 로드에 통합.
- [ ] Phase 2 — TAF 바람 추출 + 규칙
- [ ] Phase 3 — 통합 조립(핵심)
- [ ] Phase 4 — 알림 정합
- [ ] Phase 5 — 정리·회귀

---

## Phase 0 — 측정·안전망 (먼저)

**목표: 저장 전략을 실측으로 확정하고, 포맷 바꾸기 전에 백엔드 안전망을 깐다.**

- [x] **0.1 payload 크기 실측** → **관문 (구체 방법)** ✅
  - 측정 스크립트 `backend/scripts/measure-route-payload.js` 작성: (1) 대표 경로 5~10개(조밀 IFR 경유점 30+, 경유점 많은 VFR 50+, 국내·해외 각각)를 실제 저장 스냅샷 형태로 구성, (2) `routeGeometry`+`enrouteGeometry` **둘 다** 넣은 payload의 `JSON.stringify(payload).length`(bytes) 출력, (3) 최대/중앙값 기록.
  - **결정 규칙(임계)**: 최대 **≤ 15KB → 둘 다 저장**(스펙 §4.1, 안전 마진). **15~20KB → 스켈레톤만 저장**(백엔드는 0.2 폴백으로 감시). 결과·선택을 아래 "0.1 결과" 칸에 기록하고, 그 값을 Phase 1·3·4의 저장/검증 형태에 전파.
  - verify: 스크립트 출력 수치 + 결정 기록. (스펙 §11-1)
  - **0.1 결과 (2026-07-13 실측, `backend/scripts/measure-route-payload.js`)**:
    - 실제 저장 경로(데모 RKSI→RJAA IFR): 407B.
    - 합성 worst-case: VFR 60경유점 13.5KB, IFR 절차150점 4.6KB, **극단 VFR 120경유점 26.7KB(초과)**.
    - **판정: "둘 다 저장 — 단 IFR만."** VFR은 절차가 없어 `routeGeometry`가 곧 스켈레톤이므로 `enrouteGeometry`를 **중복 저장하지 않는다**(→ VFR 용량 증가 0, 극단 VFR 초과 문제 원천 제거). IFR만 스켈레톤(≈0.5KB) 추가. 모든 케이스 상한 내.
- [x] **0.2 백엔드 스케줄러 폴백 선반영** (안전망 — 저장 포맷 바꾸기 전에) ✅ `p.routeGeometry ?? p.enrouteGeometry` + 유닛 테스트, backend 325 그린
  - `backend/src/alerts/scheduler.js` `buildBriefingRequest`: `const geometry = p.routeGeometry` → `p.enrouteGeometry ?? p.routeGeometry`.
  - **⚠️ 배포 순서 강제**: 0.2는 **프론트 Phase 1(저장 포맷 변경)이 배포되기 전에 운영에 먼저 올라가 있어야** 한다. 특히 0.1이 "스켈레톤만"으로 나오면, 0.2 없이 Phase 1이 나가면 `routeGeometry`가 없어 **알림이 조용히 무음**. → Phase 1 머지/배포 전 "운영에 0.2 폴백 반영됨" 체크 필수. 그리고 스켈레톤 저장분이 하나라도 생기면 **0.2 폴백은 영구 유지**(되돌리지 않는다).
  - verify: `npm --prefix backend test` 그린 + 유닛 추가(구 포맷=routeGeometry만, 신 포맷=enrouteGeometry만 둘 다 스케줄러가 경로를 찾는지).

---

## Phase 1 — 저장 포맷(skeleton 캡처)

> **0.1 분기**: Phase 1·3·4의 "저장/검증 형태"는 0.1 결과에 따라 갈린다 — **둘 다 저장**이면 payload에 두 geometry, **스켈레톤만**이면 `enrouteGeometry`만(백엔드는 0.2 폴백). 구현·검증 시 0.1 결과 칸을 먼저 확인.

- [ ] **1.1 저장 시 `enrouteGeometry` 추출·저장 (IFR만)**
  - `RouteBriefingPanel.jsx` 저장부: **IFR일 때만** `routeResult.previewGeojson.features.find(f => f.properties.role === 'route-preview-line').geometry`(증강 **전** 스켈레톤)를 `enrouteGeometry`로 저장. **VFR은 저장 안 함**(routeGeometry가 곧 스켈레톤 — 0.1 실측 결정). `routeGeometry`는 종전대로 계속 저장.
  - 로드 시: IFR은 `enrouteGeometry ?? routeGeometry`, VFR은 `routeGeometry`를 스켈레톤으로 사용.
  - **진입점 일관성**: 저장은 수동/로드/임포트 모두 이 저장부(`handleSaveCurrentRoute`)를 지나므로 한 곳만 바꾸면 됨 — 구현 시 세 경로 모두 이 저장부를 통과하는지 확인.
  - verify: **국내 IFR·해외 IFR·VFR 각각** 저장 → DB payload에 `enrouteGeometry` 존재 + `JSON.stringify(payload).length` ≤ [0.1 임계]. Playwright 3종.
- [ ] **1.2 하위호환 로드 폴백 (기존 운영 저장분)**
  - 로드 시 `enrouteGeometry` 없으면(구버전) `routeGeometry` 사용 + 절차 색/라벨 생략(스펙 §9). **백필/마이그레이션 안 함** — 구 경로는 영구 폴백으로 동작(재저장하면 새 포맷). 이 정책을 명시.
  - **해외 구 경로 방어**: 구버전 해외 경로는 `entryFix/exitFix`가 없거나 null일 수 있음 → 조립 시 null 접근 크래시 없이 스켈레톤(=`routeGeometry`)만으로 렌더. (스펙 §9)
  - verify: 구 포맷 저장분(국내 IFR·**해외 IFR** 각 1개)로 로드 → 오류·크래시 없이 브리핑 뜸. 해외는 `No RNAV route path`도 안 남(폴백이 저장 최종선 그대로 쓰므로).

---

## Phase 2 — TAF 바람 추출 + 규칙

> **배선 발견(구현 전 확정)**: 절차 재도출이 도는 `useRouteBriefing`은 현재 `{ activePanel, airports, metarData }`만 받고 **TAF는 안 받는다**. TAF timeline 구조는 `taf.timeline[] = { time, wind:{ direction, speed, gust, calm }, ... }`(백엔드 `selectTafAtEta` 패턴). → 2.x는 (a) 순수 헬퍼 작성 + (b) **TAF 데이터를 useRouteBriefing까지 prop으로 배선**(metarData 옆에 tafData 추가)해야 함. 프론트는 유닛 러너가 없어 순수 헬퍼는 node 자체검증(assert)로 확인하고, 통합은 Phase 3 Playwright로.

- [ ] **2.1 TAF 특정 시각 바람 헬퍼**
  - TAF timeline에서 주어진 시각(ETD/ETA)에 유효한 풍향/풍속 반환(`taf-window.js`의 `metricsAt` 패턴 재사용; base/BECMG/TEMPO 병합). 위치(프론트/백엔드)는 절차 재도출이 도는 쪽(프론트)에 맞춘다.
  - verify: 유닛 테스트 — base 바람, 시간창 그룹 전이, 시각 경계.
- [ ] **2.2 "TAF 안/밖" 바람 소스 규칙**
  - ETD가 출발공항 TAF 유효기간 안 → 예보 바람; 밖 → 현재(METAR) 바람. 도착은 ETA·도착공항 TAF 동일. TAF/METAR 다 없으면 기본 활주로(기존 규칙).
  - verify: 유닛 테스트 — 안/밖/무TAF 분기 각각.

---

## Phase 3 — 통합 조립 (핵심)

- [ ] **3.1 새 조립 로드 액션(재검색 없음) + 최소 routeResult**
  - 저장 `enrouteGeometry`(없으면 `routeGeometry` 폴백, §1.2) + `routeForm` 로드. `runRouteSearch` **호출하지 않음**.
  - **최소 routeResult 형태(명시)**: `{ flightRule, departureAirport, arrivalAirport, previewGeojson: { type:'FeatureCollection', features:[{ type:'Feature', properties:{ role:'route-preview-line' }, geometry: <저장 스켈레톤> }] } }`. 이 형태가 지도 렌더(`syncRoutePreviewLayers`가 `previewGeojson`·없어도 안전한 `navpointIds` 사용)와 3.2의 `augmentRouteWithProcedures`(route-preview-line feature를 찾음)에 그대로 들어맞는지 확인. 구버전(스켈레톤 없음)이면 `legacy` 플래그를 세워 3.2를 건너뛴다.
  - **기존 경로 분리(회귀 방지)**: 딥링크·'로드' 버튼만 이 새 경로로. **수동 편집은 `loadSavedRoute`를 안 거치고 `handleRouteSearch`(검색)로 진행**하므로 자연 분리됨 — 새 액션은 별도 함수로 두고 기존 `loadSavedRoute`(재검색)는 수동/임포트가 안 쓰면 정리(dead 여부 확인 후 제거 또는 유지).
  - verify(Playwright): 국내/해외/VFR 저장분 로드 → 지도에 경로 선 뜸, 저장 버튼 활성(스펙 §11-4). **수동 검색 IFR 회귀**(검색→브리핑) 여전히 동작.
- [ ] **3.2 국내 IFR 절차 재도출 (데이터 로드 게이트 — 명시적 await)**
  - **게이트 방법(명시)**: 3.1 로드에서 `setRouteForm` 뒤, 국내 IFR이면 절차 데이터를 **effect 발화에 맡기지 말고 직접 await**:
    `await Promise.all([getProcedures(dep,'SID'), getProcedures(arr,'STAR'), loadIapData(arr)])` → 그 결과로 상태 세팅 → **그 다음** 재도출. (스펙 §6 경고: effect-사슬 타이밍 footgun 재발 방지.)
  - 재도출: 2단계 바람으로 `pickBestRunwayGroup`→`filterProceduresByRunway`→저장 entry/exitFix에 잇는 SID/STAR 선택 → `augmentRouteWithProcedures`로 최종 geometry.
  - 폴백: 절차 데이터 없거나 매칭 실패 → 스켈레톤 그대로(스펙 §9).
  - verify(Playwright, 네트워크 스로틀로 데이터 지연 재현): 절차 색·라벨 렌더; 지연/실패 시 스켈레톤 폴백(크래시·빈 화면 없음).
- [ ] **3.3 브리핑 호출·렌더**
  - 즉석 eta(거리+속도) 산출 → `/api/route-briefing` → `BriefingView` 렌더.
  - verify(Playwright): 브리핑 섹션 렌더.
- [ ] **3.4 진입점 배선**
  - 딥링크 '전체 브리핑 보기'(MapView imperative handle) + 저장 '로드' 버튼을 새 조립으로. **수동 편집·파일 임포트는 기존 유지**(스펙 §6).
  - **테스트 데이터 준비**: 해외 IFR(RKSI→RJOA) 저장분을 dev 콘솔(`dev/scenario.js`)/시드로 미리 주입(enrouteGeometry + routeForm flightRule='IFR'). 로그인·저장데이터 준비를 Playwright 셋업에 포함.
  - verify(Playwright): **딥링크 → 해외 IFR(RKSI→RJOA)에서 `No RNAV route path` 없이 브리핑 뜸** (핵심 성공 기준). 스크린샷 첨부.

---

## Phase 4 — 알림 정합

- [ ] **4.1 재저장 시 알림 캐시 무효화**
  - **주체·시점(명시)**: 경로 재저장(`POST /routes` 또는 알림 등록)이 성공하면 그 route의 `snapshotCache` 항목을 무효화한다. 두 방법 중 택1: (a) 저장 핸들러에서 `snapshotCache.delete(routeId)` 호출(같은 프로세스라 직접 접근), (b) 캐시 키에 `hashOf(geometry)` 포함해 geometry 바뀌면 자동 miss. (a)가 단순 — 우선.
  - **테스트(먼저 작성, 실패 확인 후 구현 — TDD)**: `backend/test/alert-scheduler.test.js`에 추가 — baseline 스냅샷 저장 → 같은 route의 geometry를 바꿔 재저장(캐시 무효화) → 다음 tick에서 **날씨 동일한데도 전 구간 신규 발화가 나지 않음**(`changes.length === 0`) 단언. (스펙 §11-2)
  - verify: 위 유닛 테스트 그린.
- [ ] **4.2 알림 감시 경로·eta 정합 확인(문서화)**
  - 알림은 저장 geometry 그대로 감시(무변경), 절차 재도출은 화면 전용임을 코드 주석/스펙에 고정. eta 화면/알림 차이 명시(스펙 §11-3).
  - verify: 알림 등록→예보 변경 주입(dev 콘솔)→재평가에서 경로 감지, 해외 `No RNAV` 없음.

---

## Phase 5 — 정리·회귀

- [ ] **5.1** `npm --prefix backend test` 전체 그린 + `npm run build` 그린.
- [ ] **5.2** `Architecture.md`/`EntryPoints.md`에 새 조립 경로 반영(경로 생성 진입점 통일).
- [ ] **5.3** `graphify update .`
- [ ] **5.4 전체 Playwright 회귀**: 국내 IFR · 해외 IFR · VFR · TAF창 안/밖 SID 변화 · 딥링크 브리핑=알림 경로 일치 · 구버전 저장 폴백.

---

## 전체 성공 기준
1. 저장 비행(국내 IFR·해외 IFR·VFR) 딥링크/로드 시 **재검색 없이** 브리핑이 뜬다. 해외에서 `No RNAV route path` 안 남.
2. 국내 IFR은 **출발/도착 시각 예보(TAF) 바람 기준 SID/STAR**로 그려진다(예보 밖이면 현재 바람).
3. 알림이 감시하는 경로와 딥링크 브리핑 경로가 (날씨 판정상) 일치.
4. 구버전 저장분·payload 상한·알림 캐시 모두 안전(각 관문 통과).
5. 백엔드 테스트·프론트 빌드 그린.

## 리스크·롤백
- 각 Phase는 독립 커밋. 문제가 크면 해당 Phase만 되돌린다 — **단, 아래 배포/포맷 커플링 주의.**
- **배포 순서 커플링(중요)**: 백엔드 0.2(폴백)는 **프론트 Phase 1보다 먼저 운영 반영**. 스켈레톤 저장분이 하나라도 생기면 **0.2 폴백은 영구 유지**(되돌리면 그 경로들 알림 무음). Phase 1을 되돌려도 이미 저장된 신 포맷 데이터는 남으므로, **롤백 시 0.2는 함께 되돌리지 않는다**(앞으로 호환 유지).
- Phase 0.2(폴백)와 4.1(캐시)은 **알림 무음/헛발화** 직결 → 우선 검증.
- payload 실측(0.1)이 "스켈레톤만"으로 나오면 1.1을 그 경로로만 구현(백엔드는 0.2 폴백으로 이미 대비).
- **5.4 회귀 실패 시 분기**: (a) 특정 Phase X 시나리오 단언 실패 → Phase X + 하위 되돌림. (b) 데이터 로드불가(경로 안 뜸) → Phase 1·3·4 되돌리고 **Phase 0.2 폴백은 유지**. (c) 성능 저하 → 원인 Phase 조사·최적화. 위기 시 즉흥 결정 대신 이 표를 따른다.
