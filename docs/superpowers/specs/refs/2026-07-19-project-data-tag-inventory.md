# ProjectAMO 데이터 태그 전수조사

**조사일:** 2026-07-19
**성격:** 구현 전 현황 조사. 아래 태그는 현재 코드에 이미 들어 있는 값이 아니라 권장 후보다.

## 1. 결론

ProjectAMO에는 이미 `metar`, `taf`, `sigmet`, `kim_nwp` 같은 사실상의 데이터 이름이 있다. 문제는 이름이 한곳에 있지 않다는 점이다. 어떤 이름은 JSON의 `type`, 어떤 이름은 저장 폴더, API 주소, 프런트 상태 키 또는 DB 테이블에만 있다. 규격도 JSON Schema가 아니라 parser, processor, SQL, view-model 코드가 각각 사실상의 명세 역할을 한다.

다만 카탈로그 설계보다 먼저 고쳐야 할 사용자 데이터·알림 신뢰성 문제가 세 가지 있다. 이를 해결하지 않은 채 태그만 붙이면, 자료의 이름은 정리돼도 기존 비행계획이 깨지거나 필요한 알림이 누락되는 위험은 그대로 남는다.

그 뒤 필요한 최소 토대는 새 메시지 시스템이나 이벤트 브로커가 아니라 다음 두 가지다.

1. **데이터 카탈로그:** 태그마다 뜻, 규격, 원본, 시간·공간·단위, 보존 방식과 담당 코드를 기록하는 사전.
2. **최소 데이터 명찰:** 실제 데이터에 `tag`, `schema_version`, `instance`, `time`, `space`, `source_refs`를 연결하는 공통 머리말.

현재 `/api/snapshot-meta`가 “어떤 자료가 바뀌었는지” 알리는 공통 게시판의 씨앗이다. 다만 지금은 hash나 시각만 모은 변경 색인이고, 규격·원본·시간·공간 정보까지 설명하는 카탈로그는 아니다 (`backend/server.js:300-430,826-829`, `frontend/src/app/useWeatherPolling.js:33-70`).

## 2. 먼저 고쳐야 할 세 가지

### 2.1 `routes.payload`의 명시적 버전과 변환

사용자 비행계획의 중요한 내용은 SQLite `routes.payload TEXT`에 JSON 덩어리로 저장된다. 출발·도착·ETD 같은 일부 열은 따로 있지만, 대안 경로·절차 선택·고도·편집 상태는 이 payload에 의존한다 (`backend/src/db/schema.sql:31-53`).

프런트에는 일부 과거 모양을 현재 route plan으로 보정하는 코드가 있지만, DB에 `payload_version`이 없고 서버 차원의 migration ledger도 없다 (`frontend/src/features/route-briefing/lib/routeStore.js`, `backend/src/db/index.js:8-47`). 따라서 payload 모양을 바꾸면 기존 사용자의 저장 경로가 “오래된 정상 자료”인지 “손상된 자료”인지 확실히 구분할 수 없다.

우선 조치는 새 저장값에 `payload_version`을 넣고, 읽을 때마다 명시적인 `구버전 → 현재 버전` 변환을 거치게 하는 것이다. 변환 실패 시에는 조용히 버리지 않고 복구 가능한 안내를 남겨야 한다.

### 2.2 알림 상태와 중복 제거의 수명 분리

알림 scheduler는 직전 브리핑의 최소 상태를 프로세스 메모리에만 들고 있고, DB에는 `last_briefing_snapshot_id` hash만 남긴다. 재시작하면 실제 비교 기준은 사라진다 (`backend/src/alerts/scheduler.js:77-109,150-152`). 반면 이미 보낸 알림은 `route_id + dedup_key`로 DB 전체 기간에 걸쳐 중복 제거된다 (`backend/src/alerts/scheduler.js:117-152`).

예를 들어 09:00에 낮은 운고 알림이 발생하고, 09:15에 회복한 뒤, 09:30에 다시 낮아졌다고 하자. 현재 구조에서는 09:30 변화가 새 위험 상태여도 09:00의 dedup 기록 때문에 막힐 수 있다. 서버 재시작까지 겹치면 첫 계산은 비교가 아닌 새 baseline 설정이 되어 필요한 알림을 더 놓칠 수 있다.

