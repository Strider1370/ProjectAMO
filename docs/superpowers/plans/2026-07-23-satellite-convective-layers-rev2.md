# Plan: 위성 대류 가능성·구름 꼭대기 레이어 (rev2)

**Status:** Draft — completeness review 전, 구현 금지  
**Spec:** `docs/superpowers/specs/2026-07-23-satellite-convective-layers.md`  
**Supersedes:** `docs/superpowers/plans/2026-07-23-satellite-convective-layers.md`  
**Change reason:** 기존 계획은 좌표 재표본화, NetCDF 품질 판정, 바이너리·API schema, 비동기 stale-response 계약이 부족했고 이미 존재하는 CTPS 파서·좌표 계산을 중복 구현하도록 계획했다. 이 수정본은 사용자 동작과 범위를 바꾸지 않고 기술 결정을 고정한다.  
**Goal:** 기존 위성 프레임을 변경하지 않고 같은 GK2A 시각의 CI·CTPS 파생 자산을 독립 저장·표시한다.

## Global Constraints

- 승인된 spec을 변경하지 않는다. CI·CTPS는 기본 OFF, 서로 독립, 기존 위성 토글과 독립이며 브리핑 위험 판정에는 사용하지 않는다.
- 원시 NetCDF는 서버에만 둔다. 브라우저에는 CI GeoJSON, CTPS WebP, 공개 메타와 선택한 한 점의 정규화 값만 보낸다.
- 파생 자산은 `DATA_PATH/satellite/convective/`와 `convective_meta.json`이 소유한다. 기존 `sat_meta.json`과 `sat_korea_*.webp`는 읽기만 한다.
- 파생 수집 실패는 위성 수집을 실패시키지 않는다. 같은 시각의 CI·CTPS도 독립 성공·재시도하며 기존 성공 자산을 실패나 `null`로 덮지 않는다.
- 새 런타임 의존성은 추가하지 않는다. 설치된 `h5wasm`, `d3-contour`, `@turf/simplify`, `sharp`와 기존 투영·저장·요청 취소 패턴을 재사용한다.
- 사용자 승인과 독립 completeness review `PASS` 전에는 소스·테스트·설정을 변경하지 않는다.

## 결정·계약 원장

### 시각·수집

- `request_tm_utc`: GK2A API에 전달하는 UTC `YYYYMMDDHHmm`.
- `tm`: 기존 `sat_meta.json` 프레임과 일치시키는 KST `YYYYMMDDHHmm`.
- `observedAt`: `request_tm_utc`를 파싱한 ISO-8601 UTC 문자열. UI는 기존 시간대 formatter로 KST/UTC를 표시한다.
- CI URL은 `${config.satellite.fog_url}/CI/${config.satellite.region}/data?date=${request_tm_utc}&authKey=${config.api.auth_key}`다. CTPS URL은 기존 `config.flight_category.ctps_url`을 공유한다.
- 파생 수집은 `satellite-processor.js`의 메인 `process()`가 새 위성 메타를 발행한 직후 한 번 호출한다. FOG 재시도·과거 백필에서는 호출하지 않고 별도 cron·lock을 만들지 않는다.
- `convective_meta.json`은 `tm` 오름차순 최대 `config.satellite.convective_max_frames`개를 보존한다. 기본값은 기존 `satellite.max_frames`와 같은 18이다.

### NetCDF 파서

- `parseCiNC(buffer)` → `{ signal, dqf, attrs: { width, height, pixelSize, ulEasting, ulNorthing, signalFill, dqfFill } }`. 필수 dataset은 `CI1_prob`, `DQF_CI1`이다. DQF 0·1만 유효하며 fill·그 밖의 값은 제외한다. 유효 DQF 중 signal 3·4만 출력한다.
- `parseCtpsNC(buffer)` → `{ cth, ctt, flag, attrs: { width, height, pixelSize, ulEasting, ulNorthing, cthScale, cthOffset, cthFill, cttScale, cttOffset, cttFill, flagFill } }`. 필수 dataset은 `CTH`, `CTT`, `CTPS_flag`다. scale·offset·fill은 파일 속성을 읽고 추측하지 않는다.
- 정상 CTPS는 `CTPS_flag === 0`, CTH·CTT non-fill, 환산 CTH > 0이다. CTH는 `Math.round((raw * scale + offset) * 3280.839895)` ft, CTT는 `Math.round((raw * scale + offset - 273.15) * 10) / 10` °C다.
- 두 parser는 HDF5 magic, 필수 dataset, 배열 길이를 검사한다. h5wasm FS 임시 이름은 Node 표준 `crypto.randomUUID()`로 호출마다 고유하게 만들고, 성공·실패 모두 `finally`에서 close/unlink한다. 누락·손상은 dataset 이름을 포함한 `Error`로 거절하며 부분 배열을 반환하지 않는다.

