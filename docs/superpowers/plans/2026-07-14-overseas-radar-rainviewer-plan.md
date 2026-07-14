# 해외 레이더(RainViewer) — 구현 계획

- 스펙: `docs/superpowers/specs/2026-07-14-overseas-radar-rainviewer.md` (v2, 리뷰 반영)
- 작성일: 2026-07-14
- 상태: 미착수
- 원칙: **새 파이프라인을 만들지 않는다.** 기존 데이터 소스(radar_echo·satellite)가 쓰는 공통 설비
  (config → cron+lock → stats → 파일 저장 → 스냅샷 메타 → 캐시정책 → weatherApi 폴링 diff)에 그대로 얹는다.

## 0. 기준 사례

새 소스는 **`radar_echo`와 동일 계열**이다: store에 넣지 않고 파일(meta json)만 쓰며,
프론트가 `/data/...`로 직접 읽고, 스냅샷 메타의 `tm` 변화로 갱신을 감지한다.

RainViewer만의 차이: **원자료가 없다.** 백엔드는 800B짜리 목차 JSON만 받고,
실제 타일 이미지는 브라우저가 RainViewer CDN에서 직접 받는다(서버 저장·프록시 없음).

---

## ⚠ 착수 전 반드시 알아야 할 함정 2개 (코드 확인 완료)

### 함정 A — `tm` 필드가 없으면 폴링 갱신이 죽는다

`backend/server.js:326-330`

```js
function buildFrameEntry(filePath) {
  const payload = readJsonFileSafe(filePath)
  if (!payload?.tm) return null      // ← tm 없으면 스냅샷 엔트리 자체가 null
  return { tm: payload.tm }
}
```

스냅샷 메타는 **`tm` 값의 변화**로 "이 소스가 갱신됐다"를 프론트에 알린다.
스펙 §5.1의 메타 스키마에는 `tm`이 없다 → 그대로 만들면 스냅샷 엔트리가 항상 `null` →
프론트 폴링 diff가 변화를 영영 감지 못 함 → **초기 로드 1회 후 레이더가 멈춘다.**

**→ 메타에 `tm`을 반드시 넣는다.** 값은 "가장 최신 프레임 시각"(= 갱신 때마다 바뀌는 스칼라).

### 함정 B — `stats.js` TYPES에 없으면 실패가 안 보인다

`backend/src/stats.js:4` TYPES 배열 / `stats.js:88-90`

```js
export function recordSuccess(type, result, durationMs) {
  const entry = statsData.types[type]
  if (!entry) return                 // ← 미등록 타입은 조용히 버려짐
```

RainViewer는 **외부 서드파티 API**다. 장애·차단·스키마 변경이 우리 통제 밖이다.
TYPES에 등록하지 않으면 수집이 계속 실패해도 관찰 화면에 아무것도 안 뜬다.

**→ `TYPES`에 `'rainviewer'` 추가.**

> 참고(범위 밖): 현재 TYPES에는 `'radar'`가 있는데 실제 수집 type은 `'radar_echo'`다.
> 즉 **국내 레이더 수집 통계도 지금 버려지고 있다.** 이 계획에서는 건드리지 않는다.

---

## Phase 1 — 메타 스키마 + 수집기

**1.1** `backend/src/config.js`
- `export const rainviewer = { url, timeout_ms: 10000 }` — `satellite`(L151) 바로 앞/뒤
- `schedule.rainviewer_interval = '*/10 * * * *'` — L262 `radar_echo_interval` 아래
  (원본 갱신이 10분 주기. 5분은 같은 데이터를 두 번 받는 낭비)
- default export 객체에 `rainviewer` 추가

**1.2** `backend/src/processors/rainviewer-processor.js` (신규)
- `fetchWithTimeout(config.rainviewer.url, timeout)` → `weather-maps.json`
- 순수 함수 `buildRainviewerMeta(payload)`로 분리(테스트 대상):

```
{
  type: "RAINVIEWER",
  tm: "<최신 프레임 timeMs>",        // ★ 함정 A — 스냅샷 diff 키
  updated_at: <ISO>,
  host: "https://tilecache.rainviewer.com",
  tileTemplate:     "{host}{path}/512/{z}/{x}/{y}/2/1_1.png",
  coverageTemplate: "{host}/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png",
  frames: [{ timeMs, path }, ...]   // 오름차순
}
```

