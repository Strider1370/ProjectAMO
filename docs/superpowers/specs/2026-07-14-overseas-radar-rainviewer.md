# 해외 레이더 (RainViewer) — 설계 스펙

- 상태: 설계 확정, 미구현
- 작성일: 2026-07-14
- 목적: 국내(KMA 합성레이더) 밖 지역에도 강수 레이더를 표시한다.
- 용도: **테스트/개발용**. RainViewer 공개 API는 비상업 조건 — 운영 전환 시 라이선스 재검토 필요(이 스펙 범위 밖).

## 1. 배경

현재 `radar` 레이어는 KMA 합성레이더 `.bin.gz`를 백엔드가 PNG로 렌더해
image overlay(한반도 고정 bounds)로 까는 구조다. bounds 밖은 데이터가 없다.

RainViewer는 **글로벌 래스터 타일**을 준다. image overlay가 아니라 raster tile source로
붙는다. 기존 KMA 파이프라인은 손대지 않는다.

## 2. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 토글 | 기존 `radar` 하나 유지 | 국내/해외 두 개를 켜게 하면 경계에서 혼란 |
| z-order | RainViewer 타일을 `kma-radar-overlay` **아래** | 국내는 KMA가 덮고, 해외는 RainViewer가 보임. 블렌딩 로직 불필요 |
| 메타 호출 | **백엔드 cron** (`weather-maps.json`) | 프론트 직접 호출 시 뷰어 수만큼 외부 호출 |
| 타일 호출 | **브라우저 → RainViewer CDN 직접** | 프록시하면 대역폭만 먹고 CDN 이점 상실. 타일은 키가 없어 숨길 것도 없음 |
| 커버리지 | radar 켜질 때 항상 함께 표시 | "비 없음"과 "레이더 없음"이 똑같이 투명해 보이는 문제 해결. 별도 토글 없음 |
| 프레임 | past만 사용 (nowcast 제외) | 예보 레이더는 별개 기능. YAGNI |

## 3. 백엔드

### 3.1 새 프로세서 `backend/src/processors/rainviewer-processor.js`

```
process():
  fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json')
  → { host, radar: { past: [{ time, path }, ...] } }
  → {storage}/radar/rainviewer_meta.json 로 저장:
     {
       type: "RAINVIEWER",
       updated_at: <ISO>,
       host: "https://tilecache.rainviewer.com",
       tileTemplate: "{host}{path}/512/{z}/{x}/{y}/2/1_1.png",   // 색상 2(Universal Blue), smooth=1, snow=1
       coverageTemplate: "{host}/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png",
       frames: [{ timeMs, path }, ...]   // 오름차순, RainViewer past 그대로 (약 10분 간격 × 2시간)
     }
```

- 실패 시 기존 파일 유지, throw → `runWithLock`이 stats에 실패 기록.
- 파일만 쓰고 store에는 안 넣는다(레이더 메타와 동일한 취급).

### 3.2 배선

- `config.js`: `export const rainviewer = { url, timeout_ms: 10000 }`, `schedule.rainviewer_interval = '*/5 * * * *'`
- `index.js`: `locks.rainviewer`, `buildInitialCollectionJobs()`에 `["rainviewer", rainviewerProcessor.process]`, `cron.schedule(...)` 한 줄
- `server.js`: 정적 화이트리스트에 `radar/rainviewer_meta.json` 추가 (기존 `echo_meta.json`과 같은 자리). 별도 `/api` 라우트는 안 만든다 — 프론트가 `/data/...`로 읽으면 충분.

## 4. 프론트엔드

### 4.1 새 파일 `frontend/src/features/weather-overlays/lib/rainviewerLayers.js`

```
export const RAINVIEWER_SOURCE / RAINVIEWER_LAYER / RAINVIEWER_COVERAGE_SOURCE / RAINVIEWER_COVERAGE_LAYER

addRainviewerLayers(map, meta)
  - coverage: raster source(tiles: coverageTemplate), opacity 0.2, maxzoom 7
  - radar:    raster source(tiles: 최초 프레임 URL), opacity 0.7, maxzoom 7
  - 둘 다 beforeId = 'kma-radar-overlay'  (coverage가 더 아래)

syncRainviewerLayers(map, { meta, frame, visible })
  - frame 바뀌면 map.getSource(RAINVIEWER_SOURCE).setTiles([url])  ← 레이어 재생성 금지
  - visible → setMapLayerVisible 로 두 레이어 동시 on/off
```

`WEATHER_OVERLAY_SOURCE_IDS` / `WEATHER_OVERLAY_LAYER_IDS`에 4개 id 추가
(스타일 재생성 시 정리 대상에 포함되어야 함).

### 4.2 데이터/모델

- `weatherApi.js`: 초기 로드 + 폴링 diff에 `/data/radar/rainviewer_meta.json` 추가 (`optional: true`)
- `weatherOverlayModel.js`: `rainviewerFrames` 정규화 + 기존 `pickNearestPreviousFrame(rainviewerFrames, resolvedWeatherTimeMs)` 로 `rainviewerFrame` 산출
  - **타임라인 눈금은 KMA 기준 그대로 둔다.** RainViewer 프레임은 스냅만 한다.
  - KMA는 36×5분=3시간, RainViewer는 약 2시간 → 타임라인 앞쪽 1시간 구간엔 매칭 프레임이 없다.
    이때 `rainviewerFrame === null` → 레이어 숨김. (커버리지도 같이 숨김)

### 4.3 MapView

`useRainviewerOverlay(mapRef, isStyleReady, styleRevision)` 훅 **호출 한 줄만** 추가.
MapView에 새 state/useEffect 금지 (ADR-0001, Architecture.md §196).

### 4.4 범례

`WeatherLegends.jsx` radar 범례 하단에 한 줄:
"회색 음영 = 레이더 미수신 지역(해외)". RainViewer 색상표는 KMA 강수강도 범례와 다르므로,
해외 색상은 **정량 해석 불가**임을 명시한다.

## 5. 검증

1. `node --test backend/test/...` — 프로세서 파싱 단위 테스트 1개 (past 프레임 → frames 배열, 시간 오름차순)
2. `weatherOverlayLayers.test.js` / `layerActions.test.js` — id 커버리지 테스트가 새 4개 id를 강제
3. Playwright: radar 토글 ON → 도쿄/홍콩으로 이동 → RainViewer 타일 요청이 network에 뜨는지 + 커버리지 음영이 보이는지 스크린샷
   (`docs/dev-server-and-capture.md` 절차 준수)
4. 국내 줌: KMA 오버레이가 RainViewer 위에 그려지는지 육안 확인

## 6. 명시적으로 안 하는 것

- 타일 프록시/캐시 — 필요해지면 그때
- nowcast(예보) 프레임
- RainViewer 색상표 ↔ KMA 강수강도 정합
- 해외 전용 타임라인 눈금(10분 간격)
