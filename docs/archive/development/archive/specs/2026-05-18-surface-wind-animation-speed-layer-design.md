# KIM 8km 지상풍 애니메이션 및 풍속 색상 레이어 설계

## 목적

ProjectAMO의 Mapbox 지도 위에 KIM 8km `u10m/v10m` 자료 기반 지상풍 레이어를 추가한다. 1차 목표는 Windy식 바람 입자 애니메이션과 같은 자료에서 계산한 풍속 색상 레이어를 제공하는 것이다.

이 문서는 구현 전 상세 설계다. 실제 코드는 아직 작성하지 않는다.

## 범위

포함:

- KIM 8km `u10m/v10m` subset 자료 수집
- 서버 측 파싱, 결합, 캐시, API 설계
- 프론트 측 바람 벡터 보간
- 지상풍 particle animation
- 풍속 색상 레이어
- Mapbox 공식 wind particle 예제의 표현 방식 참고 범위 정리
- Windy급 품질을 위해 필요한 조건 검토

제외:

- 고도별 WIN/TEM
- 구름가능역
- 착빙가능역
- 난류가능역
- 1km l010 정밀 모드
- Mapbox Raster Tile tileset 생성 또는 Mapbox-hosted wind data 사용

## 현재 판단 요약

1차 구현은 KMA subset grid를 직접 사용하는 Canvas 2D renderer로 간다. 2차 고도화는 같은 wind field API와 sampler를 유지한 채 WebGL renderer로 교체하는 방향으로 잡는다.

Mapbox 공식 예제에는 `raster-array` source와 `raster-particle` layer를 사용하는 wind particle 예제가 있다. 그 예제는 Mapbox가 준비한 GFS wind tileset을 전제로 하므로 KMA KIM ASCII subset을 바로 넣을 수 없다. ProjectAMO에서는 Mapbox 예제를 데이터/레이어 구현 방식으로 채택하지 않고, 입자 수, 속도 배율, 색상 ramp, trail/fade 같은 표현 방식과 튜닝 감각만 참고한다.

따라서 단계별 권장안은 다음과 같다.

- Phase 1: ProjectAMO 내부 API + Canvas 2D particle/color renderer
- Phase 2: 같은 renderer interface를 유지하며 WebGL renderer로 교체
- Phase 3: 필요 시 l010 1km 확대 보강, 시간 보간, multi-resolution serving을 별도 검토

## Claude 리뷰 반영 판단

리뷰는 전반적으로 조건부 GO로 받아들인다. 다만 ProjectAMO의 현재 코드와 이번 UI 결정에 비춰 모든 항목을 동일한 강도로 반영하지 않는다.

반영:

- B1: 백엔드 파일 배치는 기존 `api-client.js`, `parsers/`, `processors/`, `server.js`, `store.js` 패턴에 맞춘다. 1차에서는 `backend/src/kim/` 신설을 설계하지 않는다.
- B2: particle 좌표 변환 비용은 실제 위험이다. 매 frame 무제한 `map.project()` 호출을 기본 경로로 두지 않고, pixel 좌표 캐시와 frame cap을 전제로 한다.
- M1, M2: Canvas renderer는 프로젝트 내 첫 사례이므로 `weather-overlays/lib` 아래 weather-owned sync helper가 lifecycle과 cleanup을 책임진다. `MapView.jsx`는 helper 호출만 맡는다.
- M3: wind data hot-swap 시 particle 상태는 보존하고 다음 update부터 새 wind field를 사용한다.
- M4: 데이터 없음/503 상태에서는 기존 MET 패널의 disabled 토글 패턴을 따른다.
- M5: `/monitoring`은 shared `MapView`를 쓰더라도 1차에서 Wind 항목을 숨기고, 별도 screenshot evidence와 승인 후 노출한다.
- M6: wind data는 무거운 편이므로 초기 전체 weather bundle에 무조건 포함하지 않고, Wind가 켜졌을 때 fetch하고 켜진 동안 snapshot meta 변경을 따라간다.
- M8: `prefers-reduced-motion` 또는 data saver 환경에서는 Flow 자동 시작을 막고 사용자가 명시적으로 켜도록 한다.
- N1, N4, N5, N6: layer id prefix, 30fps throttle 방식, snapshot meta naming, WebGL async `setData` 가능성을 설계에 명시한다.

부분 반영:

- B3: 이 문서가 구현 전 proposal 역할이므로 지금 screenshot artifact를 만들지는 않는다. 다만 코드 작성 전 desktop/tablet/phone 및 `/monitoring` 캡처를 검증 조건으로 둔다.
- M7: `int16-scaled-json-v1`을 1차 API 기본 후보로 올린다. 단, parser/processor 내부 검증과 fixture는 float 값을 유지해 디버깅성을 확보한다.
- N2: wind legend만 m/s 기본, 필요 시 kt 병기를 허용한다. 다른 legend 단위 정책까지 확장하지 않는다.

반영 보류 또는 반려:

- N3: 최근 UI 결정에 따라 Wind를 켰을 때 Flow on, Speed off를 유지한다.
- N7: Mapbox 예제 제외 범위는 이번 설계의 핵심 오해 방지 항목이므로 앞쪽에 유지한다.
- N8: 7단계 고정 m/s ramp는 최근 표현 결정과 운영상 풍속 구간 의미를 반영하므로 유지한다.
- N9: Windy급 품질 조건은 1차/2차 경계 판단에 필요하므로 이 문서에 둔다.

## Mapbox 예제 참고 범위

Mapbox GL JS 공식 예제는 GFS wind tileset을 `raster-array` source로 추가한 뒤 `raster-particle` layer로 입자를 렌더링한다. 이 데이터와 source/layer 구조는 ProjectAMO 구현에 사용하지 않는다. 참고 대상은 표현 파라미터와 시각적 튜닝 감각으로 제한한다.

참고할 파라미터 감각:

```js
{
  speedFactor: 0.4,
  particleCount: 4000,
  maxSpeed: 40,
  colorRamp: [
    'interpolate by wind speed'
  ],
}
```

Mapbox 문서상 `raster-array` source는 Mapbox Tiling Service로 만든 raster-array tiles를 전제로 한다. KMA API 응답은 텍스트 격자 자료이므로 이 source에 직접 연결할 수 없다. 이 문서는 그 경로를 구현 대상으로 다루지 않는다.

ProjectAMO에서 참고할 부분:

- particle count의 대략적인 밀도
- speed factor와 max speed의 시각적 튜닝 감각
- 풍속 기반 color ramp 구성
- 입자 trail/fade 느낌
- zoom과 viewport 변화에 따라 particle density를 조정하는 방향성

사용하지 않을 부분:

- Mapbox-hosted GFS wind data
- `raster-array` source
- `raster-particle` layer 자체
- Mapbox Raster Tile/MTS 생성 파이프라인
- tileset 업로드 또는 별도 tile server 운영

## 데이터 설계

### KMA 조회

지상풍은 단일면 자료를 변수별로 호출한다.

```text
endpoint=nph-kim_nc_xy_txt2
group=KIMG
nwp=NE57
data=U
name=u10m | v10m
level=0
map=S
sub=<korea bbox grid range>
tmfc=<cycle>
hf=<forecast hour>
disp=A
```

초기 bbox:

```text
lon: 119 ~ 136
lat: 30 ~ 44
approx sub: 1429,1441,1633,1609
approx grid: 205 x 169
```

`name=u10m,v10m`처럼 복수 변수를 한 번에 요청하지 않는다. 이전 검증에서 복수 변수 호출은 실패 가능성이 있었다.

### 서버 내부 표준 구조

백엔드 processor는 u/v 두 응답을 하나의 wind field로 결합한다.

```json
{
  "type": "kim_surface_wind",
  "model": "KIMG/NE57",
  "grid": {
    "nx": 205,
    "ny": 169,
    "lonMin": 119,
    "latMin": 30,
    "lonMax": 136,
    "latMax": 44,
    "dx": 0.083333,
    "dy": 0.083333
  },
  "time": {
    "tmfc": "2026051700",
    "hf": 0,
    "validTime": "2026-05-17T00:00:00Z"
  },
  "units": {
    "u": "m/s",
    "v": "m/s",
    "speed": "m/s"
  },
  "stats": {
    "minSpeed": 0,
    "maxSpeed": 32,
    "meanSpeed": 7.4
  },
  "encoding": "int16-scaled-json-v1",
  "scale": 0.01,
  "offset": 0,
  "u": [],
  "v": []
}
```

초기 public API는 `int16-scaled-json-v1`을 기본 후보로 둔다. 한국 subset만 쓰더라도 u/v 두 배열은 반복 polling 시 부담이 될 수 있으므로, 전송량을 먼저 줄인다. parser와 processor 내부 fixture, 테스트, 원시 계산은 float 값을 유지하고 API 직전 encoding 단계에서 scale/offset을 적용한다.

후보 encoding:

- `float32-json-v1`: 구현 쉬움, 디버깅 쉬움, 전송량 큼
- `int16-scaled-json-v1`: 값에 scale/offset 적용, gzip 효율 좋음
- `arraybuffer-float32-v1`: 프론트 계산 빠름, API 응답 처리 별도 필요
- `arraybuffer-int16-v1`: 장기 추천, 전송량과 성능 균형

1차 추천은 `int16-scaled-json-v1`이다. 성능 측정에서 encoding 복잡도가 더 큰 문제로 확인되면 `float32-json-v1`로 되돌릴 수 있지만, 기본 설계는 compact JSON을 우선한다.

## 백엔드 설계

### 파일 배치

후보 파일:

```text
backend/src/config.js
backend/src/api-client.js
backend/src/parsers/kim-grid-parser.js
backend/src/processors/kim-surface-wind-processor.js
backend/src/index.js
backend/src/store.js
backend/server.js
```

`backend/src/config.js`는 KIM endpoint, timeout, collection schedule, storage retention 같은 운영 설정을 담당한다. KIM URL이나 수집 주기를 processor 안에 하드코딩하지 않는다.