우선 조치는 작은 alert state를 DB에 보존하고, 위험이 회복되면 해당 상태를 닫는 것이다. 중복 제거는 “한 번이라도 보냈는가”가 아니라 “같은 위험 상태가 아직 진행 중인가”에만 적용해야 한다.

### 2.3 `ground_overview`의 제거 또는 실제 생산 연결

`ground_overview`는 store type, `/api/ground-overview`, snapshot-meta, 프런트 deferred fetch에는 존재하지만, 조사 범위에서 이를 생성하는 `store.save('ground_overview', ...)` producer를 찾지 못했다 (`backend/src/store.js:10-31`, `backend/server.js:394,762`, `frontend/src/api/weatherApi.js:201-203`). 런타임 폴더도 비어 있었다.

즉 소비자는 존재하는데 공급자가 없는 죽은 배관이다. 실제 제품 계획이 없다면 API·type·프런트 요청을 제거하고, 필요하다면 원본·processor·규격·소비자를 한 작업으로 연결해야 한다. 중간 상태로 남겨 두면 이후 기능이 빈 데이터를 정상 데이터로 오해할 수 있다.

이 세 가지는 카탈로그만으로 해결되지 않는 별도 우선 과제다.

## 3. 조사 기준

전역 태그 후보에는 다음만 포함했다.

- 외부에서 들어와 정규화되거나 저장되는 자료
- DB·파일·브라우저 저장소에 계속 남는 업무 자료
- API 또는 모듈 경계를 넘는 재사용 산출물
- 브리핑·알림처럼 다른 자료를 조합한 결과
- 여러 화면이나 후속 기능이 같은 의미로 식별해야 하는 자료

다음은 전역 카탈로그 대상에서 제외했다.

- 함수 내부 임시값과 단순 React 열림/선택 상태
- CSS와 Mapbox source/layer ID 같은 표시 구현 이름
- 성공 여부만 반환하는 API 응답
- 한 화면에서만 쓰는 표시용 모델. 이런 값은 로컬 규격과 `source_refs`만 있으면 된다.

같은 구조가 공항, 예보시간, 고도별로 반복되면 개별 파일이 아니라 하나의 데이터 family로 셌다.

## 4. 권장 용어와 태그 규칙

| 용어 | 뜻 |
|---|---|
| 데이터 family | 같은 뜻과 규격으로 반복 생성되는 자료 묶음 |
| 태그 | family를 찾는 안정적인 이름 |
| 규격 | 필드, 형식, 단위, 필수 여부를 설명하는 버전된 계약 |
| 인스턴스 | 특정 시각에 실제 생성된 한 스냅샷·레코드·산출물 |
| 원본 참조 | 제공자 응답, 원문 파일 또는 상위 데이터로 돌아가는 연결 |
| 파생 참조 | 계산 결과가 사용한 상위 인스턴스들의 ID/hash 목록 |

권장 태그 형식은 `<분야>.<자료>`다.

```text
weather.metar
model.kim
aviation.notam
briefing.route
alert.change
flight.route
```

- 제공자와 국내/해외 범위는 태그에 넣지 않는다. `source.provider`, `source.scope` 같은 데이터 필드로 둔다. 예를 들어 KMA 국내 METAR와 NOAA 해외 METAR는 모두 `weather.metar`이고, 출처가 다르다.
- `normalized`, `derived`, `record`, `event`, `reference`, `raw` 같은 처리 형태도 태그에 넣지 않는다. 필요한 경우 `representation` 필드로 밝히고, 실제 규격 차이는 `schema_version`으로 구분한다.
- `v1`은 태그에 붙이지 않고 `schema_version: 1`로 분리한다.
- `store`, `api`, `db` 같은 구현 위치도 태그에 넣지 않는다.
- raw 데이터가 실제로 보존되지 않는다면 가짜 raw 태그를 만들지 않고 카탈로그에 `raw_retention: none`이라고 명시한다.

## 5. 카탈로그와 실제 데이터의 최소 규격

카탈로그 항목은 변하지 않는 설명을 가진다.

```yaml
tag: weather.metar
status: active
description: 국내 공항 METAR/SPECI 정규화 자료
schema:
  version: 1
  reference: backend/src/parsers/metar-parser.js
source:
  provider: KMA
  scope: domestic
  product: AmmIwxxmService/getMetar
  format: IWXXM/XML
  raw_retention: none
time_fields: [observed_at, issued_at, fetched_at]
space_kind: airport
units_profile: aviation-weather-v1
```

