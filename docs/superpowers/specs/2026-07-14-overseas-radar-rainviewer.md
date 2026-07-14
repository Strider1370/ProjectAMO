# 해외 레이더 (RainViewer) — 설계 스펙

- 상태: 설계 확정(v2 — 레이어 분리), 미구현
- 작성일: 2026-07-14 / 개정: 2026-07-14 (v1 → v2)
- 목적: 국내(KMA 합성레이더) 밖 지역에도 강수 레이더를 표시한다.
- 용도: **테스트/개발용**. RainViewer 공개 API는 비상업 조건 — 운영 전환 시 라이선스 재검토 필요(이 스펙 범위 밖).

## 1. 배경

현재 `radar` 레이어는 KMA 합성레이더 `.bin.gz`를 백엔드가 PNG로 렌더해
image overlay(한반도 고정 bounds)로 까는 구조다. bounds 밖은 데이터가 없다.

RainViewer는 **글로벌 래스터 타일**을 준다. image overlay가 아니라 raster tile source로
붙는다. 기존 KMA 파이프라인은 손대지 않는다.

## 2. v1에서 바뀐 점 (개정 사유)

v1은 "토글 하나 유지 + RainViewer를 KMA 아래 깔기"였다. 코드 검증 결과 **셋 다 성립하지 않았다**:

1. **`beforeId`가 안 먹는다.** KMA 오버레이는 `slot: 'middle'`로 추가된다
   (`frontend/src/features/map/imageOverlay.js:31`). Mapbox Standard 스타일에서 slot이 지정된
   레이어는 slot이 순서를 지배하고 `beforeId`는 무시된다.
2. **기준 레이어가 없을 수 있다.** `radarFrame`이 없으면 `kma-radar-overlay` 레이어 자체가
   생성되지 않는다(`imageOverlay.js:38` early return). 그걸 `beforeId`로 참조하면 Mapbox가 throw.
3. **"국내는 KMA가 덮는다"가 거짓.** KMA PNG는 무에코 영역이 **투명**이다. 덮는 게 아니라 뚫려 있다.
   한국도 RainViewer 커버리지 안(실측 회색 4%)이라, KMA가 무에코인 곳에 RainViewer 색이 그대로 비친다.
   → 색상표가 다른 두 레이더가 국내에서 섞인다. v1이 피하려던 바로 그 혼란.

**해결: 레이더를 국내/해외 두 레이어로 분리하고 상호배타로 만든다.**
동시에 켜지지 않으므로 겹침·z-order 문제가 원천 소멸한다(래스터 레이어는 폴리곤 마스킹이
불가능해서, z-order 말고는 겹침을 없앨 native 수단이 없다).

## 3. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 토글 | `radar`(국내) / `radarOverseas`(해외) **두 개** | 색상표·출처·정확도가 다른 별개 제품. 하나로 묶으면 사용자가 국내 기준으로 해외 색을 오독 |
| 상호배타 | 하나 켜면 다른 하나 자동 OFF | 겹침·z-order 문제 소멸. 바람↔기온↔구름↔착빙과 동일한 기존 패턴 |
| 기본값 | `radarOverseas: false` | 기존 화면 유지. RainViewer 외부 호출도 켠 사람에게만 발생 |
| z-order | 다른 오버레이와 동일하게 `slot: 'middle'` | 상호배타라 KMA와 겹칠 일이 없음. 특별 취급 불필요 |
| 색상표 | KMA와 **일부러 다르게** 둔다 | 억지로 맞추면 "같은 색 다른 의미" → 오독 위험. 별 레이어·별 범례로 분리 |
| 메타 호출 | **백엔드 cron** (`weather-maps.json`) | 프론트 직접 호출 시 뷰어 수만큼 외부 호출 |
| 타일 호출 | **브라우저 → RainViewer CDN 직접** | 프록시하면 대역폭만 먹고 CDN 이점 상실. 타일은 키가 없어 숨길 것도 없음 |
| 커버리지 | `radarOverseas` 켜질 때 함께 표시 | "비 없음"과 "레이더 없음"이 똑같이 투명해 보이는 문제 해결. 별도 토글 없음 |
| 프레임 | past만 사용 (nowcast 제외) | 예보 레이더는 별개 기능. YAGNI |

## 4. 커버리지 실측 (2026-07-14)

