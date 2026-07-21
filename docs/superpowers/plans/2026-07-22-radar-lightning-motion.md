# 레이더 관측 이동 화살표 구현 계획

> **For implementation:** Execute task-by-task. Do not add forecast behaviour.

**Goal:** 연속된 KMA 레이더 5분 관측 프레임에서 대류 에코의 관측 이동 경향만 산출해 지도에 화살표로 표시한다. 낙뢰는 벡터 계산에 쓰지 않고 포인트로만 함께 표시한다.

**Architecture:** 백엔드는 레이더 PNG 렌더 직전에 원시 반사도 격자를 축소한 이동 입력으로 만들고, 인접 프레임과 비교해 작은 GeoJSON을 발행한다. 프런트엔드는 실제로 그려진 `radarFrame.tm`과 정확히 일치하는 결과만 Mapbox 레이어에 연결한다. 토글과 지도 레이어는 `weather-overlays`가 소유하고 `MapView`는 조합만 한다.

**Tech Stack:** Node.js, KMA 반사도 격자, GeoJSON, React, Mapbox GL, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-radar-lightning-motion.md`

## Task 1: 순수 이동 산출기와 테스트

**Files:**

- Create `backend/src/processors/radar-motion.js`
- Create `backend/test/radar-motion.test.js`

1. 작은 합성 격자로 먼저 실패하는 테스트를 작성한다: 동쪽 이동 에코는 동쪽 `LineString`과 양의 `speedKt`를 내고, 정지·약한·저신뢰도 에코는 제외하며, `observedAtMs`/`comparedFromMs`은 입력 epoch와 정확히 같다. 전국 후보 결과는 고정 상한 이하이다.
2. 아래 순수 함수를 구현한다.

   ```js
   export function createMotionInput(refl, geometry, options)
   export function deriveObservedMotion(previousInput, currentInput, options)
   export function serializeMotionInput(input)
   export function deserializeMotionInput(buffer)
   ```

3. 원본 0.5 km 격자를 4×4(약 2 km) 최대 반사도 블록으로 축소한다. 첫 구현의 반사도 임계값, 탐색 반경, 최소/최대 속도, 신뢰도 임계값과 전국 후보 상한은 상수와 synthetic fixture 기대값으로 함께 고정한다. 약 20–30 km 간격 후보에서 제한된 탐색창 상관도를 비교하고, 이 기준을 통과한 것만 선택한다. 백엔드는 화면/뷰포트를 알 수 없으므로 여기서는 전국 후보만 제한한다.
4. feature는 `LineString`이며 `observedAtMs`, `comparedFromMs`, `speedKt`, `bearingDeg`, `confidence`를 가진다. 선 길이는 속도, opacity는 신뢰도에 대응한다. 좌표 변환은 parser의 기존 `gridToLatLon`을 재사용하며 별도 투영을 만들지 않는다.
5. 이동 산출 자체의 30초 상한을 둔다. 상한 초과는 명시적 실패 결과로 반환하되 호출자의 레이더 발행을 중단시키지 않는다.
6. `node --test backend/test/radar-motion.test.js`를 실행해 통과시킨다.

## Task 2: 레이더 수집과 안전한 프레임별 발행

**Files:**

- Modify `backend/src/processors/radar-echo-processor.js`
- Modify `backend/server.js`
- Create `backend/test/radar-echo-motion-publication.test.js`

1. 임시 data directory와 모의 fetch/renderer로 실패 테스트를 작성한다. 연속 프레임은 `motion_korea_<tm>.geojson`과 epoch metadata를 만들고, 다음 정상 주기의 새 프레임 하나도 저장된 직전 축소 입력으로 비교할 수 있어야 한다. 10분 이상 벌어진 입력은 산출하지 않고, 이동 계산 실패는 PNG/`echo_meta.json` 발행을 막지 않아야 한다. `writeMeta()` 재생성 뒤에도 frame의 motion metadata가 남고, render-version invalidation 때는 함께 재생성되어야 한다.
2. `parseRadarBinary()` 직후 PNG 렌더 전에 `createMotionInput()`을 호출한다. `renderFrame()`은 frame과 축소 입력을 함께 반환하고, 호출자는 `isLatest`를 명시해 최신 수집 경로만 `radar/motion_input_latest.bin`을 원자적으로 저장하게 한다. 이 파일은 축소 격자·tm·셀 거리만 담으며 원시 `refl` 전체를 저장하거나 다시 요청하지 않는다. `previous.tm`과 `current.tm`이 정확히 5분 차이일 때만 산출하며, 수집 실패 뒤 10분 이상 벌어졌으면 새 벡터를 내지 않는다.
3. 같은 실행의 immediate/background fill은 시간 오름차순으로 직전 축소 입력을 메모리에 유지해 인접 쌍만 계산한다. background fill은 최신 상태 파일을 덮어쓰지 않는다. 인접 입력이 없는 과거 시각은 정상적으로 “이동 자료 없음”이다.
4. 성공 결과는 임시 파일 작성 후 rename으로 `radar/motion_korea_<currentTm>.geojson`을 먼저 확정하고, 그 뒤 `writeMeta()`가 재생성하는 frame 객체의 `motion` 키에 metadata를 넣어 `echo_meta.json`을 원자적으로 쓴다. `motion`에는 KST `tm`과 `observedAtMs`/`comparedFromMs` epoch를 함께 싣는다. 실패 시 기존 meta는 유지하며 불완전 GeoJSON을 가리키지 않는다. metadata 정리와 같은 기준으로 오래된 `motion_korea_*`도 함께 정리한다. `RENDER_VERSION` 변경은 motion도 다시 생성하는 cache invalidation임을 상태 문서에 남긴다.

   ```json
   { "motion": { "observedAt": "YYYYMMDDHHmm", "comparedFrom": "YYYYMMDDHHmm", "path": "/data/radar/motion_korea_YYYYMMDDHHmm.geojson" } }
   ```

5. `/data`는 이미 정적 제공 중이므로 접근 allowlist를 새로 만들지 않는다. 대신 `setGeneratedDataCacheHeaders()`에 `radar/motion_korea_\d{12}\.geojson`의 PNG와 같은 immutable cache 규칙만 추가한다.
6. `npm.cmd --prefix backend test -- test/radar-motion.test.js test/radar-echo-motion-publication.test.js`로 성공·누락·시간초과·background fill을 검증한다.

## Task 3: 실제 표시 레이더 프레임에만 벡터 연결

**Files:**

- Create `frontend/src/features/weather-overlays/lib/radarMotionLayers.js`
- Create `frontend/src/features/weather-overlays/lib/useRadarMotionOverlay.js`
- Create `frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js`
- Modify `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify `frontend/src/features/map/MapView.jsx`