### 공용 좌표·재표본화

- `backend/src/lib/ctps-grid.js`:

  ```text
  CTPS_GRID = { width:900, height:900, pixelSize:2000,
                ulEasting:-899000, ulNorthing:899000 }
  ctpsIndexForLatLon(lat, lon, grid = CTPS_GRID) -> number | null
  ```

  기존 `latLonToEN` 결과를 픽셀 중심에 nearest-neighbour(`Math.round`)로 맞추고 범위 밖은 `null`이다. `flight-category-processor.js`도 이 함수를 쓰고 `cthIndexToPixel` 이름으로 재-export한다.

- `backend/src/lib/satellite-ko-grid.js`:

  ```text
  KO_DISPLAY_GRID = { west:114, east:138, south:29.3, north:45.8,
                      width:1200, height:1049,
                      bounds:[[29.3,114],[45.8,138]] }
  displayPixelToSourceIndex(x, y, sourceGrid) -> number | null
  displayPointToLonLat(x, y) -> [lon, lat]
  ```

  출력 픽셀 중심을 Web Mercator lon/lat로 역변환한 뒤 `latLonToEN`으로 원본 LCC 좌표에 투영하고 nearest-neighbour로 읽는다. 기존 위성 렌더도 이 helper를 사용해 새 파생 렌더와 bounds·크기·표본 위치를 공유한다.

### CI GeoJSON

- 1200×1049 출력 격자에 signal 3·4 mask를 따로 만들고 `d3-contour.contours().size([1200,1049]).thresholds([0.5])`로 영역화한다. 모든 좌표를 `displayPointToLonLat`로 바꾸고 `@turf/simplify`의 tolerance `0.01`, `highQuality:false`, `mutate:false`로 단순화한다. 빈·유효하지 않은 ring은 버린다.
- Feature properties는 정확히 다음이다.

  ```text
  { signal:3, level:"medium", label:"중간 상승기류 신호", color:"#F6C945" }
  { signal:4, level:"strong", label:"강한 상승기류 신호", color:"#E8751A" }
  ```

- click 결과가 겹치면 숫자가 큰 `signal` 하나를 선택한다.

### CTPS 래스터·서버 전용 바이너리

- 정상 CTPS를 같은 1200×1049 격자에 nearest-neighbour로 재표본화한다. 색은 `<10,000ft #16A34A`, `10,000–19,999 #EAB308`, `20,000–29,999 #F97316`, `30,000–39,999 #DC2626`, `≥40,000 #7E22CE`다.
- 선택값은 `"all"`, 50, 100, …, 550. 숫자는 `heightFt >= minFl * 100`만 alpha 255, 나머지는 0이다. 프레임당 lossless WebP 12개가 모두 성공해야 CTPS 단위가 성공한다. 지도 opacity 0.55는 Mapbox에서 한 번만 적용한다.
- `ctps_<tm>.bin`은 원본 900×900 point 조회용이며 다음 형식을 쓴다.

  ```text
  Header 32 bytes
  0..7 ASCII "AMOCTPS1"; 8 UInt16LE width; 10 UInt16LE height
  12 Int32LE ulEasting; 16 Int32LE ulNorthing; 20 UInt16LE pixelSize
  22 UInt8 recordBytes=7; 23 UInt8 reserved=0
  24 UInt32LE recordCount=width*height; 28 UInt32LE reserved=0

  Record 7 bytes, row-major
  0 UInt32LE heightFt (invalid=4294967295)
  4 Int16LE temperatureCentiC (invalid=-32768)
  6 UInt8 quality (normal=0, invalid=255)
  ```

  reader는 header 상수, recordCount, 정확한 길이 `32 + width * height * 7`을 검증한다. 범위 밖·invalid·선택 FL 미만은 값 없음이다. UInt32를 써서 정상 CTH가 65,535ft를 넘더라도 sentinel과 충돌하거나 wrap되지 않게 한다.

