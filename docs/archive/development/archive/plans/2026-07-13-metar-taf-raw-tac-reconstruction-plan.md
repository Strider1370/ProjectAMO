# METAR·TAF 원문(TAC) 재구성 표시 — 구현 플랜 (핸드오프)

> 상태: **미구현 / 조사·설계 완료.** 이 환경은 KMA API가 TLS로 막혀 실제 원본 IWXXM 확인이 불가 → TLS 되는 환경에서 이 문서 보고 이어서 구현.
> 작성: 2026-07-13

## 1. 목표

공항 패널 **METAR 탭·TAF 탭 하단**에 원문(TAC 형식) 전문을 표시한다. 국내(KMA) 자료는 IWXXM로 받아 구조화 파싱하므로 원문 TAC가 없음 → **구조화 데이터에서 TAC 문자열을 재구성**해서 표시한다. 외국 공항은 이미 표시 중(변경 없음).

## 2. 현재 상태 (조사 결과)

### 프론트 — 이미 준비됨, 값만 채우면 됨
- `frontend/src/features/airport-panel/tabs/MetarTab.jsx` — `metar?.header?.raw_text` 있으면 "원문 (TAC)" 블록 렌더.
- `frontend/src/features/airport-panel/tabs/TafTab.jsx:158` — `taf?.header?.raw_text` 있으면 렌더. `formatTafTac()`로 줄바꿈, `RAW_TAC_STYLE` 인라인 스타일(같은 파일 L25에서 export).
- 즉 **백엔드가 국내 `header.raw_text`를 채우면 프론트 변경 없이 자동 표시**.

### 백엔드 — 외국 vs 국내
- 외국(NOAA): `backend/src/parsers/noaa-metar-parser.js:156` `raw_text: rawOb` — NOAA API가 원문 TAC를 그대로 줌. 진짜 원문.
- 국내(KMA): `backend/src/parsers/metar-parser.js` — IWXXM XML → 구조화. 원문 TAC 없음(L155 주석: "KMA=IWXXM은 원문 없음").
- 수집 파이프라인: `backend/src/processors/metar-processor.js:18` `const xml = await apiClient.fetch("metar", icao)` → `metarParser.parse(xml)`. **원본 IWXXM XML은 수집 시점에 손에 있음**(파서에 넘어가지만 파서가 일부만 읽고 버림).

### 재구성에 쓸 토큰 — 이미 파싱되어 존재
- METAR: `observation.display`에 wind(`19008KT`)·visibility(`9999`)·weather·clouds(`FEW030 BKN200`)·temp(`29/25`)·qnh(`Q1010`). 추가로 `observation.rvr`, `observation.wind_shear` 보유. (`metar-parser.js:265-266`)
- TAF: `backend/src/parsers/taf-parser.js` — `base` 상태 + `change_groups`(type=BECMG/TEMPO/PROB30/PROB40/…, start·end·wind·vis·wx·clouds). L397 주석 "원문 재구성용". **경향까지 재구성 가능.**

## 3. 무엇이 되고 무엇이 불확실한가

| 항목 | 지금 파싱? | 복원 | 비고 |
|---|---|---|---|
| METAR 본문(바람·시정·RVR·기상·구름·기온/노점·QNH) | O | ✅ 지금 가능 | display 토큰 조립 |
| TAF 본문 + 경향(FM/BECMG/TEMPO/PROB) | O | ✅ 지금 가능 | base + change_groups |
| METAR 경향(NOSIG/BECMG/TEMPO) | X | ⚠️ 파서 확장 필요 | IWXXM `iwxxm:trendForecast` 지원. 원본 XML에 있으면 복원 가능 |
| 비고(RMK) | X | ⚠️ 파서 확장 필요 | IWXXM `iwxxm:remarks` 지원. 생산자가 비워 보내는 경우 흔함 |

**핵심 정정:** trend/remark는 "IWXXM에 없어서 못하는 것"이 아니라 **우리 파서가 안 읽는 것**. IWXXM 표준은 `iwxxm:trendForecast`(BECMG/TEMPO/NOSIG), `iwxxm:remarks` 둘 다 지원.
근거: WMO IWXXM(github.com/wmo-im/iwxxm), IWXXM Wikipedia, ICAO IWXXM 웨비나 자료.

**남은 불확실성 = KMA가 실제로 그 필드를 채워 보내는가.** 표준 허용 ≠ 실제 채움. **TLS 되는 환경에서 raw IWXXM 한 건 덤프해서 눈으로 확인**해야 확정.

## 4. 구현 플랜

### Phase A — 지금 환경에서도 완전 검증 가능
1. `backend/src/serializers/metar-tac.js` 신규 — 파싱된 METAR 구조 → TAC 문자열.
   - 형식: `METAR<지 SPECI 여부> {ICAO} {ddhhmm}Z {wind} {vis}[ {RVR}] {weather} {clouds|CAVOK|NSC} {T/Td} {Q…}`
   - display 토큰 재사용. CAVOK/NSC 플래그, RVR(`observation.rvr`), wind VRB/gust 처리.
2. `backend/src/serializers/taf-tac.js` 신규 — TAF 구조 → TAC.
   - `TAF{ AMD} {ICAO} {ddhhmm}Z {ddhh/ddhh} {base…}` + 각 change_group을 `FM…`/`BECMG ddhh/ddhh`/`TEMPO ddhh/ddhh`/`PROBnn[ TEMPO] …` 줄로.
