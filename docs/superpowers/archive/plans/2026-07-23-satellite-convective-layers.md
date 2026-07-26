# Plan: 위성 대류 가능성·구름 꼭대기 레이어

**Spec:** `docs/superpowers/specs/2026-07-23-satellite-convective-layers.md`  
**Goal:** 기존 위성 프레임을 변경하지 않고, 같은 GK2A 시각의 CI·CTPS 파생 자산을 독립 저장·표시한다.

## Codebase facts this plan preserves

- 기존 위성의 생성·재시도·백필은 `backend/src/processors/satellite-processor.js`가 `sat_meta.json`과 `sat_korea_*.webp`를 함께 소유한다. 이 파일의 FOG 재시도와 백필은 나중에 실행될 수 있으므로 CI·CTPS 메타를 이 파일에 섞지 않는다.
- 메인 관측 시간축은 `weatherOverlayModel`이 위성 프레임의 KST `tm`을 epoch로 바꿔 만들고, `MapView`가 `TimelineRail`에 전달한다. CI·CTPS는 이 위성 프레임의 정확히 같은 `tm`에서만 선택한다.
- `MapView.jsx`는 Mapbox 생성·style revision·고수준 JSX 조합만 맡는다. Mapbox source/layer, 클릭 이벤트, CTPS 선택 상태는 `weather-overlays/lib`의 전용 훅이 소유한다.
- 새 MET 토글은 `MET_LAYERS`와 `layerActions`를 함께 바꾸고, 기존 `layerActions.test.js`의 등록 강제를 통과해야 한다. CI·CTPS는 브리핑 `hazardLayers` 룰북에는 추가하지 않는다.
- 기존 `LevelRail`은 절대 위치라 여러 개를 그대로 렌더하면 겹친다. 레일을 쌓는 공용 컨테이너와 embedded 표시 모드를 먼저 만든다.

## Global Constraints

- CI·CTPS 원시 NetCDF는 서버에서만 해석한다. 브라우저에는 CI GeoJSON, CTPS WebP, 그리고 클릭 시 한 점의 정규화된 조회 결과만 보낸다.
- CI·CTPS 파생 자산은 `DATA_PATH/satellite/convective/`와 별도 `convective_meta.json`에 저장한다. 기존 `sat_meta.json`과 기존 위성 파일을 변경·정리·재발행하지 않는다.
- 위성 프레임을 정상 발행한 뒤에만 CI·CTPS 수집을 시작한다. 파생 수집 실패는 기존 위성 프레임과 마지막 정상 CI·CTPS 자산에 영향을 주지 않는다.
- `CTH`의 km 높이는 ft로 환산해 UI의 FL 표기와 비교한다. 색상·고도 필터는 실제 환산 ft로 판정하고, 상세·범례에는 `CTH 기반 높이`라고 표시한다.
- CTPS 정상값은 `CTPS_flag === 0` 및 유효 `CTH`로 제한한다. 맑음, fill, 품질 불량, 산출 실패는 투명·조회 불가다.
- 새 UI는 기존 Mapbox 레이어·관측 타임라인·레이어 액션·반응형 계약을 대체하지 않고 확장한다.

---

## Task 0: 구현 전 결정·충돌 검토

**Files:**
- Modify: `docs/superpowers/status/satellite-convective-layers.status.md`

- [ ] Step 1: 승인된 spec과 이 계획을 독립 read-only 리뷰어가 비교한다. 다음을 확인한다: CI의 `대류 가능성` 표기, 위성 OFF 상태의 시간 이동, 정확한 같은 `tm`만 표시, CTH 기반 FL 표기, 두 레이어 동시 표시, 부분 실패 보존, 모바일 고도 레일과 선택 카드.
- [ ] Step 2: 계획이 `sat_meta.json`을 수정하지 않고 `convective_meta.json`만 발행하는지, `layerActions` 등록·`map-base` 계약·Architecture 갱신을 빠뜨리지 않는지 확인한다.
- [ ] Step 3: 결과가 `PASS`일 때만 상태 파일 **Verified**에 날짜와 함께 기록한다. `DECISION GAP`이면 구현을 시작하지 않고 사용자에게 영향과 선택지를 제시한다.