### 공개 메타·원자 발행

- `convective_meta.json` schema:

  ```json
  {
    "type": "SATELLITE_CONVECTIVE",
    "version": 1,
    "render_version": "convective-v1",
    "updated_at": "2026-07-23T00:00:00.000Z",
    "tm": "202607230900",
    "latest": {
      "tm": "202607230900",
      "request_tm_utc": "202607230000",
      "bounds": [[29.3, 114], [45.8, 138]],
      "width": 1200,
      "height": 1049,
      "ci": { "path": "/data/satellite/convective/ci_202607230900.geojson" },
      "ctps": {
        "images": {
          "all": "/data/satellite/convective/ctps_202607230900_all.webp",
          "50": "/data/satellite/convective/ctps_202607230900_fl050.webp",
          "100": "/data/satellite/convective/ctps_202607230900_fl100.webp",
          "150": "/data/satellite/convective/ctps_202607230900_fl150.webp",
          "200": "/data/satellite/convective/ctps_202607230900_fl200.webp",
          "250": "/data/satellite/convective/ctps_202607230900_fl250.webp",
          "300": "/data/satellite/convective/ctps_202607230900_fl300.webp",
          "350": "/data/satellite/convective/ctps_202607230900_fl350.webp",
          "400": "/data/satellite/convective/ctps_202607230900_fl400.webp",
          "450": "/data/satellite/convective/ctps_202607230900_fl450.webp",
          "500": "/data/satellite/convective/ctps_202607230900_fl500.webp",
          "550": "/data/satellite/convective/ctps_202607230900_fl550.webp"
        },
        "minFlOptions": ["all",50,100,150,200,250,300,350,400,450,500,550]
      }
    },
    "frames": ["same frame shape, tm ascending"]
  }
  ```

- 아직 없는 `ci`/`ctps`는 `null`. `latest`는 `frames` 마지막 항목이고 top-level `tm`은 `latest.tm`; 프레임이 없으면 둘 다 `null`이다. 서버 전용 `.bin` 경로는 노출하지 않고 서버가 `tm`으로 계산한다.
- 기존 frame에서 `ci` 또는 `ctps`가 non-null이면 해당 단위의 download·render·rename을 전부 건너뛰고 null인 단위만 재시도한다. 따라서 immutable URL의 성공 파일은 같은 `tm` 재시도에서 byte와 mtime이 바뀌지 않는다.
- CI는 GeoJSON temp→rename 뒤 메타에 병합한다. CTPS는 binary+WebP 12개를 모두 temp로 만든 뒤 rename하고 나서만 병합한다. 마지막에 메타를 temp→rename한다.
- 정리는 메타 rename 성공 뒤, 새 메타가 참조하지 않는 `ci_*.geojson`, `ctps_*.webp`, `ctps_*.bin`만 한다. 다른 위성 파일은 대상 패턴에 들어오지 않는다.

### Point API

- `GET /api/satellite/convective/ctps-point?tm=<KST 12자리>&lat=<수>&lon=<수>&minFl=all|50|...|550`.
- `tm`은 `^\d{12}$`, lat은 유한한 -90..90, lon은 -180..180, minFl은 허용 목록만 받는다. `ctpsIndexForLatLon`으로 binary record를 찾는다.
- 200 응답은 `{ tm, observedAt, heightFt, fl, temperatureC, qualityCode:0, quality:"normal" }`; `fl = Math.round(heightFt / 100)`이다.
- 오류는 `400 {"error":"invalid_query"}`, 없는 프레임 `404 {"error":"frame_not_found"}`, 범위 밖·invalid·선택 FL 미만 `404 {"error":"point_unavailable"}`, binary 손상·읽기 실패 `503 {"error":"data_unavailable"}`다.
- `tm`별 point JSON과 GeoJSON·WebP는 immutable cache/ETag, meta는 no-cache/revalidate다. snapshot에는 `{ hash: canonicalHash(convectiveMeta), tm: convectiveMeta.tm }`를 추가해 같은 시각의 부분 갱신도 감지한다.