g576 bbox와 grid index 변환 helper는 1차에서는 `kim-surface-wind-processor.js` 근처의 순수 함수로 둔다. 여러 KIM 레이어가 실제로 공유하기 시작하면 `backend/src/processors/kim-grid.js`처럼 processor 하위 helper로 분리한다.

최신 사용 가능한 `tmfc/hf`를 고르는 cycle helper도 1차에서는 surface wind processor 안에 둔다. 고도별 WIN/TEM 등에서 재사용이 생기면 별도 helper로 분리하되, `backend/src/kim/` 같은 신규 최상위 도메인 폴더는 만들지 않는다.

### API client

추가 함수:

```js
buildKimGridUrl({ data, name, level, tmfc, hf, sub, disp })
fetchKimGrid(params)
```

에러 판정:

- HTTP 오류는 실패
- `file is not exist`는 cycle/hf fallback 후보
- `Variable not found`는 설정 오류
- `# j =`가 있으면 `fsize: 0byte`가 있어도 성공
- 숫자 row가 없으면 실패

### cycle/hf 정책

초기 정책:

1. 현재 UTC 기준으로 최근 `00/06/12/18` cycle 후보를 만든다.
2. 원하는 forecast hour가 있으면 해당 `hf`를 우선 조회한다.
3. 실패하면 이전 cycle로 내려간다.
4. 06/18 cycle은 단기 forecast만 기대한다.
5. 00/12 cycle은 장기 forecast 후보로 둔다.

1차 지도 레이어는 최신 지상풍이 목적이므로 `hf=0` 또는 현재 시각에 가장 가까운 valid time을 우선한다.

### 저장과 노출

store type 후보:

```text
kim_surface_wind
```

API:

```text
GET /api/kim/surface-wind
```

응답은 최신 캐시를 반환한다. 자료가 없으면 `503`을 반환하되, 프론트는 레이어 비활성 상태로 graceful fallback한다.

snapshot meta:

```json
{
  "kimSurfaceWind": {
    "hash": "...",
    "tmfc": "2026051700",
    "hf": 0,
    "updated_at": "..."
  }
}
```

store type은 기존 backend 관례에 맞춰 `kim_surface_wind`처럼 snake_case로 둔다. frontend snapshot meta와 React data key는 기존 `groundForecast`/`ground_forecast` 병행 패턴을 참고해 `kimSurfaceWind` camelCase를 기본으로 쓰고, 필요하면 호환 alias만 서버 meta에 추가한다.

wind field 본문은 초기 전체 weather bundle에 무조건 포함하지 않는다. `Wind`가 켜질 때 `/api/kim/surface-wind`를 fetch하고, 켜져 있는 동안 snapshot meta hash가 바뀌면 최신 wind data를 다시 요청한다. Wind가 꺼져 있으면 meta만 갱신하고 본문 재요청은 다음 활성화 시점까지 지연한다.

## 프론트 데이터 소유권

브라우저의 wind data fetch, hash 비교, retry, stale/error 상태는 `MapView.jsx`가 직접 소유하지 않는다. 1차에서는 weather overlay feature가 소유하는 loader를 둔다.

후보 파일:

```text
frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js
```

책임:

- Wind가 켜질 때 `/api/kim/surface-wind` 요청
- Wind가 켜져 있는 동안 `/api/snapshot-meta`의 `kimSurfaceWind` hash 변경 감지
- hash 변경 시 최신 wind field 재요청
- 503, network error, stale data, loading 상태를 weather overlay model에 전달
- Wind가 꺼져 있으면 대용량 wind field 본문 fetch 중단

`frontend/src/app/useWeatherPolling.js`는 기존 weather bundle polling을 계속 담당한다. KIM wind field 본문은 여기에 포함하지 않는다. 단, 서버 snapshot meta에는 `kimSurfaceWind` entry를 추가해 wind loader가 같은 meta contract를 재사용하게 한다.

`frontend/src/app/snapshotMeta.js`와 `frontend/src/api/weatherApi.js`에 wind 본문 fetch를 통합할지 여부는 구현 시 선택할 수 있지만, 중복 polling path를 만들지 않는다. 선택지는 둘 중 하나다.

- weather-overlay 전용 `useKimSurfaceWind`가 snapshot meta를 직접 읽고 wind 본문을 관리한다.
- app polling이 `kimSurfaceWind` meta만 노출하고, wind 본문 fetch는 여전히 weather-overlay loader가 담당한다.

`MapView.jsx`는 loader 결과로 만들어진 `windField`, `windStatus`, `visibility`를 weather-owned sync helper에 넘기는 고수준 wiring만 맡는다.

## 프론트 설계

### 파일 배치

후보 파일:

```text
frontend/src/api/weatherApi.js
frontend/src/features/weather-overlays/lib/windField.js
frontend/src/features/weather-overlays/lib/windOverlaySync.js
frontend/src/features/weather-overlays/lib/canvasWindRenderer.js
frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
frontend/src/features/weather-overlays/lib/weatherOverlayModel.js
frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx
frontend/src/features/weather-overlays/WeatherLegends.jsx
```

`MapView.jsx` 변경은 최소화한다.

허용되는 변경:

- weather overlay model에 wind data를 넘김
- styleRevision effect에서 `windOverlaySync.js`의 weather-owned sync helper 호출
- component unmount 또는 map replacement 시 sync helper cleanup 호출

금지되는 변경:

- particle physics 직접 구현
- canvas draw loop 직접 구현
- wind data interpolation 직접 구현
- DOM canvas 직접 생성/제거 구현

### 레이어 ID

후보:

```text
kma-kim-wind-flow
kma-kim-wind-speed
```

MET layer id:

```text
windFlow
windSpeed
```

UI에서는 상위 `Wind` 토글 아래에 `Flow`와 `Speed` 하위 토글을 둔다. 사용자는 Wind만 켜도 흐름 애니메이션을 바로 볼 수 있고, 풍속 색상은 필요할 때 추가로 켠다.

기본 상태:

```text
Wind: off
  Flow: on when Wind is enabled
  Speed: off by default
```

레이어 의미:

- `Flow`: 움직이는 바람 입자 애니메이션
- `Speed`: 풍속에 따른 반투명 색상 레이어

1차 구현에서는 고도/시간 선택 컨트롤을 노출하지 않는다. `KIM 8km · 10m · valid time` 정보만 짧게 표시한다.

### sync helper와 renderer 책임

`windOverlaySync.js`는 Mapbox lifecycle과 React effect 사이의 얇은 adapter다. MapView는 현재 map, visibility, wind field, styleRevision에 맞춰 sync helper를 호출하고, helper 내부가 renderer 생성, data hot-swap, resize binding, animation start/stop, destroy를 담당한다.

권장 public helper:

```js
syncWindOverlay(map, model)
destroyWindOverlay(map)
```

renderer interface:

```js
renderer.setData(windField)
renderer.setVisibility({ flow, speed })
renderer.resize()
renderer.start()
renderer.stop()
renderer.destroy()
```

`setData`는 Canvas 2D에서는 동기일 수 있지만, WebGL 전환 후 texture upload가 비동기일 수 있다. sync helper는 `setData`가 Promise를 반환해도 안전하게 최신 요청만 반영하는 형태로 설계한다.

style reload와 basemap switch 시퀀스:

```text
basemap switch or style reload
-> MapView styleRevision 증가
-> syncWindOverlay(map, model) 재호출
-> helper가 기존 canvas/animation loop 중복 여부 확인
-> 기존 renderer가 새 style/container와 맞지 않으면 destroy 후 recreate
-> 현재 windField와 visibility를 다시 적용
```

React 18 strict mode에서 effect가 두 번 mount되어도 canvas와 animation loop는 하나만 남아야 한다. 중복 canvas 방지와 destroy idempotency를 renderer 테스트에 포함한다.

## 렌더링 접근법 비교

### 접근 A: Canvas 2D overlay

Mapbox map container 위에 absolute canvas를 올리고, `requestAnimationFrame`으로 particle과 speed color를 직접 그린다.

장점:

- KMA subset JSON을 바로 사용 가능
- 구현과 디버깅이 가장 빠름
- particle과 speed color를 같은 샘플러로 공유 가능
- Mapbox Raster Tile 변환이 필요 없음

단점:

- Mapbox style layer ordering과 완전히 통합되지 않음
- labels/aviation symbols 위아래 순서 제어가 제한됨
- pitch/rotation 대응을 신중히 처리해야 함
- 렌더링 부담은 서버가 아니라 사용자 브라우저 CPU에 생김

### 접근 B: WebGL renderer

Mapbox custom layer 또는 overlay WebGL canvas에서 particle advection과 풍속 색상 처리를 GPU 중심으로 수행한다.

장점:

- Canvas보다 많은 particle을 부드럽게 처리할 수 있음
- 사용자 브라우저 CPU 부담을 줄이고 GPU를 활용함
- Windy에 가까운 밀도와 trail 품질로 확장하기 좋음
- vector field texture와 color ramp texture를 활용할 수 있음

단점:

- shader, texture, framebuffer 관리가 필요함
- 구현 난도와 디버깅 비용이 큼
- 첫 데이터 파이프라인 검증 단계에는 과함

### 접근 C: Mapbox canvas/image source for speed color

풍속 색상만 canvas source 또는 image source로 Mapbox raster layer에 넣고, particle은 별도 Canvas/WebGL renderer로 렌더링한다.

장점:

- 풍속 색상 레이어는 Mapbox layer ordering에 더 잘 들어감
- existing raster overlay 패턴과 유사
- basemap switch 복구를 weather overlay helper로 관리 가능

단점:

- particle renderer와 speed renderer의 lifecycle이 나뉨
- canvas source 좌표 갱신과 redraw lifecycle이 복잡할 수 있음
- 1차에서는 같은 overlay canvas 안에서 처리하는 편이 더 단순함

## 추천 렌더링 전략

1차는 접근 A, 즉 Canvas 2D overlay로 구현한다. 2차는 renderer interface를 유지한 채 접근 B, 즉 WebGL renderer로 교체한다.

- Phase 1 particle: Canvas 2D
- Phase 1 wind speed color: 같은 Canvas 2D renderer의 아래 pass
- Phase 2 particle/color: WebGL renderer
- Optional: wind speed color ordering이 문제가 될 때만 Mapbox canvas/image source 분리 검토