## Task 1: 독립 CI·CTPS 수집·정규화·원자 발행

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/parsers/satellite-parser.js`
- Modify: `backend/src/processors/satellite-processor.js`
- Create: `backend/src/processors/convective-satellite-model.js`
- Create: `backend/src/processors/convective-satellite-store.js`
- Create: `backend/src/processors/convective-satellite-processor.js`
- Create: `backend/src/parsers/satellite-parser.test.js`
- Create: `backend/src/processors/convective-satellite-model.test.js`
- Create: `backend/src/processors/convective-satellite-store.test.js`
- Create: `backend/src/processors/convective-satellite-processor.test.js`

**Interfaces:**
- Consumes: 정상 발행된 `sat_meta.json.latest`의 `tm`·`request_tm_utc`, GK2A LE2 CI·CTPS NetCDF.
- Produces: `satellite/convective/convective_meta.json`, `ci_<tm>.geojson`, `ctps_<tm>_{all|fl050…fl550}.webp`, 서버 전용 `ctps_<tm>.bin`.

- [ ] Step 1: `config.satellite`에 CI·CTPS LE2 product URL·이름과 `convective_enabled`를 추가한다. 파생 수집은 기존 `satellite_interval`과 같은 위성 프레임 직후에만 실행하며 별도 cron을 만들지 않는다.
- [ ] Step 2: `satellite-parser.js`에 `parseCiNC(buffer)`와 `parseCtpsNC(buffer)`를 추가한다. 기존 LE2 투영 속성 읽기를 재사용하고, CI에서는 `CI1_prob`·DQF, CTPS에서는 `CTH`·`CTT`·`CTPS_flag`·scale/fill 속성을 반환한다. HDF5 magic bytes가 아닌 응답과 필수 변수 누락은 파싱 전에 거절한다.
- [ ] Step 3: `convective-satellite-model.js`에 순수 변환을 둔다. CI는 유효 DQF의 값 3·4만 각각 이진 격자로 만들고 설치된 `d3-contour`로 인접 영역 GeoJSON을 만든다. CTPS는 유효 CTH를 ft로, CTT 켈빈을 섭씨로 환산한다. `전체` 및 `FL050`~`FL550`별로 선택값보다 낮은 픽셀을 투명 처리한 RGBA 래스터를 만든다. 래스터 픽셀 알파는 불투명 또는 투명만 사용하고, 지도 layer opacity 0.55를 한 번만 적용한다. 높이 색은 `<FL100` 녹색, `FL100–199` 노랑, `FL200–299` 주황, `FL300–399` 빨강, `≥FL400` 보라로 고정한다.
- [ ] Step 4: `convective-satellite-store.js`에 경로 검증, 자산 경로 생성, compact CTPS binary read/write, 보존 개수 정리, `convective_meta.json`의 임시 파일→rename 원자 발행을 둔다. 메타에는 각 프레임의 `tm`, `request_tm_utc`, CI·CTPS 경로, bounds, CTPS 선택 가능한 FL 목록만 기록한다. 새 메타가 완성되기 전에는 기존 메타·자산을 삭제하지 않는다.
- [ ] Step 5: `convective-satellite-processor.js`는 입력받은 정상 위성 프레임 하나에 대해 CI·CTPS를 병렬 다운로드하고, 성공한 자산만 독립 메타에 병합한다. CI 또는 CTPS 중 하나가 실패해도 다른 하나와 과거 정상 프레임을 보존한다. 같은 `tm` 재시도는 성공한 자산을 null로 교체하지 않는다.
- [ ] Step 6: `satellite-processor.js`는 `writeMeta`로 현재 위성 프레임을 발행한 뒤 `convective_enabled`일 때만 `collectConvectiveSatelliteFrame(meta.latest)`를 호출한다. 이 호출은 오류를 잡아 기록하고, 실패를 위성 수집 실패로 전파하지 않는다. FOG 재시도·백필 함수는 호출하지 않아 기존 위성 메타에 대한 동시 쓰기 구조를 보존한다.
- [ ] Step 7: parser/model fixture 테스트로 CI 3·4 영역화, DQF 제외, CTPS scale·fill·flag, FL050 필터, 색상 구간, CTT 섭씨 변환을 확인한다. store/processor 테스트로 원자 메타 발행, 잘못된 경로 거절, CI만 또는 CTPS만 실패한 재시도 보존, 기존 `sat_meta.json` 불변을 확인한다.
- [ ] Step 8: Verify — `node --test src/parsers/satellite-parser.test.js src/processors/convective-satellite-model.test.js src/processors/convective-satellite-store.test.js src/processors/convective-satellite-processor.test.js`를 `backend/`에서 실행한다. 기대: 변환·저장·부분 실패 테스트가 통과한다.

## Task 2: 별도 메타데이터 API와 정확한 공통 시간축

**Files:**
- Modify: `backend/server.js`
- Create: `backend/test/convective-satellite-api.test.js`
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`