### 프런트 시간·지도·선택 상태

- `satellite || ci || ctps` 중 하나가 켜지면 기존 `satelliteFrames`를 timeline tick에 포함한다.
- 기존 관측 레이어에는 clamp한 `resolvedWeatherTimeMs`를 계속 쓴다. CI·CTPS는 원래 `selectedWeatherTimeMs`가 최신 위성보다 미래면 둘 다 `null`; 아니면 선택된 `satelliteFrame.tm`과 정확히 같은 convective frame만 쓰고 과거 대체값은 쓰지 않는다.
- Mapbox ID는 source/layer 각각 `gk2a-ctps-source`/`gk2a-ctps-raster`, `gk2a-ci-source`/`gk2a-ci-fill`. install/sync 뒤 항상 CTPS가 CI 아래다.
- `useConvectiveOverlay({ mapRef, isStyleReady, styleRevision, ciVisible, ctpsVisible, ciFrame, ctpsFrame, fetchCtpsPoint, timeZone })`는 `{ minFl, setMinFl, selection, clearSelection }`을 반환한다. `selection`은 `null` 또는 `{ lng, lat, ci:null|{signal,level,label,observedAt}, ctps:null|pointApiResponse }`다.
- 초기 minFl은 `"all"`이고 MapView mount 동안 OFF/ON 뒤에도 유지한다. 둘 다 OFF면 selection을 지운다. click 좌표를 보존하고 click·시각·minFl·활성 레이어 변경 시 같은 지점을 재평가한다.
- CI는 동기 조회 후 즉시 반영한다. CTPS 요청마다 이전 `AbortController`를 abort하고 `requestTokenRef`를 증가시킨다. token과 현재 `{tm,lat,lon,minFl}`이 모두 같은 응답만 병합한다. 404·network·abort는 CI를 보존하고 CTPS만 비우며 늦은 이전 응답은 현재 선택을 덮지 못한다.
- 선택 카드는 하나만 렌더하고 없는 부분은 생략한다. 시간은 `observedAt`을 기존 `TimeZoneContext` formatter로 표시한다.

### 고도 레일

- `LevelRail({ ..., embedded=false })`는 embedded일 때 `level-rail--embedded`를 붙인다. `NwpSliderBar({ ..., levelRailEmbedded=false })`가 이 값을 전달한다.
- MapView는 NWP·난류·CTPS 레일을 `.vertical-level-rail-stack`에 넣는다. stack은 `position:absolute; right:14px; top:76px; z-index:6; display:flex; flex-direction:column; gap:8px`, embedded rail은 `position:static`이다. 레일 하나일 때도 기존 위치·모양을 유지한다.

---

## Task 1: 공용 격자와 NetCDF 파서

**Files:**
- Create: `backend/src/lib/ctps-grid.js`, `backend/src/lib/ctps-grid.test.js`
- Create: `backend/src/lib/satellite-ko-grid.js`, `backend/src/lib/satellite-ko-grid.test.js`
- Modify: `backend/src/parsers/satellite-parser.js`
- Create: `backend/src/parsers/satellite-parser.test.js`
- Modify: `backend/src/processors/flight-category-processor.js`, `backend/src/processors/flight-category-processor.test.js`

**Interfaces:**
- Consumes: `latLonToEN(lat,lon)`, 기존 satellite Mercator 렌더, 기존 flight-category CTPS fetch.
- Produces: `CTPS_GRID`, `ctpsIndexForLatLon`, `KO_DISPLAY_GRID`, `displayPixelToSourceIndex`, `displayPointToLonLat`, `parseCiNC`, `parseCtpsNC`; 호환 export `cthIndexToPixel`.