1. 모델 테스트를 먼저 추가한다. slider가 21:57이어도 실제 표시 레이더가 21:55면 21:55 `motion.observedAtMs`만 사용한다. exact match가 없으면 stale vector를 쓰지 않는다. 표시 프레임이 최신 레이더 프레임보다 20분 이상 오래되면 `stale: true`로 하고 벡터를 숨긴다. 낙뢰 age 기준과 범례 age label은 레이더가 표시될 때 `radarFrame.timeMs`를 사용하고, 레이더가 없을 때는 호출자가 준 기존 `lightningReferenceTimeMs`를 유지한다.
2. `buildWeatherOverlayModel()`은 `radarFrame`을 선택한 뒤 exact motion만 다음 형태로 반환한다.

   ```js
   radarMotion: { visible, stale, frameTm, dataUrl, observedAtMs, comparedFromMs }
   ```

   레이더가 꺼졌거나 exact 자료가 없으면 `visible: false`, `dataUrl: null`이다.
3. `radarMotionLayers.js`가 GeoJSON source와 shaft/arrowhead 레이어를 설치·갱신·제거한다. source는 `dataUrl`만 읽으며 원시 격자/별도 API를 브라우저로 보내지 않는다. 줌 5 미만은 layer `minzoom: 5`로 숨긴다. 줌 5 이상에서는 현재 map bounds를 6×10 화면 격자로 나눠 각 격자의 최고 신뢰도 하나만 source에 넣어 최대 60개를 보장하고, moveend/style reload 뒤 다시 선택한다. 화살표 머리는 `advisoryLayers.js`의 기존 회전 Mapbox 화살표 패턴을 재사용한다. style reload 및 base-map 변경은 기존 weather overlay sync 경로에서 재설치한다.
4. `useRadarMotionOverlay.js`가 기본 OFF의 `requestedVisible`과 `effectiveVisible`을 제공한다. 후자는 `requestedVisible && radarEnabled && hasExactMotionFrame && !stale`일 때만 true다. MapView는 훅과 model을 조합할 뿐 Mapbox id/state를 소유하지 않는다.
5. Mapbox mock 테스트로 exact URL, radar off, 자료 부재, stale, zoom 4/5, viewport 60개 선택, style reload, 중복 source/layer 방지를 검증한다.