**Interfaces:**
- Consumes: Task 1의 `convective_meta.json`, 기존 `sat_meta.json`, CTPS compact binary.
- Produces: `convectiveMeta`, `ciFrame`, `ctpsFrame`, 한 점 CTPS 조회 응답, CI/CTPS만 켠 경우의 기존 위성 시간축.

- [ ] Step 1: `server.js`가 `satellite/convective`의 GeoJSON·WebP에는 immutable cache, `convective_meta.json`에는 revalidate cache를 적용하게 한다. `GET /api/satellite/convective/ctps-point?tm=YYYYMMDDHHMM&lat=…&lon=…&minFl=…`는 형식·범위·선택 FL 검증 후 binary에서 FL·섭씨 온도·품질·관측시각을 반환한다. 도메인 밖·투명 픽셀·선택 FL보다 낮은 구름은 404로 반환한다.
- [ ] Step 2: snapshot-meta에 `convectiveMeta`를 추가한다. `tm`만 비교하는 기존 satellite 방식이 아니라 `convective_meta.json` 전체의 content hash를 반환해, 같은 시각에 CTPS 또는 CI가 나중에 추가되어도 프런트엔드가 갱신한다.
- [ ] Step 3: `weatherApi.js`에 초기 로드·증분 갱신용 `convectiveMeta`와 `fetchConvectiveCtpsPoint`를 추가한다. `snapshotMeta.js`는 `convectiveMeta.hash` 변화만 감지하며, 수신 실패의 `undefined`는 기존 polling merge 규칙에 따라 이전 정상 메타를 유지한다.
- [ ] Step 4: `buildWeatherOverlayModel`은 먼저 기존 `satelliteFrame`을 nearest-previous 규칙으로 고른 뒤, 선택 시각이 가장 최신 관측 위성 프레임보다 미래면 `ciFrame`·`ctpsFrame`을 모두 null로 둔다. 그 밖에는 위성 프레임의 `tm`과 완전히 같은 `convectiveMeta.frames[]`만 선택한다. 일치 항목 또는 해당 자산이 없으면 null이며 대체 과거 CI·CTPS를 고르지 않는다.
- [ ] Step 5: CI 또는 CTPS가 켜져 있으면 기존 `satelliteFrames`를 `buildTimelineTicks` 입력에 포함한다. 위성 영상 토글과 무관하게 동일 관측 시간축을 쓰고, 미래 시각은 기존 관측 최신 프레임으로 clamp한다.
- [ ] Step 6: API 테스트에는 cache header, 잘못된 query, 투명 CTPS pixel 404, 선택 FL보다 낮은 CTPS 404, 섭씨 point 응답, snapshot hash 변경을 추가한다. 모델 테스트에는 위성 OFF+CI/CTPS ON, 동일 tm 선택, 부분 자산·결측 프레임 숨김, 미래 clamp를 추가한다.
- [ ] Step 7: Verify — `node --test test/convective-satellite-api.test.js`를 `backend/`에서, `node --test src/features/weather-overlays/lib/weatherOverlayModel.test.js`를 `frontend/`에서 실행한다. 기대: API 계약과 기존 관측 시간축 회귀가 모두 통과한다.

