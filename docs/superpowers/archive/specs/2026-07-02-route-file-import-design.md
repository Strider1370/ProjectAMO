# 경로 파일 불러오기 (GPX·KML·GeoJSON) — 설계 스펙

> 상태: 설계 승인됨(2026-07-02, 브레인스토밍 4결정 + 접근①·설계 2섹션 승인).
> 다음: 사용자 스펙 검토 → writing-plans.
> 성격: **프런트 전용.** 외부 경로 파일을 우리 VFR 경유점으로 변환해 기존 브리핑 파이프라인에 주입.
> 선행: VFR 경유점 빌더(`vfrWaypoints`), leg 지형·반원고도(`vfrLegs`, `nearestVfrCruiseAltitude`), `getCurrentRouteLineString`, 브리핑·연직단면 파이프라인을 **재사용·확장**한다.

## 0. 목적 / 배경

Windy 대비 갭 분석에서 확인된 미보유 기능. 다른 도구(ForeFlight·SkyDemon·SkyVector·Flight Plan Database)의 비행계획이나 GPS 트랙을 불러와, **그 경로를 따라 우리 브리핑(위험·경로 위험·leg 지형·연직단면·목적지)을 그대로 돌린다.** 새 데이터·엔드포인트 없이 프런트 어댑터만 추가한다.

## 1. 결정 (승인됨)

- **용도 = 비행계획 + GPS 트랙 둘 다.** 공항 유무·점 개수 편차를 모두 흡수한다.
- **공항 = 자동 스냅 + 폴백.** 끝점이 **기상관측 공항(`airports` prop)** 임계거리(**5NM**) 안이면 그 공항으로 설정(`fixed:true`, 공항 표고 → 배너·현재·목적지 섹션 작동). 아니면 일반 지점(`fixed:false`)으로 두고 공항 의존 섹션은 자연히 "해당 없음". 스냅 대상을 기상관측 공항으로 한정하는 이유: 스냅된 끝점은 METAR/TAF·표고가 실제로 있어 브리핑이 의미 있게 채워진다(navdata 전체 공항이면 기상 없는 공항에 붙어 빈 섹션이 됨).
- **점 솎기 = RDP 자동, 고정 목표 N=20.** `simplify-js`(Ramer–Douglas–Peucker)로 tolerance를 조절해 **≤ 20개**로 축소, 첫·끝 점 보존. 사용자 조정 UI 없음.
- **다중 경로 = 사용자 선택.** 파일에 경로가 1개면 바로 불러오고, **여러 개면 선택 목록**을 띄운다(항목별 **이름·종류(계획 rte/궤적 trk)·점 개수** 표시). 자동 우선순위 휴리스틱은 두지 않는다. 고른 경로에만 솎기·스냅 적용.
- **형식 = GeoJSON + GPX + KML.** GeoJSON은 파싱 불필요. GPX·KML은 `@tmcw/togeojson` 하나로 둘 다 처리(브라우저 내장 `DOMParser` 사용).
- **접근 = ① 얇은 임포터 → 기존 VFR 파이프라인 재사용.** 임포터는 수동 빌더와 **동일한 결과물**(`routeResult` + `vfrWaypoints`)을 뱉는 어댑터.
- **[필수] 통합은 `loadSavedRoute` 패턴을 따른다.** VFR 자동 경로생성 effect(`lastVfrKeyRef` 감시)가 dep/arr 세팅 순간 발동해 **불러온 경유점을 직선으로 덮어쓰는 것**을 막아야 한다. `loadSavedRoute`처럼 **`lastVfrKeyRef`를 미리 선점** + **`routeForm`에 스냅된 공항을 세팅**(브리핑이 공항을 `routeForm`에서 읽으므로)한다. 공항 폴백 시 dep/arr 빈 문자열이면 effect가 조기 반환하여 클로버 없음 — 백엔드 `composeBriefing`은 빈 공항을 무시(배너 필터)하여 안전(코드 확인됨).
- **불러오면 VFR 모드로 전환.** 임포트 경로는 점 기반이라 IFR 절차와 무관.
- **파일 고도값 무시.** 경유점 고도는 순항고도 기본값, 반원고도 힌트로 조정(기존 UX).

## 2. 컴포넌트 / 파일

- **신규** `frontend/src/features/route-briefing/lib/routeImport.js` — 순수 함수:
  - `parseRouteFile(name, text)` → GeoJSON FeatureCollection. `.geojson`/`.json`은 `JSON.parse`, `.gpx`/`.kml`은 `DOMParser` + `@tmcw/togeojson`(`gpx()`/`kml()`).
  - `extractRoutePaths(geojson)` → **후보 경로 배열** `[{ label, kind:'route'|'track'|'points', coords:[[lon,lat]…] }]`. LineString/MultiLineString·GPX rte/trk·KML LineString·Point 시퀀스를 각각 후보로. 종류(route/track)는 togeojson 피처 속성/지오메트리로 판별(불가하면 'points').
  - `simplifyRoute(coords, maxPts = 20)` → RDP. tolerance를 이분 증가시켜 결과 길이 ≤ maxPts, 첫·끝 보존.
  - `snapEndpointsToAirports(coords, airports, thresholdNm = 5)` → `{ departureAirport|null, arrivalAirport|null }`. 거리 = 기존 haversine 재사용.
  - `parseRouteFile` + `extractRoutePaths`까지가 "후보 산출"(순수), 이후 사용자가 고른 1개 경로에 `simplifyRoute`·`snapEndpointsToAirports` 적용.