## Task 4: 레이더 범례 안의 접근 가능한 토글

**Files:**

- Modify `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify 레이더 범례 스타일을 소유한 기존 CSS 파일
- Create or Modify `frontend/src/features/weather-overlays/WeatherLegends.test.js`

1. 현재 Node test harness에는 DOM/JSX 변환이 없으므로 `WeatherLegends.test.js`는 소스 수준에서 토글 문구, `aria-pressed` 바인딩, disabled 조건, 44px CSS 규칙, timezone 인자 전달을 단언한다. 실제 클릭→상태 전환은 Task 5 Playwright 계약으로 검증한다.
2. 기존 레이더 범례/상태 영역 안에만 토글을 배치한다. 기본 OFF, 44px 이상 모바일 터치 영역, 키보드 포커스, 문구 “관측 이동 · 5분 비교 · 예측 아님”을 적용한다. 범례의 관측/비교 시각은 현재 `tz`를 `formatReferenceTimeLabel()`에 전달해 KST/UTC 설정에 맞춰 렌더한다. stale이면 자료 지연 상태를 표시한다.
3. 좁은 폭에서는 범례와 토글이 자연스럽게 두 행으로 흐르도록 한다. 별도 레이어 타일, 플로팅 버튼, 낙뢰 전용 이동 토글은 만들지 않는다. 레이더 off 때는 토글과 화살표가 즉시 숨겨진다.

## Task 5: 브라우저 계약·반응형 증거·문서

**Files:**

- Modify `frontend/verification/contracts/map-base.spec.mjs`
- Create `artifacts/responsive-screenshots/radar-motion/<timestamp>/README.md`
- Create `artifacts/responsive-screenshots/radar-motion/<timestamp>/review/issues.md`
- Create desktop/iPad landscape/mobile capture PNGs
- Modify `Architecture.md`
- Modify `docs/superpowers/status/radar-lightning-motion.status.md`

1. 먼저 `map-base`가 사용할 deterministic fixture를 만든다: `echo_meta.json`의 레이더 2프레임, 그중 최신 프레임의 PNG와 exact motion GeoJSON 하나를 route/mock한다. 그 뒤 fixture 위에서 Mapbox 관측으로 exact frame source URL과 layer visibility를 확인한다: 레이더 범례 안의 토글, standalone tile 부재, 실제 클릭 on/off, 레이더 재활성, 서로 다른 base map 두 번 전환 후 재설치 및 중복 방지, exact 자료 없는 경우 disabled/stale 금지, 이름 있는 토글 제어를 검증한다.
2. `docs/operations/dev-server-and-capture.md` 절차를 따라 다음을 실행한다.

   ```powershell
   npm.cmd run dev:contract -- --grep map-base
   ```

3. desktop, iPad landscape, mobile에서 토글·범례·화살표·낙뢰 동시 표시를 캡처하고 artifact에 실행 명령/viewport/결과 README와 issues review를 남긴다.
4. `Architecture.md`에 motion module, 축소 입력, public GeoJSON, map layer adapter, hook 책임과 데이터 흐름을 기록한다. 상태 문서에는 완료 Task와 검증 증거, 남은 임계값 보정을 갱신한다.
5. 완료 전 전체 검증을 실행한다.

   ```powershell
   npm.cmd --prefix backend test -- test/radar-motion.test.js test/radar-echo-motion-publication.test.js
   npm.cmd run dev:contract -- --grep map-base
   git diff --check
   ```

## Non-negotiable decisions

- 기준 시각은 slider instant가 아니라 실제 렌더링 `radarFrame.tm`이다.
- 화살표는 관측 이동 경향이지 5분 후 위치·위험·경로 예측이 아니다.
- 낙뢰는 벡터 입력이 아니며, 표시 기준 시각만 `radarFrame.tm`으로 통일한다.
- 벡터 실패는 레이더 PNG/메타데이터 정상 발행을 되돌리지 않는다.
- 원시 반사도 격자는 브라우저로 보내지 않는다.