실제 인스턴스는 카탈로그를 반복 복사하지 않고 연결 정보만 가진다.

```json
{
  "tag": "weather.metar",
  "schema_version": 1,
  "representation": "normalized",
  "instance": {
    "id": "content-hash-or-stable-id",
    "generated_at": "2026-07-19T09:00:00Z"
  },
  "time": {
    "observed_at": "2026-07-19T08:00:00Z",
    "valid_from": null,
    "valid_to": null
  },
  "space": {
    "kind": "airport",
    "crs": "EPSG:4326",
    "ref": "RKSI"
  },
  "source_refs": [
    {
      "source": "kma.metar",
      "raw_ref": null,
      "response_hash": "sha256:..."
    }
  ],
  "data": {}
}
```

여기서 `schema.reference`와 `source.raw_ref`는 서로 다르다. 전자는 **데이터를 읽는 방법**, 후자는 **사실이 어디에서 왔는지**를 설명한다.

## 6. 외부 수집·운영 데이터 family

| 권장 태그 | 상태 | 원본과 보존 | 현재 규격의 근거 | 주요 소비자·주의점 |
|---|---|---|---|---|
| `weather.metar` | 운영 | KMA 국내 IWXXM/XML은 원 XML 미보존, NOAA 해외 JSON은 TAC `rawOb` 보존 | `backend/src/parsers/metar-parser.js:185-298`, `backend/src/parsers/noaa-metar-parser.js:88-168` | `source.scope`이 domestic/overseas를 구분. 지도·브리핑·알림; 국내 `raw_text`는 재구성 TAC |
| `weather.taf` | 운영 | KMA 국내 IWXXM/XML은 원 XML 미보존, NOAA 해외 JSON은 `rawTAF` 보존 | `backend/src/parsers/taf-parser.js:312-403`, `backend/src/parsers/noaa-taf-parser.js:132-240` | `source.scope`이 domestic/overseas를 구분. 브리핑·알림; 국내 TAC는 재구성문 |
| `hazard.sigmet` | 운영 | KMA 국내 IWXXM/XML 또는 NOAA 해외 JSON | `backend/src/parsers/iwxxm-advisory-parser.js:306-372`, `backend/src/parsers/noaa-sigmet-parser.js:126-188` | `source.scope`이 domestic/overseas를 구분. 지도·브리핑·알림 |
| `hazard.airmet` | 운영 | KMA IWXXM/XML 미보존 | `backend/src/parsers/iwxxm-advisory-parser.js:306-372` | 지도·브리핑·알림 |
| `hazard.airport_warning` | 운영 | KMA XML 미보존, `raw_message` 보존 | `backend/src/parsers/warning-parser.js:54-115` | 공항 배너·브리핑·알림; 원 시각 해석 확인 필요 |
| `weather.airport_info` | 운영 | KMA XML 미보존 | `backend/src/parsers/airport-info-parser.js:25-44` | 공항 정보 카드; 일부 시각이 KST 문자열로 남음 |
| `weather.takeoff_forecast` | 운영 | KMA XML 미보존 | `backend/src/parsers/takeoff-forecast-parser.js:4-59` | 브리핑; KST→UTC, QNH 단위 변환 |
| `weather.amos` | 운영 | KMA 텍스트 전체 미보존, 선택 행 raw 필드만 보존 | `backend/src/parsers/amos-parser.js:1-38,110-175` | AMOS 화면·브리핑·알림; 풍속·구름 단위 계약 재확인 필요 |
| `hazard.lightning` | 운영 | KMA 텍스트 미보존 | `backend/src/parsers/lightning-parser.js:14-121` | 지도·경로 노출; intensity/height 단위가 불명확 |
| `hazard.sigwx_low` | 운영 | KMA 전용 XML 미보존 | `backend/src/parsers/sigwx-low-parser.js:85-150` | 지도·history·전선/구름 meta; 명시적 유효기간 없음 |
| `imagery.radar` | 운영 | KMA gzip 격자는 미보존, 렌더 PNG만 보존 | `backend/src/parsers/radar-echo-parser.js:168-191`, `backend/src/processors/radar-echo-processor.js:104-160` | 국내 레이더 frame/meta |
| `imagery.radar_tiles` | 운영 | RainViewer catalog JSON 미보존, 실제 tile은 CDN 직결 | `backend/src/processors/rainviewer-processor.js:21-61` | 해외 레이더 타일. 제공자·라이선스 경계를 카탈로그에 기록 |
| `imagery.satellite` | 운영 | KMA NetCDF/HDF5 미보존, WebP만 보존 | `backend/src/parsers/satellite-parser.js:50-263`, `backend/src/processors/satellite-processor.js:118-196` | 위성 frame/meta |
| `weather.ground_forecast` | 운영 | KMA 단기·동네·중기 JSON 미보존 | `backend/src/processors/ground-forecast-processor.js:220-640` | 공항/지상 예보. KST 중심 시각 규격 |
| `weather.ground_overview` | **고아 후보** | 저장 원본·생성기 확인 안 됨 | `backend/src/store.js:10-31`, `backend/server.js:762` | type/API는 있으나 producer가 없음 |
| `environment.airport` | 운영 | AirKorea, KMA UV, Open-Meteo fallback 응답 미보존 | `backend/src/processors/environment-processor.js:43-205` | 환경 카드; provider와 PM 단위를 명시해야 함 |
| `model.kim` | 운영 | KMA KIM; raw ASCII 기본 보존 | `backend/src/processors/kim-nwp-store.js:43-115`, `backend/src/processors/kim-nwp-model.js:355-594` | index와 field는 `representation`으로 구분; 지도·경로 단면 |
| `model.kim_surface_wind` | legacy fallback | canonical KIM field에서 호환형 생성 | `backend/src/processors/kim-surface-wind-processor.js:627-660` | `/api/kim/surface-wind`; 신규 소비자는 `model.kim` 우선 |
| `model.ktg` | 운영 | KMA KTG NetCDF→고도별 JSON 격자 | `backend/src/processors/ktg-store.js:29-74`, `backend/src/processors/ktg-model.js:1-47` | index와 grid는 `representation`으로 구분; 난류 지도·경로 단면 |
| `aviation.notam` | 운영 | KOCA KML 미보존, NOTAM `rawText` 보존 | `backend/src/parsers/notam-parser.js:1-104` | 지도·브리핑·알림; AGL/AMSL 기준면 유지 필요 |
| `traffic.adsb` | 요청 시 | adsb.lol JSON 미보존 | `backend/src/processors/adsb-processor.js:152-233` | RKRR coverage는 `source.scope`으로 기록. 공통 `store.save`를 우회 |
| `traffic.callsign_route` | 요청 시/메모리 | adsbdb 응답 미보존, 6시간 메모리 cache | `backend/server.js:639-675` | ADS-B popup; 조회시각·provider version 없음 |
| `weather.flight_category` | **수집 중단** | KMA visibility/GK2A CTH 원본 미보존 | `backend/src/processors/flight-category-processor.js:291-330` | API는 남았지만 scheduler가 주석 처리됨 (`backend/src/index.js:110-112,154-155`) |