3. 국내 파서(또는 프로세서)에서 `header.raw_text`(또는 신규 `header.raw_tac`)에 직렬화 결과 세팅.
   - 파서에 넣으면 `observation` 완성 직후 호출. 프로세서에 넣으면 파서 순수성 유지 — **프로세서 쪽 권장**(`metar-processor.js`에서 parse 후 `parsed.header.raw_text = buildMetarTac(parsed)`), taf도 동일(`taf-processor` 확인 필요).
4. 단위테스트: 픽스처(`backend/data/metar/*.json`은 이미 파싱된 구조라 입력으로 사용 가능) → 직렬화 → 기대 TAC 스냅샷.
5. Playwright: `?airport=RKJB` → METAR/TAF 탭 → 하단 원문 블록 캡처(절차 `docs/dev-server-and-capture.md`).

### Phase B — 원본 IWXXM 필요 (TLS 환경에서)
1. **먼저 raw IWXXM 한 건 덤프**: `metar-processor.js`의 `xml`를 임시로 파일 저장 → `iwxxm:trendForecast`/`iwxxm:remarks` 실제 존재 확인.
2. 있으면 `metar-parser.js`에 방어적 파싱 추가(`obs['iwxxm:trendForecast']`, `metar['iwxxm:remarks']` 등) → `observation.trend`, `header.remarks`.
3. `metar-tac.js`가 trend/remark 있으면 꼬리에 붙임(`… NOSIG` / `… RMK …`). 없으면 생략.
4. 합성 IWXXM 조각 단위테스트 + 실제 KMA 데이터로 님이 최종 검증.

## 5. 미결 결정
- **라벨링**: 국내는 재구성본이라 외국의 진짜 원문과 성격이 다름. 추천 = 국내 "**원문 (TAC · 재구성)**" / 외국 "원문 (TAC)". (대안: 동일 라벨 / 툴팁으로 구분) — 미확정.
- 엣지: RVR 표기, CAVOK vs NSC vs SKC, wind VRB·gust(`G`), wind_shear(`WS`), TAF `PROBnn` 단독 vs `PROBnn TEMPO`, 최저시정 방향.

## 6. 관련 파일 요약
- 프론트 표시부: `MetarTab.jsx`, `TafTab.jsx`(L25 RAW_TAC_STYLE, L158 원문 블록, `formatTafTac`)
- 국내 파서: `backend/src/parsers/metar-parser.js`, `backend/src/parsers/taf-parser.js`
- 외국 파서(참고 모델): `backend/src/parsers/noaa-metar-parser.js:156`, `noaa-taf-parser.js`
- 프로세서(직렬화 삽입 지점): `backend/src/processors/metar-processor.js:18-22`
- 신규: `backend/src/serializers/metar-tac.js`, `taf-tac.js` (+ 테스트)

## 7. ⚠ 핵심 개념 — "IWXXM을 TAC으로 전환" ≠ XML 직접 변환

원본 IWXXM(XML)을 직접 파싱해 TAC으로 바꾸는 게 **아님**. 흐름:
**IWXXM XML → (기존 파서가 이미 구조화 해체: `observation.display`·`change_groups` 등) → 그 구조를 TAC 문자열로 재조립(신규 직렬화기)**.
즉 "이미 분해된 부품을 도로 코드 문장으로 짜맞추기". `metar-tac.js`/`taf-tac.js`는 **파싱 결과 객체**를 입력받음(원본 XML 아님). 프로세서에서 parse 직후 `parsed.header.raw_text = buildMetarTac(parsed)`.
- 단, **경향(trendForecast)·비고(remarks)만 예외** — 현재 파서가 안 읽으므로 재조립 전에 **파서 확장 필요**(원본 XML에서 새로 추출). 이게 Phase B.

## 8. 진행 상태 (2026-07-13)

- **프론트 경향 슬롯 = 완료(프로토타입).** `frontend/public/airport-panel-redesign.html` METAR 하단 전폭 한 줄. `observation.trend` 있으면 표시, 없으면 안내 문구. → 백엔드가 `trend` 채우면 자동. (스펙 §13)
- **Phase A(본문 TAC 재조립) = ✅ 구현 완료(2026-07-13).**
  - 신규: `backend/src/serializers/metar-tac.js`(`buildMetarTac`) · `taf-tac.js`(`buildTafTac`). 입력 = 파싱 결과 객체.
  - 배선: `metar-processor.js`·`taf-processor.js` parse 직후 `header.raw_text` 없으면 채움(외국은 이미 보유).
  - 테스트: `backend/test/metar-tac.test.js`·`taf-tac.test.js` 7 pass(RKSI 실데이터 + SPECI·RVR·음수기온·AMD·PROB30 TEMPO·NSC 엣지).
  - 검증: 캐시된 실데이터 **국내 15공항 METAR+TAF 전수** 재구성 성공, 예외 0. CAVOK/저시정/다중구름/change group 정상.
  - ⚠ **화면 표시는 다음 프로세서 실행(KMA fetch) 시 `raw_text`가 채워진 뒤부터** — 현재 캐시분은 개편 전 처리라 비어 있음. 프론트(`MetarTab`/`TafTab`)는 이미 `raw_text` 렌더 준비됨.
  - 미결(스펙 §5): 국내 라벨 "원문 (TAC · 재구성)" vs 외국 "원문 (TAC)" 구분 — 프론트에서 결정.
- **Phase B(경향·비고) = 보류.** 선행 조건인 **원본 IWXXM 한 건 덤프**가 **KMA API 일일 호출량 소진으로 불가**(2026-07-13). → **호출량 리셋 후** `apiClient.fetch('metar','RKSI')` 덤프 → `iwxxm:trendForecast`/`iwxxm:remarks` 실제 존재 확인 → 파서 확장. (덤프 스크립트: `backend`에서 `apiClient.fetch` import 후 XML 저장.)