## Task 3: feature-owned 지도 어댑터와 기존 고도 레일 공존

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/convectiveLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/useConvectiveOverlay.js`
- Create: `frontend/src/features/weather-overlays/lib/convectiveLayers.test.js`
- Create: `frontend/src/features/weather-overlays/ConvectiveOverlayControls.jsx`
- Create: `frontend/src/features/weather-overlays/ConvectiveOverlayCard.jsx`
- Modify: `frontend/src/features/weather-overlays/LevelRail.jsx`
- Modify: `frontend/src/features/weather-overlays/NwpSliderBar.jsx`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`
- Modify: `frontend/src/features/map/layerActions.js`
- Modify: `frontend/src/features/map/layerActions.test.js`

**Interfaces:**
- Consumes: Task 2의 `ciFrame`, `ctpsFrame`, `fetchConvectiveCtpsPoint`, `metVisibility.ci|ctps`, `styleRevision`.
- Produces: CI/CTPS Mapbox resource sync, hook-owned CTPS FL·선택 카드 상태, 쌓이는 공용 고도 레일 JSX.

- [ ] Step 1: `weatherOverlayLayers.js`의 `MET_LAYERS`에 `ci`·`ctps`를 기본 OFF로 추가한다. `WeatherOverlayPanel`의 기상 그룹에서 `위성` 다음에 `대류 가능성`·`구름 꼭대기` 타일과 아이콘·`aria-pressed`를 추가한다. `layerActions.js`에는 두 레이어의 한글 표시명·검색 별칭을 등록한다.
- [ ] Step 2: `convectiveLayers.js`는 CI source/fill layer와 CTPS image source/raster layer의 고유 ID, 설치·갱신·visibility 함수를 소유한다. CI는 중간 `#F6C945`, 강한 `#E8751A`, opacity 0.55으로 렌더하고 상시 label/icon은 만들지 않는다. CTPS는 선택된 FL WebP를 opacity 0.55로 렌더하며, 재설치 뒤에도 `moveLayer`로 CTPS 아래·CI 위 순서를 보장한다.
- [ ] Step 3: `useConvectiveOverlay.js`는 `mapRef`·`isStyleReady`·`styleRevision`을 받아 자체 `useEffect`에서 설치·동기화·cleanup한다. 지도 한 지점 click마다 현재 켜진 CI feature와 CTPS bounds를 함께 평가한다. CI 값과, 현재 선택 FL 이상일 때만 조회한 CTPS 값을 하나의 선택 상태에 합친다. 값 없는 레이어는 생략하고 둘 다 없으면 카드를 숨긴다. 시간 이동·layer OFF·새 지점 선택 시 현재 값으로 갱신하며, CTPS 404·늦은 응답은 CTPS 부분만 비운다. `MapView` 내부 지역 `useStyleSyncedEffect`를 import하거나 호출하지 않는다.
- [ ] Step 4: `LevelRail`에 `embedded` prop을 추가한다. `NwpSliderBar`도 이를 전달할 수 있게 하고, `MapView`는 NWP·난류·CTPS controls를 하나의 `vertical-level-rail-stack` 안에 조합한다. 기존 단일 레일은 같은 위치·모양을 유지하고, 여러 레일만 아래로 쌓인다. CSS는 우측 범례와 모바일 타임라인의 겹침을 방지한다.
- [ ] Step 5: `ConvectiveOverlayControls`는 CTPS가 켜졌을 때만 `전체`, `FL050`…`FL550`을 기존 `LevelRail` 모양으로 렌더한다. `ConvectiveOverlayCard`는 한 선택 지점에서 현재 켜진 레이어의 사용 가능한 값을 함께 보인다: CI는 상승기류 신호 단계·관측시각, CTPS는 FL·섭씨(°C) 온도·품질·관측시각이다. 카드의 관측시각은 `TimeZoneContext`의 KST/UTC 설정으로 포맷하고, 프레임 선택·point API에는 UTC instant/정규화 `tm`만 전달한다.
- [ ] Step 6: `WeatherLegends`에 CI 단계와 CTPS 높이 색상 구간을 추가한다. CI에는 `위성 기반 대류 발생 가능성 참고 — 레이더 실황·위험등급 아님`, CTPS에는 `CTH 기반 높이 — 위험등급 아님`을 명시한다. 색 외에도 텍스트 단계·구간을 함께 표시한다.
- [ ] Step 7: Mapbox mock 테스트로 source/layer ID 소유, 독립 visibility, CTPS 아래·CI 위 순서, FL 이미지 교체, style revision 복원, bounds 밖 클릭 무시, 한 click의 CI·CTPS 선택값 병합, 선택 FL 미만 CTPS 제외, CTPS 404·stale response가 CI 선택을 보존하는지를 검증한다. `layerActions.test.js`는 새 MET 레이어가 레지스트리에 없으면 실패해야 한다.
- [ ] Step 8: Verify — `node --test src/features/weather-overlays/lib/convectiveLayers.test.js src/features/weather-overlays/lib/weatherOverlayLayers.test.js src/features/map/layerActions.test.js`를 `frontend/`에서 실행한다. 기대: 기존 레이어 소유·토글 레지스트리와 새 어댑터 테스트가 통과한다.