공통 스냅샷 저장소에는 20개 허용 type이 있다 (`backend/src/store.js:10-31`). 그중 레이더, 위성, RainViewer, KIM 본체, KTG, ADS-B는 전용 파일 저장을 사용하므로 `store.save`만 감시하면 빠진다.

## 7. 정적 항공·지리·지형 데이터 family

| 권장 태그 | 원본·현재 상태 | 현재 규격의 근거 | 주요 소비자·주의점 |
|---|---|---|---|
| `aviation.airport` | 국내 `shared/airports.js` 및 해외 OurAirports 기반 JSON | `shared/airports.js:1-17`, `frontend/public/data/navdata/airports-overseas.json` | `source.scope`으로 국내/해외를 구분. 중복 정의와 출처·판본 불명이 남아 있음 |
| `aviation.navpoint` | 공항·waypoint·navaid GeoJSON; provenance 불균일 | `frontend/src/features/aviation-layers/aviationWfsLayers.js:99-167` | 항공지도의 점·검색 |
| `aviation.airspace` | FIR·sector·CTR·TMA·제한·금지·위험공역 GeoJSON | `frontend/src/features/aviation-layers/aviationWfsLayers.js:62-293` | 지도·NOTAM/경로 판단. AIRAC/effective 정보 불균일 |
| `aviation.airway` | active reviewed AIP에서 생성된 `enroute.json` + 표시 GeoJSON | `frontend/public/data/navdata/README.md`, `scripts/build_enroute_navdata.py` | route planner·airway 지도. 두 표현 간 ID 연결을 명시해야 함 |
| `aviation.navdata` | X-Plane/OurAirports 계열 checked-in JSON·GeoJSON | `scripts/generate_overseas_navdata.py:12-37` | 국제 route planner·지도. 여러 source cycle 정합 보장 없음 |
| `aviation.procedure` | 공항별 SID/STAR/IAP JSON, wrapper가 파일마다 다름 | `frontend/src/features/route-briefing/lib/procedureData.js:1-51` | route editor·profile. publication/source metadata를 통일해야 함 |
| `aviation.aip` | KOCA eAIP 원문, 검토 snapshot, active manifest | `backend/data/aip/raw/2026-06-25/manifest.json`, `backend/data/aip/current/manifest.json` | `representation`으로 raw/reviewed/active를 구분. 가장 원본 추적성이 좋은 family |
| `terrain.dem` | 국내 raw·1° tile과 해외 Copernicus DSM COG 30 tile | `scripts/prepare-terrain-tiles.js:8-10`, `backend/data/terrain/overseas-tile-manifest.json` | `source.scope`과 `representation`으로 국내/해외·원본/tile을 구분. 응답의 DEM source/version 보강 필요 |
| `geography.boundary` | 시도·시군구 GeoJSON | `frontend/public/Geo/` | 기본 지도·mask 생성. 출처·기준일 metadata 필요 |
| `reference.warning_type` | 프로젝트 경보 유형표 | `shared/warning-types.js` | 모니터링·표시 |
| `reference.alert_default` | 프로젝트 기본 알림 규칙 | `shared/alert-defaults.js` | legacy monitoring 알림; 서버 route alert 규칙과 별도 체계 |