- **신규** `buildVfrRouteFromWaypoints(coords, { departureAirport, arrivalAirport, airports })` — `routeBriefingModel.js`(또는 `routePlanner.js`)에 추가. `buildVfrRoute`가 공항을 필수로 요구하므로, 불러온 좌표로 **직접** VFR `routeResult`를 구성(수동 빌더와 동일 shape: `flightRule:'VFR'`, `departureAirport`, `arrivalAirport`, `distanceNm`, `previewGeojson`{line+points}). 끝점 스냅 여부로 `vfrWaypoints`의 `fixed`/`airportElevationFt` 결정, 중간점은 `relabeledWaypoints`로 라벨링.
- **신규** `RouteImportChooser.jsx`(또는 패널 내 인라인 목록) — **다중 경로일 때만** 후보 리스트(이름·종류·점 개수)를 보여주고 선택받음. 단일이면 안 뜸.
- **수정** `useRouteBriefing.js` — 액션 `importRouteFromFile(file)`: 파일 텍스트 읽기 → `parseRouteFile`+`extractRoutePaths` → 후보 1개면 바로, 여러 개면 사용자 선택 대기 → 선택 경로에 `simplifyRoute`·`snapEndpointsToAirports` → `buildVfrRouteFromWaypoints`. 적용은 **`loadSavedRoute` 패턴**: `lastVfrKeyRef` 선점 → `clearRouteDisplay` → `switchFlightRule('VFR')`(또는 폼 세팅) → `setRouteForm`(스냅 공항) → `setRouteResult` → `setVfrWaypoints` → fitBounds → 경고 표출. 실패 시 에러 상태.
- **수정** `RouteBriefingPanel.jsx` — VFR 빌더에 "경로 불러오기" 버튼 + 숨은 `<input type="file" accept=".geojson,.json,.gpx,.kml">`. 다중 경로 선택 UI·경고·에러 표시.
- **수정** `frontend/package.json` — `@tmcw/togeojson`, `simplify-js` 추가. (turf 불필요.)

## 3. 데이터 / 파생

- 임포트 결과 좌표는 `getCurrentRouteLineString`(VFR: `vfrWaypoints`→LineString)로 자동 지오메트리화 → leg 지형(`/vertical-profile`)·브리핑·연직단면이 그대로 소비.
- 한국 FIR 판정 = 지도 `maxBounds`(lon 116–139, lat 26–44) 내 여부. 밖이면 warning 추가(차단 아님).
- `vfrWaypoints` shape 유지: `{ id, uid, lon, lat, fixed, airportElevationFt?, altitudeFt }`.

## 4. 에러 / 엣지 (검증 대상)

- 파싱 실패 → "파일을 읽을 수 없습니다 (GeoJSON/GPX/KML 확인)".
- 좌표 < 2 → "경로 점이 부족합니다".
- FIR 밖 → 불러오되 경고.
- 경로 다수 → 사용자 선택 UI(§2 `RouteImportChooser`). 1개면 자동, 질문 없음.
- 과대 파일/점 → 솎기 전 상한(예: 원시 점 > 100k 또는 용량 > 5MB면 경고·거부).
- 끝점 둘 다 같은 공항(짧은 왕복) → 허용.
- 고도값 존재 → 무시.

## 5. 테스트

- 순수 단위테스트(`node --test`) — `routeImport`:
  - 3형식 파싱(샘플 파일 내용 픽스처): GeoJSON/GPX/KML 각각 후보 경로 추출 동일 결과.
  - 다중 경로 파일 → 후보 2개 이상(종류·점 개수 라벨) 반환.
  - `simplifyRoute`: 조밀 입력 → ≤ 20, 첫·끝 보존.
  - `snapEndpointsToAirports`: 임계 안/밖 케이스.
- `buildVfrRouteFromWaypoints`: 출력 shape가 수동 VFR 빌더와 일치(flightRule·waypoints·previewGeojson line+points).
- 브라우저 검증(Playwright, §8): 샘플 파일 불러오기 → 경유점·leg 정보 표시 → 브리핑 생성 작동. 샘플: `RKSS-RKPK`(scratchpad/route-samples, 필요 시 리포 픽스처로 이동).

## 6. Out of scope

- 드래그드롭 지도 투척(추후). 점 개수 사용자 슬라이더(추후). 파일 고도 반영. IFR 절차 임포트. 경로 **내보내기**(export). 다중 경로 동시 로드. turf 도입.

## 7. 열린 항목 (구현 중 확정)

- `buildVfrRouteFromWaypoints`를 `routePlanner.js`에 둘지 `routeBriefingModel.js`에 둘지(기존 VFR 로직 위치에 맞춰).
- GPX rte/trk 종류 판별 방법(togeojson 피처 속성 vs 지오메트리 타입) — 판별 불가 시 'points'로 폴백.
- `buildVfrRouteFromWaypoints(null,...)` 공항 폴백 시 `buildDestination(null,…)`이 안전한지 구현 중 재확인(빈 TAF 처리).
- 샘플 파일을 리포 테스트 픽스처로 승격할지.

## 8. Grilling 결정 로그 (2026-07-02)

- 스냅 대상 = 기상관측 공항(`airports` prop). navdata 전체 아님.
- 공항 폴백 브리핑 안전성 = 코드 확인(빈 공항 → 배너 필터, 무크래시).
- 솎기 목표 = 20, 스냅 임계 = 5NM.
- 다중 경로 = 자동 휴리스틱 폐기, 사용자 선택 UI.
- 통합 = `loadSavedRoute` 패턴 필수(자동 VFR 생성 클로버 방지 + 폼 공항 세팅).