처음에는 하나의 wind renderer가 두 pass를 관리한다. Canvas와 WebGL 모두 같은 public interface를 가져야 한다.

draw order:

```text
speed color pass
fade trail pass
particle line pass
```

색상 레이어를 Mapbox style ordering 안에 넣어야 하는 요구가 강하면, wind speed만 별도의 Mapbox raster/image source로 분리한다. 이 분리는 1차 구현의 필수 범위가 아니다.

## 서버와 브라우저 부담

Canvas 2D 구현은 애니메이션 부담을 서버 CPU에 넘기지 않는다. 서버는 KMA 자료를 수집, 파싱, 결합, 캐시하고 브라우저에 전달한다. 입자 이동, 보간, trail/fade, 풍속 색상 렌더링은 사용자 브라우저에서 수행된다.

부담 분리:

```text
서버 CPU:
KMA 호출, ASCII 파싱, u/v 결합, min/max 계산, 캐시, API 응답

브라우저 CPU:
Canvas 2D particle update, bilinear interpolation, line drawing, speed color pass

브라우저 GPU:
2차 WebGL 전환 후 particle update/draw, color ramp, trail texture 처리
```

따라서 사용자 수가 늘어날 때 서버의 animation 비용이 늘지는 않는다. 서버 부담은 주로 수집 주기, 캐시 정책, 응답 크기에 의해 결정된다. 사용자 기기 부담은 renderer 방식, particle count, redraw 빈도, viewport 크기에 의해 결정된다.

## 좌표와 보간

### grid lookup

KIM g576 정규 격자:

```js
x = (lon - lonMin) / dx
y = (lat - latMin) / dy
```

배열 index:

```js
i0 = floor(x)
j0 = floor(y)
tx = x - i0
ty = y - j0
```

### bilinear interpolation

각 화면 point 또는 particle 위치에서 `u/v`를 bilinear interpolation한다.

```text
u = mix(mix(u00, u10, tx), mix(u01, u11, tx), ty)
v = mix(mix(v00, v10, tx), mix(v01, v11, tx), ty)
speed = sqrt(u*u + v*v)
```

격자 밖이면 null을 반환하고 particle은 재시드한다.

### 위경도와 화면 좌표

particle state의 source of truth는 lon/lat로 유지하되, draw loop에서는 화면 pixel 좌표를 캐시해서 사용한다. seed, reseed, data sampling, map move/zoom 완료 시에는 lon/lat를 기준으로 계산하고, 일반 animation frame에서는 cached pixel position과 lightweight transform을 우선한다.

이유:

- pan/zoom 후에도 particle 위치가 지리적으로 유지됨
- viewport 밖 particle culling이 쉬움
- map transform 변화와 data transform을 분리할 수 있음

매 frame마다 모든 particle에 대해 `map.project()`를 반복 호출하는 방식은 기본 경로로 두지 않는다. 구현 전 mini-bench로 5000 particle 기준 `map.project()` 호출 비용을 측정하고, 30fps 예산을 넘으면 pixel-space update path를 사용한다.

지도 회전과 pitch는 1차에서 지원하되, 품질은 smoke test로 확인한다. pitch가 높을 때 품질이 나쁘면 wind overlay 사용 중 pitch 제한 또는 opacity fallback을 검토한다.

## particle animation 설계

### particle 상태

```ts
type Particle = {
  lon: number
  lat: number
  age: number
  maxAge: number
  prevX: number
  prevY: number
}
```

### seed 정책

- 현재 viewport bounds 안에서 무작위 lon/lat 생성
- vector field가 null이거나 speed가 너무 낮으면 다시 시도
- max attempt 후 실패하면 다음 frame에서 재시도

### update 정책

```text
velocity m/s -> degrees/frame 근사 변환
age 증가
화면 밖 / bbox 밖 / null vector / maxAge 초과 시 reseed
```

wind data가 새 `tmfc/hf`로 hot-swap되면 기존 particle의 lon/lat, age, prev pixel 좌표는 보존한다. 다음 update부터 새 wind field sampler를 사용해 흐름 방향만 자연스럽게 바뀌게 한다. 전량 reseed나 crossfade는 1차 기본 경로가 아니다.

초기 parameter:

```text
particleCountDesktop: 2500~5000
particleCountMobile: 800~1800
defaultParticleCount: viewportWidth * viewportHeight / 450
desktopCap: 5000
mobileCap: 1800
maxAge: 80 frames
speedFactor: 0.45
maxVisualSpeed: 25~30 m/s
lineWidthDesktop: 1.1~1.3 px
lineWidthMobile: 0.9~1.1 px
particleOpacity: 0.70~0.85
fadeOpacity: 0.92~0.96
frameCap: 30fps
```

실제 m/s를 화면 이동량으로 물리적으로 완벽히 맞추기보다, 방향과 상대 속도를 유지하면서 시각적으로 읽히는 값을 우선한다. 풍속이 강한 곳은 더 빠르게 흐르되 `maxVisualSpeed`로 clamp해서 화면이 번쩍이거나 과속으로 보이지 않게 한다.