## 8. 재사용 파생 산출물과 알림 family

| 권장 태그 | 의미·상위 자료 | 현재 규격의 근거 | 보존·역추적 상태 |
|---|---|---|---|
| `system.snapshot_meta` | 모든 최신 family의 변경 hash/시각 색인 | `backend/server.js:300-430` | 메모리 memo; schema/source/space/unit 없음 |
| `briefing.route_axis` | route geometry를 거리축 sample로 변환 | `backend/src/briefing/route-axis.js:49-137` | 비영속; 원 geometry/hash를 결과에 싣지 않음 |
| `briefing.flight_profile` | 절차·고도·지형을 계획 고도선으로 합성 | `backend/src/briefing/profile-composer.js:432-564` | 비영속; 일부 source/raw altitude만 보존 |
| `briefing.vertical_profile` | 경로축·지형·고도 profile 종합 | `backend/src/briefing/vertical-profile.js:6-29` | API no-store; route/terrain version이 불완전 |
| `briefing.weather_cross_section` | KIM/KTG를 경로거리×고도로 sampling | `backend/src/briefing/enroute-cross-section.js:73-139` | run은 남지만 field checksum 목록 없음 |
| `briefing.enroute_weather` | 단면을 착빙·난류 구간으로 요약 | `backend/src/briefing/enroute-model.js:73-119` | threshold/model version 없음 |
| `briefing.hazard_exposure` | advisory와 경로·시간·고도의 교집합 | `backend/src/briefing/hazard-section.js:9-65` | sourceId·validity로 부분 추적 |
| `briefing.notam_exposure` | NOTAM과 경로·공항·시간·고도의 교집합 | `backend/src/briefing/notam-briefing.js:23-75` | NOTAM id/rawText 보존; 일부 기준면 비교 단순화 |
| `briefing.aip_constraints` | active AIP constraint를 route segment에 결합 | `backend/src/briefing/aip-airway-constraints.js:15-83` | publication/effective/validation 부분 보존 |
| `briefing.route_exposure` | SIGMET/AIRMET·낙뢰 노출 비교 | `backend/src/briefing/route-exposure.js:23-91` | batch 응답에는 source hash snapshot 존재 |
| `briefing.altitude_candidates` | AIP 제약과 계획고도에서 후보 생성 | `backend/src/briefing/altitude-weather-comparison.js:41-68` | 비영속 |
| `briefing.altitude_comparison` | 후보별 바람·난류·위험·NOTAM 비교 | `backend/src/briefing/altitude-weather-comparison.js:176-190` | KIM/KTG run·AIP provenance 부분 보존 |
| `briefing.route` | 비행 한 건의 전체 브리핑 | `backend/src/briefing/briefing-composer.js:79-174` | 현재 가장 강한 provenance지만 source snapshot hash와 계산기 version이 부족 |
| `alert.active_flight` | 사용자별 감시창 안 가장 임박한 비행 1개 | `backend/src/alerts/scheduler.js:161-175` | 15분 tick, 비영속 |
| `alert.monitor_snapshot` | diff용 최소 브리핑 상태 | `backend/src/alerts/scheduler.js:77-109` | 실제 snapshot은 메모리에만 있고 DB에는 hash만 보존 |
| `alert.change` | 이전→현재의 악화 변화 후보 | `backend/src/alerts/diff.js:5-83` | minima/rule/model version 없음 |
| `alert.triggered` | 영속 알림·dedup·읽음·발송 상태 | `backend/src/db/schema.sql:77-91` | source sequence/issued 시각과 reissue가 현재 미사용 |
| `alert.notification_feed` | 사용자 알림 목록과 unread count | `backend/src/me/alerts.js:107-145` | feed projection에서 source/dedup/channel 상세가 빠짐 |
| `alert.delivery` | HIGH/CRITICAL Telegram 문구와 전달 결과 | `backend/src/alerts/sender.js:25-125` | 문구 전문·formatter version 미보존 |
| `alert.monitoring_browser` | legacy 화면의 로컬 경고 이벤트 | `frontend/src/features/monitoring/legacy/utils/alerts/alert-engine.js` | 서버 알림과 severity·dedup·shape가 다른 별도 체계 |