- `{storage.base_path}/radar/rainviewer_meta.json`에 저장 (radar_echo와 같은 디렉터리)
- 실패 시 **throw** → `runWithLock`이 stats에 기록하고 **기존 파일은 그대로 남는다**(프론트 무중단)
- store에는 **넣지 않는다** (radar_echo·satellite와 동일 — 파일 전용 소스)

**1.3** `backend/src/stats.js:4` — TYPES에 `'rainviewer'` 추가 (★ 함정 B)

**1.4** `backend/src/index.js`
- processor import
- `locks`(L27)에 `rainviewer: false`
- `buildInitialCollectionJobs()`(L98 `radar_echo` 옆)에 `["rainviewer", rainviewerProcessor.process]`
- `cron.schedule(config.schedule.rainviewer_interval, () => runWithLock("rainviewer", rainviewerProcessor.process))` (L142 옆)

**검증 1** — `backend/test/rainviewer-processor.test.js` 신규:
- 프레임이 ms 단위 + 시간 오름차순으로 정규화되는가
- `tm`이 최신 프레임에서 나오는가 (**함정 A 회귀 방지**)
- 깨진 payload에서 throw 하는가(기존 파일 보존 계약)
- `node --test backend/test/rainviewer-processor.test.js`

---

## Phase 2 — 서버 노출 (스냅샷 메타 · 캐시)

**2.1** `backend/server.js` — `SNAPSHOT_SOURCES`(L373-401), `echoMeta`(L394) 바로 아래:

```js
{ keys: ['rainviewerMeta', 'rainviewer'],
  files: [snapshotMetaFile('radar', 'rainviewer_meta.json')],
  build: () => buildFrameEntry(snapshotMetaFile('radar', 'rainviewer_meta.json')) },
```

**2.2 캐시 정책 — 두 계층이 다르다. 헷갈리지 말 것.**

| 계층 | 조치 | 이유 |
|---|---|---|
| `backend/server.js` (개발/폴백) | **변경 없음** | `/data`는 화이트리스트가 아니라 `express.static` 전체 서빙. `setGeneratedDataCacheHeaders` **기본값이 이미 `no-cache`**(L120)라 새 파일도 자동으로 no-cache. (스펙 §5.2의 "정적 화이트리스트에 추가"는 **틀린 서술** — 그런 화이트리스트는 없다) |
| `deploy/nginx/…conf.example` L40 (운영) | **변경 필수** | 운영에선 nginx가 `/data/`를 직접 서빙. no-cache 정규식 목록에 없으면 `location /data/`(L30)로 떨어져 **Cache-Control 헤더 없이** 나간다 → 브라우저가 낡은 목차를 캐싱해 레이더가 멈춘 것처럼 보임 |

nginx 정규식(L40)에 `radar/rainviewer_meta\.json` 추가.

**2.4** `/api/radar/rainviewer-meta` 라우트 — **만들지 않는다.**
프론트는 `/data/...`를 직접 읽는다. 지금 쓰지 않는 라우트를 미리 만들지 않는다(YAGNI).

**검증 2** (Phase 1 완료 + 수집기가 최소 1회 돈 뒤에만 의미 있음 — 파일이 있어야 스냅샷 엔트리가 생긴다)
- 백엔드 기동 → `curl /api/snapshot-meta`에 `rainviewerMeta.tm`이 **null이 아닌 값**으로 나오는가
  (null이면 함정 A를 밟은 것 — 메타에 `tm`이 없다는 뜻)
- 수집기 1회 더 실행(새 프레임 도착 후) → `tm`이 바뀌는가 (= 프론트가 갱신을 감지할 수 있는가)

---

## Phase 3 — 프론트 데이터 배선

**3.1** `frontend/src/api/weatherApi.js`
- 초기 로드(L156 `echo_meta.json` 옆): `fetchJson('/data/radar/rainviewer_meta.json', { optional: true })` → 반환 객체에 `rainviewerMeta`
- 폴링 diff(L322 `if (changes.echoMeta)` 옆): `if (changes.rainviewerMeta) { ... keys.push('rainviewerMeta') }`