- [ ] Step 1: 계약 원장의 두 grid module을 만들고 기존 satellite parser의 픽셀→Mercator→LCC 수식을 옮긴 뒤 기존 renderer도 helper를 사용하게 한다.
- [ ] Step 2: satellite parser의 h5wasm 초기화·임시 파일 lifecycle을 재사용해 두 parser를 export한다. 모든 parser 호출은 `crypto.randomUUID()` 기반 고유 WASM FS 이름을 쓴다. 속성 누락·배열 길이 불일치는 이름이 드러나는 오류로 거절한다.
- [ ] Step 3: flight-category의 사설 `parseCthBuffer`를 제거하고 `parseCtpsNC`와 `ctpsIndexForLatLon`을 사용한다. `cthIndexToPixel` alias는 유지한다.
- [ ] Step 4: 서울/격자 밖, 출력 네 모서리·중심, HDF5 magic·dataset 누락, CI DQF 0/1, CTPS scale/offset/fill/flag를 테스트한다. CI·CTPS·기존 satellite parser를 같은 tick에 병렬 호출해 WASM FS 이름이 겹치지 않고 모두 정리되는지도 확인한다.
- [ ] Step 5: Verify — backend에서 `node --test src/lib/ctps-grid.test.js src/lib/satellite-ko-grid.test.js src/parsers/satellite-parser.test.js src/processors/flight-category-processor.test.js`; 기대: 전부 통과.
- [ ] Step 6: Commit — `feat(satellite): share GK2A grid and CTPS parsing`

## Task 2: CI·CTPS 변환과 독립 원자 저장

**Files:**
- Modify: `backend/src/config.js`, `backend/src/processors/satellite-processor.js`
- Create: `backend/src/processors/convective-satellite-model.js`, `backend/src/processors/convective-satellite-model.test.js`
- Create: `backend/src/processors/convective-satellite-store.js`, `backend/src/processors/convective-satellite-store.test.js`
- Create: `backend/src/processors/convective-satellite-processor.js`, `backend/src/processors/convective-satellite-processor.test.js`

**Interfaces:**
- Consumes: Task 1 parser·grid, 정상 발행된 `{tm,request_tm_utc}`, 기존 `config.flight_category.ctps_url`.
- Produces: `collectConvectiveSatelliteFrame(frame)`, 계약 원장의 GeoJSON·WebP·binary·meta.

- [ ] Step 1: `config.satellite`에 `ci_product:"CI"`, `convective_enabled`, `convective_max_frames`만 추가한다. CTPS URL은 중복하지 않는다.
- [ ] Step 2: model에 `buildCiFeatureCollection(parsedCi)`, `normalizeCtps(parsedCtps)`, `renderCtpsRgba(normalized,minFl)`, `encodeCtpsBinary(normalized)`, `decodeCtpsRecord(buffer,index)`를 계약대로 구현한다.
- [ ] Step 3: store에 허용 filename, 디렉터리 내부 경로 검증, temp→rename, 기존 meta merge/sort/slice, 성공 후 orphan cleanup을 구현한다. CI 단위와 CTPS 13-file 단위를 분리한다.
- [ ] Step 4: processor는 기존 same-tm frame의 non-null 단위는 fetch 전부터 제외하고 null인 CI/CTPS만 `Promise.allSettled`로 실행한다. 성공 결과만 병합하며 기존 non-null 자산은 열거나 바꾸지 않는다. 둘 다 이미 성공했거나 이번에 실패하면 meta·cleanup 없이 log 후 정상 반환한다.
- [ ] Step 5: satellite main `process()`의 `writeMeta` 성공 후, 발행된 `meta.latest.tm`이 방금 frame과 같을 때만 파생 수집을 `await`한다. 기존 lock 안에서 오류를 log 후 삼킨다. retry/background-fill에는 호출하지 않는다.
- [ ] Step 6: model test는 CI 3/4·DQF·properties, CTPS flag/fill/CTH>0, ft/°C, 색 경계, all/FL050/FL550 alpha, UInt32 높이 65,535ft 초과 round-trip, binary header/record/손상을 확인한다.
- [ ] Step 7: store/processor test는 경로 이탈, 18개 보존, CI/CTPS 단독 성공, same-tm null 단위만 merge, 기존 성공 파일 byte·mtime 불변, CTPS 중간 실패, meta-before-cleanup, cleanup 패턴, `sat_meta.json` 불변, retry/backfill 미호출을 확인한다.
- [ ] Step 8: Verify — backend에서 `node --test src/processors/convective-satellite-model.test.js src/processors/convective-satellite-store.test.js src/processors/convective-satellite-processor.test.js`; 기대: 전부 통과.
- [ ] Step 9: Commit — `feat(satellite): publish independent convective assets`