`frameCap`은 `requestAnimationFrame` timestamp 기반 skip으로 구현한다. 기본은 30fps이며, mobile low preset 또는 reduced-motion/data-saver 환경에서는 24fps 이하 또는 Flow off를 허용한다.

### 색상

particle 색상은 speed 기반으로 정한다.

초기 color ramp:

```text
0-2 m/s: muted blue-gray
2-5 m/s: blue
5-8 m/s: cyan/green
8-12 m/s: green/yellow
12-16 m/s: orange
16-22 m/s: red
22+ m/s: magenta/white highlight
```

ProjectAMO는 운영 도구이므로 지나치게 장식적인 palette는 피한다. radar/satellite/SIGWX와 동시에 켰을 때도 상태를 구분할 수 있어야 한다.

풍속 색상 ramp는 데이터별 min/max 자동 스케일을 쓰지 않고 고정 m/s 구간을 사용한다. 자동 스케일은 장면마다 색 의미가 달라져 운영 판단을 흐리게 할 수 있다.

legend에는 m/s를 기본으로 표시하고, 필요하면 kt를 병기한다.

```text
5 m/s  ~= 10 kt
10 m/s ~= 19 kt
15 m/s ~= 29 kt
20 m/s ~= 39 kt
25 m/s ~= 49 kt
```

## wind speed color layer 설계

풍속 색상 레이어는 `u10m/v10m`에서 계산한 speed grid를 사용한다.

### 1차 구현

viewport 크기의 offscreen canvas를 만들고, 화면 픽셀을 일정 간격으로 샘플링해 색상 grid를 그린다.

성능을 위해 모든 픽셀을 매번 계산하지 않는다.

초기 설정:

```text
sampleStep: 2~4 px
blur/interpolation: canvas smoothing 또는 bilinear sample
opacity: 0.28~0.40
defaultOpacity: 0.35
redraw trigger: wind data 변경, map moveend, zoomend, resize, visibility on
```

지도 이동 중에는 color layer redraw를 throttle하고, particle은 계속 움직이게 한다. 이동 종료 후 고해상도 redraw를 수행한다.

### 2차 이후 구현

Canvas 2D 검증 후 성능 병목이 있으면 WebGL renderer로 전환한다. speed raster를 서버에서 PNG/WebP로 렌더링해 Mapbox raster/image source에 넣는 방식은 서버 CPU와 색상 정책 부담을 늘리므로 기본 경로로 삼지 않는다.

장점:

- WebGL 전환 시 프론트 CPU 부담을 줄일 수 있음
- particle 밀도와 trail 품질을 높일 수 있음
- 같은 wind field API와 sampler 개념을 유지할 수 있음

단점:

- WebGL은 구현 난도가 높음
- shader/texture 기반 테스트가 필요함
- 서버 렌더링 raster 방식은 색상 ramp 변경마다 서버 정책이 필요하므로 후순위

## UI/UX 설계

MET panel에는 Wind 항목을 추가한다.

초기 구조:

```text
Wind [toggle]
  Flow [on when Wind enabled]
  Speed [off by default]
  KIM 8km · 10m · valid time
```

기본 상태:

```text
Wind: off
Flow: on when Wind is enabled
Speed: off by default
```

reduced-motion 또는 data-saver 환경에서는 접근성/기기 부담을 우선해 예외적으로 Flow를 자동 on 하지 않는다.

이 예외 상황에서는 사용자가 Wind를 켰는데 아무 변화가 없는 것처럼 보이지 않도록 `저전력 모드` 같은 짧은 상태 문구를 Wind 하위 영역에 표시한다. Flow 토글은 off 상태로 남기고 사용자가 명시적으로 켤 수 있게 한다.

표시 정보:

- 기준시각 `tmfc`
- 예측시간 `hf`
- 유효시각 `validTime`
- 모델명 `KIM 8km`
- 지상풍 `10m`

legend:

- m/s 기본
- 필요하면 kt 병기

데이터 없음 상태:

- `/api/kim/surface-wind`가 503이거나 wind field가 없으면 Wind 토글을 disabled 처리한다.
- disabled 표현은 기존 radar/satellite 비가용 상태와 같은 `isLayerDisabled` 패턴을 따른다.
- legend와 `KIM 8km · 10m · valid time` 표시는 wind field가 있을 때만 노출한다.

monitoring 화면:

- `/monitoring`은 `MonitoringMap.jsx`가 같은 `MapView`와 MET panel을 재사용하므로, 별도 gating 없이는 Wind 항목이 자동 노출될 수 있다.
- 1차 구현 범위에서는 `/monitoring` MET panel에 Wind 항목을 노출하지 않는다.
- monitoring은 밀도가 높은 운영 화면이므로 Wind 노출은 별도 screenshot evidence와 사용자 승인 후 추가한다.
- 구현상 shared `MapView`를 재사용하더라도 monitoring context에서 Wind를 숨길 수 있는 feature flag 또는 prop을 설계한다. 이 gating logic도 `MapView` 안에 표현 로직을 늘리지 않고 weather overlay panel/model 경계에서 처리한다.