알림 baseline은 프로세스 재시작 뒤 복원되지 않고, `route_id + dedup_key`는 영구 중복 제거라 회복 후 같은 악화가 재발해도 다시 알리지 않을 수 있다 (`backend/src/alerts/scheduler.js:117-152`). 태그 규격을 도입해도 이 동작 문제는 별도 수정이 필요하다.

## 9. 사용자·업무·운영 레코드 family

| 권장 태그 | 현재 저장 | 현재 규격의 근거 | 상태·주의점 |
|---|---|---|---|
| `user.account` | SQLite `users` | `backend/src/db/schema.sql:4-15` | 운영. 역할·담당공항·개인 미니마 포함 |
| `user.minima` | 현재는 `users.min_*` | `backend/src/me/presets.js:21-33` | 운영. 별도 `presets` 테이블은 legacy 잔존 |
| `flight.route` | SQLite `routes.payload` + 정규 컬럼; guest는 localStorage | `backend/src/db/schema.sql:31-53`, `frontend/src/features/route-briefing/lib/routeStore.js` | 핵심 payload가 버전 없는 자유 JSON이라 migration 위험이 가장 큼 |
| `flight.route_import` | 브라우저 GeoJSON/GPX/KML/JSON | `frontend/src/features/route-briefing/lib/routeImport.js:39-163` | 원 파일 bytes/hash가 최종 route에 남지 않음 |
| `user.forecaster_request` | SQLite `requests` | `backend/src/db/schema.sql:55-66` | 당시 briefing/weather snapshot을 고정하지 않음 |
| `system.resource_metric` | SQLite `metrics` | `backend/src/db/schema.sql:68-71` | host/build ID 없음 |
| `system.visit` | SQLite `visits` | `backend/src/db/schema.sql:73-75` | 익명 visitor first/last seen |
| `auth.session` | session store 생성 table | `backend/src/auth/session.js:22-48` | 인증·보안 경계. 운영 데이터 카탈로그와 접근권한 분리 필요 |
| `alert.push_subscription` | SQLite `push_subscriptions` | `backend/src/db/schema.sql:93-100`, `backend/src/me/push.js`, `frontend/src/features/developer/tabs/TriggerTab.jsx` | Web Push 구독·해지와 관리자 테스트 발송은 연결됨. 실제 경로 알림 전달에는 아직 미연결이며, 사용자별 전달 설정이므로 운영 데이터 공통 규격에서는 제외 |
| `user.aircraft_performance` | localStorage `amo_last_perf` | `frontend/src/features/route-briefing/lib/aircraftProfiles.js` | 단순 기본값이며 공식 성능자료로 취급하면 안 됨 |
| `user.display_settings` | localStorage timezone/language/theme/filter 등 | `frontend/src/features/settings/SettingsModal.jsx`, `frontend/src/features/monitoring/MonitoringPage.jsx` | 전역 operational catalog보다 로컬 preference schema가 적합 |