RainViewer 커버리지 타일(z=6)을 FIR별로 받아 회색(레이더 미수신) 픽셀 비율을 측정.
대조군(태평양 한복판)이 100% 회색으로 나와 측정 방식 검증됨.

| 판정 | FIR |
|---|---|
| **있음** (회색 <10%) | RJJJ 후쿠오카(일본 전역), RCAA 타이베이, VHHK 홍콩, ZSHA 상하이, ZBPE 베이징, ZGZU 광저우, ZYSH 선양, ZPKM 쿤밍, ZKKP 평양, VTBB 방콕, VVHN 하노이, VVHM 호치민, VDPF 프놈펜, VLVT 비엔티안 |
| **부분** | WSJC 싱가포르(14%), WMFC 쿠알라룸푸르(14%), RPHI 마닐라(21%), UHHH 하바롭스크(53%), WBFC 코타키나발루(64%) |
| **없음** (100% 회색) | **ZMUB 울란바토르(몽골)**, **WIIF 자카르타**, **WAAF 마카사르** |

몽골·인도네시아는 **원본 레이더가 존재하지 않는다.** 구현 방식과 무관하게 회색 음영만 뜬다.
"왜 자카르타는 안 나오냐"는 재조사를 막기 위해 여기 박아둔다.

## 5. 백엔드

### 5.1 새 프로세서 `backend/src/processors/rainviewer-processor.js`

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
       frames: [{ timeMs, path }, ...]   // 오름차순, RainViewer past 그대로
     }
```

실측 확인(2026-07-14): past **13프레임 / 10분 간격 / 총 2시간**. API 키 불필요.

- 실패 시 기존 파일 유지, throw → `runWithLock`이 stats에 실패 기록.
- 파일만 쓰고 store에는 안 넣는다(레이더 메타와 동일한 취급).

### 5.2 배선

- `config.js`: `export const rainviewer = { url, timeout_ms: 10000 }`, `schedule.rainviewer_interval = '*/10 * * * *'`
  — **10분**. RainViewer 원본 갱신 주기가 10분(실측 프레임 간격)이라 5분 cron은 같은 데이터를
  두 번 받는 낭비다. 외부 호출 288회/일 → 144회/일.
- `index.js`: `locks.rainviewer`, `buildInitialCollectionJobs()`에 `["rainviewer", rainviewerProcessor.process]`, `cron.schedule(...)` 한 줄
- `server.js`: 정적 화이트리스트에 `radar/rainviewer_meta.json` 추가 (기존 `echo_meta.json`과 같은 자리, `server.js:112`). 별도 `/api` 라우트는 안 만든다 — 프론트가 `/data/...`로 읽으면 충분.

CSP는 백엔드·nginx 어디에도 없음(`server.js:70` `contentSecurityPolicy: false`) → 브라우저의
RainViewer CDN 직접 호출에 차단 요소 없음. 확인 완료.

## 5.3 외부 호출량 / IP 차단 리스크

RainViewer는 rate limit·IP 차단 정책을 **문서로 공개하지 않는다**(2026-07-14 공식 API 문서 확인).
따라서 "몇 회까지 안전"의 근거는 없고, 구조로 리스크를 낮춘다.

| 경로 | 나가는 IP | 양 |
|---|---|---|
| `weather-maps.json` (메타) | **서버 IP 1개** | 10분마다 1회 = 144회/일. 작은 JSON |
| 레이더/커버리지 타일 | **각 사용자 브라우저 IP** | 많음(팬·줌마다) — 서버를 경유하지 않음 |

- 무거운 타일 트래픽이 사용자 IP로 분산되므로 **서버 IP가 차단당할 표면이 거의 없다.**
- **타일 프록시를 만들면 안 되는 진짜 이유가 이것이다**(§8): 프록시는 전 사용자 타일 요청을
  서버 IP 하나로 합쳐 보내게 되어, 차단 위험을 스스로 만든다.
- 차단·장애 시 동작: 프로세서가 throw → 기존 `rainviewer_meta.json` 유지 → 프론트는 `optional`
  이므로 메타가 낡거나 없으면 레이어가 조용히 숨겨진다. 국내 레이더는 영향 없음.

### 라이선스 (차단보다 먼저 걸리는 제약)

공식 문서 원문: **"personal or educational use only"** — 상업적 사용 불가.
출처 표기 필수(rainviewer.com 링크 포함) → `aviationWfsLayers.js`의 VAT-Spy attribution과
동일한 방식으로 Mapbox attribution에 노출한다(레이어 켜졌을 때).

**운영 서비스 전환 시 이 스펙 그대로는 쓸 수 없다. RainViewer에 상업 라이선스 문의 필요.**

## 6. 프론트엔드

### 6.1 레이어 토글 (핵심 변경)

- `MET_LAYERS`에 `radarOverseas` 추가. `WeatherOverlayPanel.jsx:41` `weather` 그룹 ids에
  `radar` 바로 뒤에 넣고, `layerLabels`에 `'해외 레이더'`, `WEATHER_TILE_ICON`에 아이콘 지정.
- `MapView.jsx:138` `initMetVisibility()` — `radarOverseas`는 기본 false(기존 reduce가 이미 false로 채움. 별도 줄 불필요).
- **상호배타**: `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`에 분기 추가.
  기존 wind/temp/cloud/icing 패턴 그대로:

```js
if (id === 'radar')          return { ...prev, radar: !prev.radar, radarOverseas: false }
if (id === 'radarOverseas')  return { ...prev, radarOverseas: !prev.radarOverseas, radar: false }
```

  테스트는 `metLayerVisibility.test.js`에 케이스 1개 추가(기존 상호배타 테스트와 동일 형태).

### 6.2 새 파일 `frontend/src/features/weather-overlays/lib/rainviewerLayers.js`

```
export const RAINVIEWER_SOURCE / RAINVIEWER_LAYER / RAINVIEWER_COVERAGE_SOURCE / RAINVIEWER_COVERAGE_LAYER