1차 구현에서는 입자 크기, 애니메이션 속도, 풍속 색상 opacity를 사용자 슬라이더로 노출하지 않는다. 대신 내부 프리셋을 사용한다.

```text
quality: auto
desktop: normal
mobile: low
large screen: high
```

추후 필요하면 `저전력 / 표준 / 고밀도` 정도의 3단계 품질 선택만 노출한다. 세부 튜닝 슬라이더는 운영 UI를 복잡하게 만들 수 있으므로 기본 방향에서 제외한다.

운영 UI이므로 화면 안 텍스트는 짧게 유지한다. 자세한 알고리즘 설명은 문서나 tooltip에 둔다.

## Windy급 품질을 위한 조건

Windy급으로 보이려면 렌더링만 좋아서는 부족하다. 데이터 시간해상도, 공간해상도, 보간, 색상, 성능이 모두 맞아야 한다.

### 데이터 조건

필요:

- forecast cycle을 안정적으로 최신화
- 시간 interpolation: `hf=t`와 `hf=t+1/3/6` 사이 보간
- 공간 interpolation: bilinear 이상
- 확대 시 8km grid 한계를 감추는 smoothing
- 해상도별 데이터 전략

KIM 8km만으로 가능한 품질:

- 한국 주변 광역 바람 흐름 표현
- 저고도 지상풍 방향과 상대 강도 표현
- 운영용 overlay로 충분한 수준

KIM 8km만으로 어려운 품질:

- 산악/해안 주변 미세 바람
- 공항 주변 micro-scale 변화
- 고 zoom에서 Windy처럼 촘촘한 국지 흐름

Windy급에 가까워지기 위한 추가 조건:

- 확대 레벨에서 l010 1km optional refinement
- `u10m/v10m` 외에 지형/해륙 마스크 기반 smoothing
- 시간 보간을 위한 인접 forecast frame 캐시
- 2차 WebGL particle/color renderer
- tile 기반 multi-resolution serving

### 렌더링 조건

필요:

- particle reseed가 눈에 띄지 않을 것
- pan/zoom 중 끊김이 적을 것
- frame time이 16~33ms 안에 들어올 것
- mobile에서 particle count adaptive 감소
- map style reload 후 중복 canvas/animation loop가 남지 않을 것

품질 검증 기준:

- desktop 1920x1080에서 30fps 근접
- laptop급 GPU 없이도 조작 가능
- mobile viewport에서 UI 조작이 버벅이지 않음
- basemap switch 2회 후 레이어 중복 없음
- radar/satellite/SIGWX와 함께 켜도 의미가 읽힘

## 성능 전략

### adaptive particle count

화면 면적과 devicePixelRatio를 기준으로 particle count를 조정한다.

```text
base = viewportWidth * viewportHeight / 450
desktop cap = 5000
mobile cap = 1800
low power cap = 1000
```

내부 preset:

```text
quality: auto
mobile low: cap 1800, frameCap 24~30fps, lineWidth 0.9~1.1px
desktop normal: cap 5000, frameCap 30fps, lineWidth 1.1~1.3px
large screen high: cap 5000, sampleStep 2px, frameCap 30fps
```

`prefers-reduced-motion: reduce` 또는 `navigator.connection.saveData`가 감지되면 Wind를 켤 때 Flow를 자동 시작하지 않고 Speed도 기본 off를 유지한다. 사용자가 직접 Flow를 켜면 low power preset으로 렌더링한다.

### redraw 분리

- particle animation: 매 frame
- speed color layer: data/map 상태 변경 시 redraw
- legend/UI: React state 변경 시

React state로 animation frame마다 값을 밀어 넣지 않는다. renderer는 imperative object로 관리한다.

### Canvas to WebGL 전환 경계

Canvas 2D에서 WebGL로 넘어갈 때 바꾸는 대상은 renderer 내부뿐이어야 한다. Phase 1 `CanvasWindRenderer`는 삭제하지 않고 WebGL 미지원 또는 실패 환경의 fallback renderer로 유지한다.

공유해야 하는 것:

- `windField` API 응답 형식
- lon/lat to grid index 변환
- bilinear interpolation 규칙
- speed 계산과 color ramp 정의
- renderer lifecycle interface
- MET panel toggle과 legend

Canvas 전용으로 격리할 것:

- `canvas.getContext('2d')`
- `ctx.stroke`, `ctx.fillRect`
- 2D canvas trail fade
- 2D line drawing

WebGL 전환 시 새로 구현할 것:

- vector field texture 업로드
- particle state texture 또는 buffer
- advection shader
- trail framebuffer
- color ramp shader
- WebGL context 생성 실패, shader 초기화 실패, runtime context lost 시 `CanvasWindRenderer` fallback

### cleanup

wind renderer는 명시적 lifecycle을 가진다.

```js
renderer.setData(windField)
renderer.setVisibility({ flow, speed })
renderer.resize()
renderer.start()
renderer.stop()
renderer.destroy()
```

Mapbox style reload, component unmount, visibility off에서 animation frame과 DOM canvas를 정리한다.

## 테스트와 검증

### parser/processor 테스트

