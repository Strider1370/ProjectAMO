# 관측지점 표식 확장과 지점 말풍선 — 구현 계획

**Goal:** 이미 받고 있는 ASOS 응답에서 전운량과 시정을 더 꺼내, 초록 점(좋음)과
결측(안 그림)을 가르고, 점을 누르면 그 관측소 실측값을 보여준다.

**스펙:** `docs/superpowers/specs/2026-08-02-station-markers-and-popup.md`

## Global Constraints

- **새 API를 붙이지 않는다.** `kma_sfctm2.php` 응답에서 항목만 더 꺼낸다.
- **구현 전에 실제 응답 머리글로 항목 위치를 확인한다.** 표준 배열 기준 전운량 26번째,
  시정 33번째로 알려져 있으나 확인 없이 쓰지 않는다.
- **결측을 그리지 않는다.** 그려서 초록이 되면 고장난 관측소가 "OK"로 읽힌다.
  전운량 0 = 구름 없음(초록), 전운량도 결측 = 안 그림.
- 테스트는 `node --test`. **vitest는 이 저장소에 없다.**
- Playwright는 `frontend/verification/contracts/*.spec.mjs`.
- **`git add -A` / `git add .` 금지.** 병렬 세션이 `frontend/src/features/terminal/*`
  와 미추적 문서를 잡고 있다. 커밋 전 `git branch --show-current` 확인.
- 이미 있는 함수를 쓴다. `band()`, `stationMarkerStyle()`, `escapeHtml()`,
  `assertLayerRendering()`은 이미 있고 한 곳에만 있다. **새로 짜지 않는다.**
- 보간하지 않는다. 결측은 결측으로 둔다.

## Task 1 — ASOS 파서: 전운량·시정 꺼내기

**Files:** `backend/src/processors/asos-ceiling-processor.js` + `.test.js`

1. 실제 응답 한 줄을 받아 `#` 머리글에서 전운량·시정 위치를 확인하고 주석에 남긴다.
2. `parseAsosCeiling`이 `{ stn, ceiling_ft, cloud_amount, visibility_m, sky_clear }`를
   반환한다. `sky_clear` = `CH_MIN === -9 && CA_TOT === 0`.
3. `CH_MIN === -9 && CA_TOT === -9`(둘 다 결측)면 지금처럼 제외.
4. `CH_MIN >= 25000 ft` 환산값이면 AMOS와 같이 NSC로 보고 `sky_clear` 취급.
5. 시정 원값 단위를 머리글로 확인해 미터로 맞춘다.

## Task 2 — 지점 목록에 실어 보내기

**Files:** `backend/src/processors/flight-category/stations.js`, 산출물·point 창구

`stations[]` 각 항목에 `sky_clear`, `visibility_m`, `obs_tm`을 싣는다. AMOS 경로는
이미 NSC를 거르므로 그 자리를 `sky_clear: true`로 바꿔 목록에 남긴다.

## Task 3 — 초록 점

**Files:** `frontend/src/features/weather-overlays/lib/flightCategoryStations.js` + 테스트

`stationMarkerStyle`이 `fill: 'good'`을 낸다 — 운고 900 m 초과 또는 `sky_clear`.
`toStationFeatures`는 결측만 뺀다. `sky_clear` 지점에는 테두리를 붙이지 않는다.
`flightCategoryLayers.js`의 `STATION_FILL`에 초록을 더한다.

## Task 4 — 점 말풍선

**Files:** `frontend/src/features/weather-overlays/lib/flightCategoryPopup.js` + 테스트,
`flightCategoryLayers.js`

`formatStationLines(station)` 신설. 이름·출처, 운고(또는 `구름 없음`), 실측 시정,
관측 시각. 흰 테두리가 붙은 지점은 모델값과 차이를 함께 적는다.
`FC_STATION_LAYER`에 클릭을 건다 — 면 말풍선과 같은 취소 방식을 쓴다.

## Task 5 — 범례와 검증

초록 견본을 범례에 넣는다. 브라우저 계약에 초록 점과 점 말풍선을 더한다.
**시험이 실제로 실패하는지 망가뜨려 확인한다.**