addRainviewerLayers(map, meta)
  - coverage: raster source(tiles: coverageTemplate), opacity 0.2, maxzoom 7, slot 'middle'
  - radar:    raster source(tiles: 최초 프레임 URL), opacity 0.7, maxzoom 7, slot 'middle'
  - coverage를 먼저 add(같은 slot 내 삽입순 = 아래)
  - beforeId 쓰지 않는다 (§2 참조)

syncRainviewerLayers(map, { meta, frame, visible })
  - frame 바뀌면 map.getSource(RAINVIEWER_SOURCE).setTiles([url])  ← 레이어 재생성 금지
    (mapbox-gl 3.23 RasterTileSource.setTiles 지원 확인 완료)
  - visible → setMapLayerVisible 로 두 레이어 동시 on/off
```

`WEATHER_OVERLAY_SOURCE_IDS` / `WEATHER_OVERLAY_LAYER_IDS`에 4개 id 추가
(스타일 재생성 시 정리 대상에 포함되어야 함).

### 6.3 데이터/모델

- `weatherApi.js`: 초기 로드 + 폴링 diff에 `/data/radar/rainviewer_meta.json` 추가 (`optional: true`)
- `weatherOverlayModel.js`: `rainviewerFrames` 정규화 + 기존 `pickNearestPreviousFrame(rainviewerFrames, resolvedWeatherTimeMs)` 로 `rainviewerFrame` 산출
  - **타임라인 눈금은 KMA 기준 그대로 둔다.** RainViewer 프레임은 스냅만 한다.
  - KMA는 36×5분=3시간, RainViewer는 2시간 → **타임라인 앞쪽 1시간 구간엔 매칭 프레임이 없다.**
  - 이때 `rainviewerFrame === null` → 레이어 숨김.
    **단 그냥 숨기면 사용자에겐 고장으로 보인다.** `WeatherLayerTimestampBar`에
    "해외 레이더 없음 (최근 2시간만 제공)" 문구를 띄운다.

### 6.4 MapView

`useRainviewerOverlay(mapRef, isStyleReady, styleRevision)` 훅 **호출 한 줄만** 추가.
MapView에 새 state/useEffect 금지 (ADR-0001, Architecture.md §196).

### 6.5 범례 + "프레임 없음" 안내 (한 곳에서 처리)

`WeatherLegends.jsx`는 이미 레이어별 조건부 블록 구조다(`radarLegendVisible`,
`lightningLegendVisible`, ... — `WeatherLegends.jsx:26-49`). 여기에 `radarOverseasLegendVisible`
블록을 하나 더 추가한다.

- 색 스케일: **dBZ(반사도) 눈금**. RainViewer가 색상표 2(Universal Blue)의 dBZ↔색상 표를 공식 공개한다
  (https://www.rainviewer.com/api/color-schemes.html). 이 표에서 뽑은 대표 구간을 그대로 쓰고,
  실제 타일 픽셀을 샘플링해 대조 검증했다(#00a3e0=20dBZ, #88ddee=15dBZ, #d6c88f=12dBZ 일치).
  → `RAINVIEWER_LEGEND` (rainviewerLayers.js)
- **mm/h로는 환산하지 않는다.** 국내 KMA 범례는 강수량(mm/h), 해외는 반사도(dBZ)로 **척도 자체가 다르다.**
  Z-R 관계식으로 억지 환산하면 가정이 섞여 오독을 부른다. 척도가 다름을 범례에 명시한다.
- "회색 음영 = 레이더 미수신 지역(몽골·인도네시아 등)"
- 출처: RainViewer (링크 포함, 라이선스 요구사항)

**`rainviewerFrame === null`일 때 "해외 레이더 없음 (최근 2시간만 제공)"도 이 블록에서 띄운다.**
`WeatherLayerTimestampBar`에는 넣지 않는다 — 그 컴포넌트는 **예보 레이어 전용**이고
(`WeatherLayerTimestampBar.jsx:6`), 해외 레이더는 관측 레이어다. 계약이 안 맞는다.
범례 블록은 이미 "레이어가 켜져 있을 때만" 렌더되므로 별도 조건이 필요 없다.
표시 조건은 `radarOverseasVisible && rainviewerFrame === null` 하나뿐.

### 6.6 함께 손봐야 하는 연결점 (리뷰 반영)

새 met 레이어 id 하나를 추가하면 아래도 같이 건드려야 한다. 빠뜨리면 테스트가 깨지거나 조용히 오작동한다.

| 파일 | 할 일 | 안 하면 |
|---|---|---|
| `map/layerActions.js` `MET_META` | `radarOverseas: { label: '해외 레이더', aliases: ['해외', 'overseas', 'rainviewer'] }` | **`layerActions.test.js`가 깨진다** — MET_LAYERS 전 항목 등록을 강제함 |
| `WeatherOverlayPanel.jsx` `WEATHER_TILE_ICON` | `radarOverseas: Globe` (lucide) — 국내 `Radar`와 시각적으로 구분 | 타일 렌더 시 아이콘 undefined → **크래시** |
| `map/lib/baseMapLayers.js` `shouldShowGeoBoundaries()` | 조건에 `metVisibility.radarOverseas` 추가 | 해외 레이더만 켰을 때 **국경선이 안 그려짐**(래스터 위 대비 상실) |
| `baseMapLayers.test.js` | radarOverseas 케이스 1줄 | 위 회귀를 못 잡음 |
| `metLayerVisibility.test.js` | radar ↔ radarOverseas 상호배타 케이스 | 상호배타 회귀를 못 잡음 |

온보딩 투어(`features/onboarding/tourSteps.js`)에는 **넣지 않는다** — 기본 꺼짐 레이어이고
투어는 첫 사용자용 핵심 동선만 다룬다. 의도적 제외.

## 7. 검증

1. `node --test backend/test/...` — 프로세서 파싱 단위 테스트 1개 (past 프레임 → frames 배열, 시간 오름차순)
2. `metLayerVisibility.test.js` — radar ↔ radarOverseas 상호배타 케이스
3. `baseMapLayers.test.js` — radarOverseas만 켜도 `shouldShowGeoBoundaries` true
4. `weatherOverlayLayers.test.js` / `layerActions.test.js` — id 커버리지 테스트가 새 id들을 강제
5. Playwright: `radarOverseas` ON → **`radar`가 자동으로 꺼지는지** 확인 → 도쿄/홍콩으로 이동 →
   RainViewer 타일 요청이 network에 뜨는지 + 커버리지 음영이 보이는지 스크린샷
   (`docs/dev-server-and-capture.md` 절차 준수)
6. 타임라인을 2시간보다 과거로 당겼을 때 "해외 레이더 없음" 문구가 뜨는지

## 8. 명시적으로 안 하는 것

- 타일 프록시/캐시 — 필요해지면 그때. (국내 영역 픽셀을 지워 겹침을 없애는 용도로도 검토했으나,
  상호배타로 겹침 자체가 사라져 불필요)
- nowcast(예보) 프레임
- RainViewer 색상표 ↔ KMA 강수강도 정합 — **의도적으로 안 맞춘다**(§3)
- 해외 전용 타임라인 눈금(10분 간격)