- 작은 `u10m/v10m` fixture를 파싱한다.
- nx/ny와 row count가 맞는지 확인한다.
- `fsize: 0byte`가 있어도 `# j =`와 숫자 row가 있으면 성공 처리한다.
- `Variable not found`는 실패 처리한다.
- speed min/max 계산을 검증한다.

### interpolation 테스트

- known 2x2 grid에서 bilinear 결과를 검증한다.
- bbox 밖 좌표는 null을 반환한다.
- lon/lat to grid index 변환을 검증한다.

### renderer 테스트

Mapbox mock으로 가능한 범위:

- helper가 중복 canvas를 만들지 않음
- visibility off 시 animation stop
- data 변경 시 renderer setData 호출
- destroy 후 requestAnimationFrame loop 없음
- React 18 strict mode처럼 effect가 반복 mount되어도 canvas와 loop가 하나만 유지됨
- wind data hot-swap 시 particle state를 보존하고 새 sampler만 적용함

성능 mini-bench:

- 빈 Canvas에서 5000 particle 기준 projection/cached pixel path 비용을 비교한다.
- `map.project()`를 매 frame 전체 particle에 호출하는 방식이 30fps 예산을 넘으면 pixel cache path를 기본으로 확정한다.
- desktop 1920x1080과 mobile viewport 각각에서 frameCap 30fps 또는 mobile low preset 기준을 확인한다.

브라우저 검증:

- wind particles visible
- speed color visible
- toggle 동작
- basemap switch 후 복구
- pan/zoom 후 overlay 위치 일치
- mobile viewport에서 패널과 지도 조작 가능
- Flow와 Speed를 함께 켰을 때 airport marker, aviation labels, SIGWX vector/label, map controls가 읽히고 조작 가능한지 확인
- 현재 MET panel desktop/tablet/phone 캡처와 `/monitoring` 캡처를 `artifacts/responsive-screenshots/wind-layer-design/` 아래에 남긴 뒤 구현 UI가 들어갈 위치와 충돌 여부를 확인

필수 screenshot state matrix:

```text
main map MET panel:
- Wind off
- Wind on / Flow on / Speed off
- Wind on / Flow on / Speed on
- wind data unavailable or 503 disabled state
- reduced-motion or data-saver exception state

/monitoring:
- Wind hidden in Phase 1
- existing MET panel density unchanged
```

## 구현 순서

1. KIM surface wind API 파이프라인
2. wind field parser/processor 테스트
3. frontend wind field model/sampler
4. renderer interface 정의
5. Canvas 2D particle renderer
6. Canvas 2D speed color pass
7. MET panel toggle과 legend
8. `windOverlaySync.js` weather-owned sync 연결
9. MapView에는 sync helper 호출과 cleanup wiring만 추가
10. browser smoke, screenshot evidence, 성능 mini-bench
11. 1차 성능 측정 후 WebGL renderer 전환 여부 결정

## 2차 WebGL 전환 조건

Canvas 2D 1차 구현 후 다음 조건 중 하나 이상이면 WebGL 전환을 시작한다.

- desktop 1920x1080에서 30fps 유지가 어렵다.
- mobile viewport에서 지도 조작이나 panel interaction이 눈에 띄게 버벅인다.
- particle count를 낮추면 바람 흐름 해석성이 떨어진다.
- wind speed color pass와 particle pass를 함께 켰을 때 CPU 사용량이 높다.
- 사용자가 Windy에 가까운 밀도와 trail 품질을 명확히 요구한다.

WebGL 전환 시에도 백엔드 API와 MET panel UI는 유지한다. 교체 대상은 기본 renderer 선택을 `CanvasWindRenderer` 단독에서 `WebGLWindRenderer` 우선으로 바꾸는 것에 한정한다.

renderer 선택 정책:

```text
WebGL 사용 가능 -> WebGLWindRenderer 사용
WebGL context 생성 실패, shader 초기화 실패, runtime context lost -> CanvasWindRenderer fallback
Canvas fallback도 실패 -> Wind overlay만 cleanup/disabled, 지도와 나머지 UI는 유지
```

`windOverlaySync.js`는 이 선택과 fallback을 weather overlay 경계 안에서 처리한다. `MapView.jsx`는 renderer 종류를 알지 않아야 하며, 기존처럼 wind field, visibility, styleRevision에 따른 high-level sync 호출만 맡는다.

## 확정 결정과 후속 검토

### 초기 encoding

1차 public API 기본 후보는 `int16-scaled-json-v1`이다. parser/processor 내부 계산과 fixture는 float 값을 유지한다.

### speed color layer ordering 후속 검토

초기에는 particle renderer 안의 color pass로 시작한다. Mapbox layer ordering이 문제가 되면 speed color만 Mapbox raster/image layer로 분리한다.

### Mapbox 예제 활용 범위

Mapbox 예제는 표현 방식과 튜닝 값만 참고한다. `raster-array`, `raster-particle`, Mapbox-hosted GFS tileset, MTS 기반 tileset 생성은 이번 구현 경로에서 제외한다.

## 참고 자료

- Mapbox GL JS example: Create a wind particle animation  
  https://docs.mapbox.com/mapbox-gl-js/example/raster-particle-layer/