**3.2** `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- `rainviewerFrames` 정규화
- 기존 `pickNearestPreviousFrame(rainviewerFrames, resolvedWeatherTimeMs)`로 `rainviewerFrame` 산출
- **타임라인 눈금은 KMA 기준 유지.** RainViewer는 스냅만.
- KMA 3시간 vs RainViewer 2시간 → 앞쪽 1시간은 `rainviewerFrame === null`

**검증 3** — `weatherOverlayModel.test.js`에 케이스 추가:
2시간보다 과거를 선택하면 `rainviewerFrame === null`

---

## Phase 4 — 지도 레이어

**4.1** `frontend/src/features/weather-overlays/lib/rainviewerLayers.js` (신규)
- 상수 4개를 export: `RAINVIEWER_SOURCE`, `RAINVIEWER_LAYER`,
  `RAINVIEWER_COVERAGE_SOURCE`, `RAINVIEWER_COVERAGE_LAYER`
- `addRainviewerLayers(map, meta)` — coverage(먼저) + radar, 둘 다 `slot: 'middle'`, `maxzoom: 7`
  - **`beforeId` 쓰지 않는다** — KMA 오버레이가 slot 방식이라 무시되고, 프레임이 없으면 기준 레이어 자체가 없어 throw (스펙 §2)
- `syncRainviewerLayers(map, { meta, frame, visible })` — 프레임 교체는 `source.setTiles([url])` (레이어 재생성 금지)
- 위 4개 id를 `weatherOverlayLayers.js`의 `WEATHER_OVERLAY_SOURCE_IDS`(L48 부근) /
  `WEATHER_OVERLAY_LAYER_IDS`(L67 부근)에 등록
  → **안 하면 basemap 전환 등 스타일 재생성 시 유령 레이어가 남는다.** id 커버리지 테스트가 이를 강제한다.

**4.2** `useRainviewerOverlay(mapRef, isStyleReady, styleRevision)` 훅 (신규)
- `MapView.jsx`에는 **호출 한 줄만**. 새 state/useEffect 금지 (ADR-0001, Architecture.md §196)

**검증 4** — `weatherOverlayLayers.test.js` id 커버리지 테스트 통과

---

## Phase 5 — 토글 · 패널 · 범례

**5.1 상호배타** `weather-overlays/lib/metLayerVisibility.js` — 기존 wind/temp/cloud/icing 패턴 그대로,
catch-all(L47) **앞에** 분기 2개 추가:

```js
if (id === 'radar')         return { ...prev, radar: !prev.radar, radarOverseas: false }
if (id === 'radarOverseas') return { ...prev, radarOverseas: !prev.radarOverseas, radar: false }
```

**이 2줄로 모든 경로가 커버된다 — 우회로 없음(확인 완료).** `metVisibility`를 쓰는 곳은 셋뿐이고:

| 호출자 | 경로 | 상호배타 적용 |
|---|---|---|
| `toggleMet()` (MapView.jsx:748) — 패널 토글 | `getNextMetVisibility` | ✅ |
| `setLayerOn()` (MapView.jsx:317) — 레이어 검색·브리핑·딥링크 | `getNextMetVisibility` | ✅ |
| `clearMetLayers()` (MapView.jsx:771) — 전체 끄기 | 전부 false | 무관 |

- **lowPower 모드는 `radarOverseas`에 영향 없음.** lowPower는 계산 비용이 큰 NWP 오버레이(windFlow)만 끈다.
  RainViewer는 남이 렌더한 래스터 타일이라 우리 쪽 계산 부하가 없다.
- **`radar` ↔ `satellite`는 지금처럼 독립 유지.** 서로 다른 제품이라 겹쳐 봐도 정상. 건드리지 않는다.

**5.2 함께 손대야 하는 곳** (빠뜨리면 테스트가 깨지거나 조용히 오작동 — 리뷰 지적)

| 파일 | 할 일 | 안 하면 |
|---|---|---|
| `MET_LAYERS` 정의 + `WeatherOverlayPanel.jsx:41` 타일 목록 | `radarOverseas`를 `radar` 뒤에 추가 | 패널에 안 뜸 |
| `WeatherOverlayPanel.jsx:45` `layerLabels` | `radarOverseas: '해외 레이더'` | 라벨 빈칸 |
| `WeatherOverlayPanel.jsx:9` `WEATHER_TILE_ICON` | `radarOverseas: Globe` (국내 `Radar`와 구분) | L75 `WEATHER_TILE_ICON[id]`가 undefined → **렌더 크래시** |
| `map/layerActions.js:20` `MET_META` | `radarOverseas: { label: '해외 레이더', aliases: ['해외','overseas','rainviewer'] }` | **`layerActions.test.js` 실패** (MET_LAYERS 전항목 등록 강제) |
| `map/lib/baseMapLayers.js:225` `shouldShowGeoBoundaries()` | 조건에 `\|\| metVisibility.radarOverseas` 추가 | 해외 레이더만 켜면 **국경선이 안 그려짐**(래스터 위 대비 상실) |
| `MapView.jsx:138` `initMetVisibility()` | **변경 없음** — reduce가 자동으로 false | — |

**5.3 범례 + "프레임 없음" 안내** `WeatherLegends.jsx`
- `radarOverseasLegendVisible` 블록 추가 (이미 레이어별 조건부 블록 구조)
- **dBZ 눈금** — RainViewer 공식 색상표(스킴 2)에서 뽑고 실제 타일 픽셀로 대조 검증.
  `RAINVIEWER_LEGEND` (rainviewerLayers.js). mm/h 환산은 하지 않는다(척도가 다름 — Z-R 가정 개입).
- "회색 음영 = 레이더 미수신 지역(몽골·인도네시아 등)"
- "반사도(dBZ) — 국내 레이더의 강수량(mm/h)과 다른 척도"
- 출처: RainViewer (링크 — 라이선스 요구사항)
- `rainviewerFrame === null`이면 **이 블록에서** "해외 레이더 없음 (최근 2시간만 제공)"
  → `WeatherLayerTimestampBar`에 넣지 않는다. 그건 **예보 레이어 전용**이고 해외 레이더는 관측 레이어다.

**검증 5**
- `metLayerVisibility.test.js` — radar ↔ radarOverseas 상호배타
- `baseMapLayers.test.js` — `radarOverseas`만 켜도 `shouldShowGeoBoundaries` true
- `layerActions.test.js` — 통과(MET_META 등록 확인)

---

## Phase 6 — 문서

- `docs/operations.md` — 수집 주기표 / 캐시 정책(`/data/radar/rainviewer_meta.json: no-cache`) / 폴링 키(`rainviewerMeta`)
- `Architecture.md` — 새 소스 1줄. 파일이 스캔 가능하게 유지(줄 추가 전에 뺄 줄 확인)

---

## 최종 검증 (Playwright — `docs/dev-server-and-capture.md` 절차)

1. `해외 레이더` ON → **`레이더`(국내)가 자동으로 꺼지는가**
2. 도쿄/홍콩으로 이동 → RainViewer 타일 요청이 network에 뜨는가 + 강수 표시되는가
3. 몽골/자카르타 → **회색 커버리지 음영**이 보이는가 (레이더 없음 ≠ 비 없음)
4. 타임라인을 2시간보다 과거로 → "해외 레이더 없음" 문구
5. 10분 대기(또는 수집기 수동 1회) → `tm` 변화로 프레임이 자동 갱신되는가 (**함정 A 실전 확인**)

---

## 하지 않는 것

- 타일 프록시/캐시 — 전 사용자 타일 요청이 서버 IP 하나로 몰려 **차단 위험을 자초**한다
- nowcast(예보) 프레임
- KMA 색상표와 정합 — **의도적으로 안 맞춘다**(같은 색 다른 의미 = 오독)
- `/api/radar/rainviewer-meta` 라우트 — 쓰지 않는다
- 온보딩 투어 등록 — 기본 꺼짐 레이어. 의도적 제외
- `stats.js`의 기존 `radar`/`radar_echo` 이름 불일치 수정 — 범위 밖

## 라이선스 (착수 전 인지)

RainViewer 공식 문서: **"personal or educational use only"** — 상업적 사용 불가. 출처 표기 필수.
**운영 서비스 전환 시 이 구현 그대로는 쓸 수 없다.** 상업 라이선스 문의 필요.