SQLite에는 명시된 8개 업무 테이블이 모두 조사됐고, session table은 별도 store가 관리한다. `routes.payload`와 DB 전체에는 정식 migration version/ledger가 없다 (`backend/src/db/index.js:8-47`).

## 10. 로컬 표시 규격으로만 두어야 할 family

다음은 shape를 문서화할 가치는 있지만 전역 데이터 게시판에 매번 게시할 필요는 없다. 대신 원 자료의 `source_refs`를 유지하면 된다.

| 로컬 family | 생산 코드 | 현재 연결 손실 |
|---|---|---|
| 공항 지도 station summary | `frontend/src/features/map/lib/airportStationModel.js:156` | METAR snapshot hash/record ID 없음 |
| 공항 METAR·경보 view model | `frontend/src/features/airport-panel/lib/metarViewModel.js:67` | parent snapshot hash 없음 |
| 공항 TAF timeline | `frontend/src/features/airport-panel/lib/tafViewModel.js:134` | bulletin ID/hash 계약 없음 |
| AMOS console | `frontend/src/shared/weather/amosViewModel.js:186-213` | 원 record ref와 일부 단위가 소실 |
| 통합 weather overlay model | `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | 입력 tag/hash 목록 없음 |
| NOTAM GeoJSON | `frontend/src/features/notam/lib/notamGeoJson.js:16-39` | item ID/rawText는 있으나 snapshot hash 없음 |
| ADS-B point·예측선 GeoJSON | `frontend/src/features/aviation-layers/addAdsbLayer.js:36-57` | snapshot 시각/hash와 prediction metadata 없음 |
| 경로 preview GeoJSON | `frontend/src/features/route-briefing/lib/routePreview.js:71-98` | navdata publication/version 없음 |
| 상층바람 표 | `frontend/src/features/route-briefing/lib/rawWindsModel.js:8-84` | cross-section run/hash 없음 |
| 대안경로 비교 행 | `frontend/src/features/route-briefing/lib/routeComparison.js:48-61` | batch weather snapshot ID를 유지해야 함 |
| 브리핑→지도 action | `frontend/src/features/route-briefing/lib/hazardLayers.js:18` | 특정 hazard ID 없이 layer 전체만 지정 |

## 11. 현재 구조에서 확인된 핵심 문제

아래 첫 세 가지는 카탈로그 도입보다 먼저 해결하거나, 최소한 해결 방식을 확정해야 한다. 태그를 잘 붙여도 사용자 데이터가 읽히지 않거나 안전 알림이 조용히 누락되면 목적을 달성하지 못한다.

1. **저장 비행경로의 형식 변경 안전장치가 없다.** `routes.payload`는 버전 없는 자유 JSON이다. 화면이 기대하는 모양을 바꾸면 과거 사용자의 저장 경로를 읽지 못할 수 있고, 어느 변환을 적용했는지도 남지 않는다.
2. **알림의 “변화 감지”와 “한 번만 알림”이 충돌한다.** 이전 상태는 서버 메모리에만 있어 재시작하면 사라진다. 반면 `route_id + dedup_key`는 영구히 중복으로 처리한다. 따라서 날씨가 좋아졌다가 같은 조건으로 다시 나빠져도, 과거 알림 기록 때문에 새 알림이 막힐 수 있다.
3. **`ground_overview`는 소비 통로만 있고 생산자가 없다.** API와 화면 연결은 있지만 실제로 이 자료를 만드는 수집기·처리기가 확인되지 않았다. 빈 결과를 전제로 유지할지, 실제 생산 연결을 만들지 결정해야 한다.
4. **태그와 이름이 흩어져 있다.** `type`, folder, API, camelCase frontend key, DB table이 서로 다른 이름을 쓴다.
5. **나머지 자료에도 schema version이 없다.** parser와 UI 코드가 암묵적으로 shape를 공유한다.
6. **원본 보존이 드물다.** KIM과 AIP를 제외한 대부분의 XML/JSON/binary envelope가 남지 않는다.
7. **원문과 재구성문이 섞인다.** 국내 METAR/TAF `raw_text`는 재구성문이고 NOAA의 값은 provider 원문이다.
8. **시간 의미가 통일되지 않았다.** UTC ISO, KST compact 문자열, epoch가 혼재하고 관측·발행·유효·수집·생성 시각 이름도 다르다.
9. **단위와 공간 기준이 암묵적이다.** 값 이름, UI label, 코드 변환에 흩어져 있고 CRS·vertical reference가 자주 빠진다.
10. **공통 저장 경로 밖의 자료가 많다.** radar, satellite, RainViewer, KIM, KTG, ADS-B는 각자 저장한다.
11. **파생 결과가 상위 연결을 잃는다.** 지도 GeoJSON과 view-model에 parent tag/hash/record ID가 대체로 없다.
12. **정적 항공자료의 provenance가 불균일하다.** 국내 reviewed AIP는 강하지만 해외 NAVDATA, 절차, 공역, 지리 경계는 source/effective 규격이 일정하지 않다.
13. **선언됐지만 작동하지 않는 데이터가 더 있다.** flight-category 수집, legacy presets와 일부 alert 필드가 고아·중단·placeholder 상태다. Web Push 구독은 테스트 발송까지 작동하지만 실제 경로 알림 전달에는 아직 연결되지 않았다.
14. **알림 체계가 둘이다.** 서버 route alert와 legacy browser monitoring alert가 서로 다른 규격·심각도·중복 제거를 사용한다.

## 12. 최소형 설계 권고

다음 스펙에서는 전체 payload를 한꺼번에 다시 만들지 않는 것이 좋다.

1. 먼저 §2의 세 문제에 대한 구현 계획을 확정한다. 특히 `routes.payload` 변환, 알림의 회복·재발 규칙, `ground_overview`의 존치 여부는 카탈로그보다 앞선다.
2. 카탈로그 파일 하나에 이 문서의 **전역 family**만 등록한다.
3. 새 데이터 family는 반드시 `tag + schema_version + source + time/space/units`를 등록해야 합쳐질 수 있게 한다. 태그는 두 칸(`weather.metar`)만 쓰고, 국내/해외와 원본/가공/파생 상태는 각각 `source.scope`, `representation` 필드로 분리한다.
4. 기존 자료는 우선 저장/API shape를 바꾸지 않고 adapter가 명찰을 덧붙이게 한다.
5. `/api/snapshot-meta`에는 각 family의 `tag`, `schema_version`, `instance version/hash`, 최신 시각만 추가해 공통 변경 게시판으로 확장한다.
6. 브리핑과 알림부터 `source_refs`를 보존한다. 이 둘이 원본 추적과 자동 후속처리의 효과가 가장 크다.
7. 로컬 view-model은 전역 게시판에 등록하지 않고 source reference만 전달한다.
8. raw 원본을 모두 저장하도록 강제하지 않는다. 저장하지 않을 때는 `raw_retention: none`과 response hash를 명시한다.

이 단계에서는 event bus, message broker, 별도 schema registry 서버, 모든 기존 JSON의 일괄 migration이 필요하지 않다. 카탈로그와 최소 명찰이 실제로 부족해지는 시점에만 확장한다.

## 13. 다음 설계에서 결정할 질문

1. 카탈로그의 첫 적용 범위를 기상·위험·브리핑·알림으로 제한할지, 사용자·관리 데이터까지 같은 규격에 넣을지.
2. 기존 API 응답 자체에 envelope를 씌울지, 호환성을 위해 별도 meta endpoint와 adapter를 먼저 둘지.
3. 원본을 보존할 family를 어디까지 정할지. 저장비용과 재현성 사이의 기준이 필요하다.
4. `snapshot-meta`를 단순 변경 색인으로 유지할지, tag 기반 publication index로 확장할지.
5. 서버 route alert와 browser monitoring alert를 같은 event vocabulary로 합칠지, source event만 공유하고 전달 규칙은 분리할지.
6. `routes.payload`의 최초 명시 버전과, 과거 저장값을 새 버전으로 읽는 변환 규칙을 무엇으로 할지.
7. 알림 상태를 어디에 얼마나 오래 보존하고, “회복 후 재발”을 어느 조건에서 새 알림으로 인정할지.
8. `ground_overview`를 삭제할지, 어떤 source와 processor로 실제 값을 생산할지.