## Task 4: 계약 검증, 구조 문서, 그래프 갱신

**Files:**
- Modify: `frontend/verification/contracts/map-base.spec.mjs`
- Modify: `Architecture.md`
- Modify: `docs/superpowers/status/satellite-convective-layers.status.md`

- [ ] Step 1: 기존 `map-base` 계약에 고정 `sat_meta.json`·`convective_meta.json`·CI GeoJSON·CTPS WebP·CTPS point API fixture를 추가한다. role/label 기반 locator로 데스크톱·iPad·모바일에서 독립 토글, 위성 OFF 시간 이동, CTPS FL 선택, 동시 표시 순서, 선택 카드, 결측 프레임 숨김, 두 번의 베이스맵 전환을 검증한다.
- [ ] Step 2: 브라우저 전 검증에는 현재 `map-base` 계약의 viewport·사전조건을 그대로 사용한다. 기존 responsive smoke·screenshot 자산은 새 계약이 통과해도 삭제하지 않는다.
- [ ] Step 3: `Architecture.md` File Roles에 독립 convective 수집·저장 모듈과 `convectiveLayers`·`useConvectiveOverlay`의 소유 경계를 기록한다.
- [ ] Step 4: Verify — `npm.cmd run dev:contract -- --grep map-base`, `npx depcruise .`, `npx knip`, `npm.cmd --prefix frontend run lint:colors`, `graphify update .`, `git diff --check`를 순서대로 실행한다. 기대: 세 viewport 계약, 의존성, 미사용 코드, 색 규칙, 그래프, 공백 검사가 모두 통과한다.
- [ ] Step 5: 모든 명령 결과와 실패·보류 항목을 상태 파일 한 페이지 안에 기록한다. 구현 완료와 end-to-end 완료는 `map-base` 통과 여부로 분리해 적는다.