## Task 3: 공개 메타·point API·증분 갱신

**Files:**
- Modify: `backend/server.js`
- Create: `backend/test/convective-satellite-api.test.js`
- Modify: `frontend/src/api/weatherApi.js`, `frontend/src/api/weatherApi.test.js`
- Modify: `frontend/src/app/snapshotMeta.js`, `frontend/src/app/snapshotMeta.test.js`

**Interfaces:**
- Consumes: Task 2 public meta/server-only binary, Task 1 `ctpsIndexForLatLon`.
- Produces: snapshot `convectiveMeta`, initial/changed `convectiveMeta`, `fetchConvectiveCtpsPoint({tm,lat,lon,minFl},{signal}={})`.

- [ ] Step 1: static cache 분기에 meta no-cache, GeoJSON/WebP immutable을 추가하고 binary의 static 제공을 차단한다.
- [ ] Step 2: point route에서 계약대로 query를 검증하고 meta의 exact `tm`·`request_tm_utc`, 계산된 binary path와 record를 사용해 고정 200/400/404/503 JSON을 반환한다.
- [ ] Step 3: `SNAPSHOT_SOURCES`에 `{hash:canonicalHash(meta),tm:meta.tm}`를 넣어 same-tm 부분 갱신을 감지한다.
- [ ] Step 4: weather API initial/changed load에 convective meta optional fetch를 추가한다. point fetch는 기존 `fetchJson`의 `signal` 전달을 재사용한다.
- [ ] Step 5: backend test는 binary 비공개, cache, 정상 point, validation, frame/point 404, 손상 503, minFl, same-tm hash 변경을 확인한다. frontend test는 initial/changed, optional preserve, AbortSignal, snapshot diff를 확인한다.
- [ ] Step 6: Verify — backend에서 `node --test test/convective-satellite-api.test.js`, frontend에서 `node --test src/api/weatherApi.test.js src/app/snapshotMeta.test.js`; 기대: 전부 통과.
- [ ] Step 7: Commit — `feat(api): expose convective metadata and CTPS points`

## Task 4: 정확한 위성 시각과 Mapbox 어댑터

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
- Create: `frontend/src/features/weather-overlays/lib/convectiveLayers.js`, `frontend/src/features/weather-overlays/lib/convectiveLayers.test.js`
- Create: `frontend/src/features/weather-overlays/lib/convectiveSelectionModel.js`, `frontend/src/features/weather-overlays/lib/convectiveSelectionModel.test.js`
- Create: `frontend/src/features/weather-overlays/lib/useConvectiveOverlay.js`

**Interfaces:**
- Consumes: satellite frames, convective meta, raw `selectedWeatherTimeMs`, Task 3 point fetch.
- Produces: `ciFrame`, `ctpsFrame`, `installConvectiveLayers`, `syncConvectiveLayers`, `queryCiAtPoint`, `makeConvectiveRequestKey`, `canApplyConvectiveResponse`, 계약된 hook 결과.

