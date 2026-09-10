# AIP 터미널 절차 파일럿 상태

Updated: 2026-07-17 KST

- 범위: RKTH RNAV SID 10개, STAR 6개, STAR 연결 일반 RNP IAP 2개
- 결정: 차트 제목이 아니라 다음 표의 전이 경로 레코드가 파싱 단위다.
- 저장 위치: 기존 `frontend/public/data/navdata/procedures/` 공항별 JSON 3개를 재사용한다.
- 진행: RKTH·RKTU·RKNW·RKPS·RKJJ·RKJK JSON과 로더·한국어 공항명 통합 완료. RKPS SID 11·STAR 12와 STAR→대표 IAP 연결을 추가했다. RKTN은 Coding Table이 없어 사용자 결정으로 제외한다.
- 주의: SID·STAR·IAP PDF 발행일이 다르므로 레코드별 원문 locator를 보존한다.
- 예외: RNP Y RWY 28 final 좌표가 없어서, 실제 이름을 보존한 RNP Z RWY 28 (AR) 대표 geometry를 사용한다. 표가 생략한 runway 연결은 공표 threshold 좌표와 명확한 차트 선으로만 보완한다.

## 다음 세션 재개 규칙

- 다음 대상: RKTH를 제외한 미구현 국내 공항(RKTU, RKNW, RKTN, RKPS, RKJJ, RKJK)을 같은 방식으로 추가한다.
- 절차 단위는 차트 제목이 아니라 바로 다음 `Aeronautical Data Tabulation`/`Coding Tables`의 `procedure + runway + transition` 레코드다.
- SID는 이륙 활주로의 **반대쪽 끝 threshold**에서 시작한다. STAR는 entry transition부터 terminal IAF까지, IAP는 terminal IAF부터 착륙 활주로 threshold까지 잇는다.
- 표에 활주로 연결이나 final segment가 없으면 차트에 명확히 그려진 선과 공표 threshold 좌표로만 보완하고, 출처를 `chart-derived runway connection`으로 남긴다. 다른 절차(RNP AR 등)를 geometry 대체로 쓸 때는 실제 절차명과 `fallbackReason`을 보존한다.
- 표·차트 해석 또는 다른 절차의 geometry 재사용처럼 판단이 필요한 경우에는 임의로 채우지 말고 사용자에게 먼저 묻는다.
- UI 표기는 `한국어 공항명 ICAO` 및 기존 공항의 짧은 procedure identifier 형식(예: `DORTI1-ELAPI`)을 따른다.
- 구현은 컨텍스트 연속성을 위해 **implementor 역할 서브에이전트**에게 공항별 JSON 전사를 맡기되, 메인 에이전트가 원문 대조·통합·테스트·브라우저 검증을 책임진다.

## Resume Point

- Last completed: all requested terminal-procedure data and loader/UI integration; JSON continuity, frontend test, build, and circular-dependency checks passed.
- Browser verification: Playwright searched RKJJ→RKPS IFR with `MARYO1-TEDAN` / `SOLYI1-ANUBA`; the panel remained visible, returned 82 NM, and logged no application error. Frontend test (369), build, and Madge circular-dependency checks passed.
- Fix: representative IAP JSON provides fixes but not a precomputed GeoJSON line. `routePreview` now derives that line from valid IAP fixes, so selecting an RKPS arrival no longer sends an undefined geometry to MapView. Regression tests cover both the renderer and map-layer sync.
- Next: user manual browser check if desired. `graphify update .` remains pending explicit graphify skill consent.
- Fix: MapView teardown could call `.style` after Mapbox had removed its canvas; `useMeasureOverlay` now exits its cleanup safely when no canvas remains.
- Resolved: RKPS uses representative 06L/24R; for SID tables labelled 06L/R use 06L with opposite RWY24R, and tables labelled 24L/R use 24R with opposite RWY06L. RKJJ uses direct 04L/22L representative IAP geometry. RKTN excluded.