- [ ] Step 1: model에 timeline 포함, raw 미래 숨김, exact `tm`, 부분 자산 null 규칙을 구현한다.
- [ ] Step 2: `installConvectiveLayers(map)`, `syncConvectiveLayers(map,{ciFrame,ctpsFrame,minFl,ciVisible,ctpsVisible})`, `queryCiAtPoint(map,point)`를 만들고 ID·색·opacity·순서를 한 파일이 소유한다.
- [ ] Step 3: `convectiveSelectionModel.js`의 순수 함수 `makeConvectiveRequestKey({tm,lat,lon,minFl})`와 `canApplyConvectiveResponse({requestToken,currentToken,requestKey,currentKey,aborted})`가 동일 token·key·non-aborted일 때만 true를 반환하게 한다. hook은 이 함수와 기존 `AbortController + requestTokenRef` 패턴을 사용한다. MapView 지역 hook은 import하지 않고 자기 click handler와 fetch만 cleanup한다.
- [ ] Step 4: model test는 위성 OFF+각 파생 ON, exact tm, 결측·부분 frame, 과거 대체 금지, raw 미래 null을 확인한다.
- [ ] Step 5: layer/selection model test는 독립 visibility, CTPS 아래/CI 위, FL image 교체, style 복원, signal 4 우선, bounds 밖과 token/key/abort 조합을 확인한다. A보다 B가 먼저 끝나는 실제 hook 경합과 404/network에서 CI 보존은 Task 6 Playwright 계약이 확인한다.
- [ ] Step 6: Verify — frontend에서 `node --test src/features/weather-overlays/lib/weatherOverlayModel.test.js src/features/weather-overlays/lib/convectiveLayers.test.js src/features/weather-overlays/lib/convectiveSelectionModel.test.js`; 기대: DOM harness 없이 실행되는 순수 Node 테스트가 전부 통과.
- [ ] Step 7: Commit — `feat(map): add convective layer adapter`

## Task 5: 토글·고도 레일·한 개의 상세 카드

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`
- Modify: `frontend/src/features/map/layerActions.js`, `frontend/src/features/map/layerActions.test.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`, `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/weather-overlays/LevelRail.jsx`
- Modify: `frontend/src/features/weather-overlays/NwpSliderBar.jsx`, `frontend/src/features/weather-overlays/NwpSliderBar.test.js`
- Create: `frontend/src/features/weather-overlays/ConvectiveOverlayControls.jsx`
- Create: `frontend/src/features/weather-overlays/ConvectiveOverlayCard.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`, `frontend/src/features/map/MapView.css`

**Interfaces:**
- Consumes: Task 4 model/hook, `metVisibility.ci|ctps`, `TimeZoneContext`.
- Produces: 기본 OFF 토글, all/FL050…FL550 레일, 한 개의 접근 가능한 선택 카드, vertical rail stack.

- [ ] Step 1: `MET_LAYERS`의 satellite 바로 뒤에 `{id:"ci",label:"대류 가능성"}`, `{id:"ctps",label:"구름 꼭대기"}`를 기본 OFF로 추가하고 action 이름·검색 별칭을 등록한다. `hazardLayers`에는 추가하지 않는다.
- [ ] Step 2: 패널에 독립 button과 `aria-pressed`를 추가한다. 기존 단일 layer action만 dispatch해 satellite state를 바꾸지 않는다.
- [ ] Step 3: LevelRail/NwpSliderBar에 embedded 전달만 추가하고 CTPS가 켜졌을 때 12개 선택값을 기존 LevelRail로 렌더한다.
- [ ] Step 4: MapView가 frame과 hook을 연결하고 NWP·난류·CTPS control을 stack에 조합한다. 카드는 selection의 CI/CTPS 중 값 있는 부분만 한 개에 렌더하며 용도를 설명하는 `aria-label`을 둔다.
- [ ] Step 5: legend에 CI 두 단계와 CTPS 다섯 구간을 텍스트+색으로 표시한다. 문구는 `위성 기반 대류 발생 가능성 참고 — 레이더 실황·위험등급 아님`, `CTH 기반 높이 — 위험등급 아님`으로 고정한다.
- [ ] Step 6: unit test는 새 MET layer action 등록, 기본 OFF, embedded class/전달, minFl 표시값을 확인한다.
- [ ] Step 7: Verify — frontend에서 `node --test src/features/weather-overlays/lib/weatherOverlayLayers.test.js src/features/map/layerActions.test.js src/features/weather-overlays/NwpSliderBar.test.js`; 기대: 전부 통과.
- [ ] Step 8: Commit — `feat(ui): add convective controls and details`

## Task 6: 브라우저 계약·구조 검증·문서

**Files:**
- Modify: `frontend/verification/contracts/map-base.spec.mjs`
- Modify: `Architecture.md`
- Modify: `docs/superpowers/status/satellite-convective-layers.status.md`

**Interfaces:**
- Consumes: Tasks 1~5 전체.
- Produces: 세 viewport 사용자 동작 증거, 구조·미사용 코드 증거, 새 파일 소유권 문서.

- [ ] Step 1: map-base에 고정 sat meta, convective meta, CI GeoJSON, CTPS point fixture를 추가한다. CTPS image는 기존 작은 image fixture를 올바른 content type으로 응답해 네트워크/source 교체를 검증한다.
- [ ] Step 2: desktop·iPad·mobile에서 기본 OFF, 독립 토글, satellite OFF timeline, exact-frame 결측 숨김, FL 변경, combined card, KST/UTC, 두 번의 basemap 전환을 role/label locator로 확인한다.
- [ ] Step 3: `window.__map.getStyle().layers`로 CTPS가 CI 아래인지 확인한다. point A를 지연하고 B를 먼저 보내 카드가 B를 유지하는 경합을 확인한다. CI가 있는 같은 지점에서 CTPS route를 한 번은 404, 한 번은 요청 abort가 발생하도록 응답해 두 경우 모두 단일 카드의 CI 부분은 유지되고 CTPS 부분만 생략되는지 assertion한다.
- [ ] Step 4: `Architecture.md` File Roles에 grid, parser/model/store/processor, API, `convectiveLayers`, `useConvectiveOverlay`의 소유 경계를 기록한다.
- [ ] Step 5: Verify — 저장소 루트에서 `npm.cmd run dev:contract -- --grep map-base`, `npx depcruise .`, `npx madge --circular .`, `npx knip`, `npm.cmd --prefix frontend run lint:colors`, `graphify update .`, `git diff --check`. 기대: 세 viewport, 의존성, 순환, unused, 색, graph, whitespace 검사가 통과한다.
- [ ] Step 6: 상태에 실제 결과와 실패·보류를 기록한다. map-base 실패 시 완료로 표시하지 않는다.
- [ ] Step 7: Commit — `docs: verify convective satellite layers`

## 요구사항 추적

| Spec | Task | 판별 가능한 검증 |
|---|---:|---|
| FR-001~002 | 5 | 기본 OFF·독립 action/unit/browser |
| FR-003~003a | 3,4,6 | exact tm·raw 미래 null·satellite OFF timeline |
| FR-004~005a | 1,2,4 | DQF/signal/properties·색/opacity·상시 label 없음 |
| FR-006~009 | 1~5 | flag/fill/CTH·색 경계·12 FL images·point filter |
| FR-010 | 4,6 | Mapbox 순서 unit/browser |
| FR-011~011b | 3~6 | combined card·minFl·stale response·KST/UTC |
| FR-012 | 5,6 | 텍스트+색 legend·경고 문구 |
| FR-013 | 2,3 | 부분 실패·원자 발행·last-good 보존 |
| FR-014 | 5 | `hazardLayers` 비연결·registry 회귀 |

## 구현 시작 전 completeness review

리뷰어는 계획의 자체 체크리스트가 아니라 현재 `docs/policies/spec-plan-status-format.md`, 승인 spec, 실제 저장소를 독립적으로 읽는다. 다음을 포함해 확인한다.

- 기존 flight-category CTPS와 satellite renderer를 실제로 재사용하는가.
- dataset·품질·단위, 좌표 재표본화, binary byte layout, meta/API 오류가 구현자의 선택으로 남지 않았는가.
- 원자 발행·부분 실패·retention이 기존 `sat_meta.json`을 건드리지 않는가.
- raw 미래 시각, exact frame, layer order, combined selection, FL 변경, stale response 상태 전이가 고정되었는가.
- 모든 spec 요구가 자동 검증 하나 이상에 매핑되고 명령이 실제 테스트 파일을 실행하는가.

결과는 `PASS`, `PLAN GAP`, `DECISION GAP` 중 하나로 상태 파일에 기록한다. `PASS`여도 사용자 승인 전에는 구현을 시작하지 않는다.
