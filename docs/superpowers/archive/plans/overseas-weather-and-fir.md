# 해외 기상(NOAA) + FIR 경계 데이터 — 구현 준비 문서

상태: 조사 완료(실측 근거) · 2026-07-05 · 다음 트랙(해외 기상) 착수 전 준비

관련: `overseas-noaa-integration.md`(1차 결정), `docs/research/2026-07-05-overseas-data-research.md`(소스 조사).
이 문서는 **① FIR 경계 데이터**와 **② NOAA에서 METAR/TAF/SIGMET 가져오는 구현 설계**를 실측 기반으로 정리한다.

---

## ① FIR 경계 데이터

SIGMET을 공역별로 표시/그룹핑하려면 아시아 20개 FIR 경계 폴리곤이 필요하다. 지금 `frontend/public/data/fir.geojson`은 **인천 FIR + 이웃 라벨 일부**뿐이라 나머지 FIR이 없다.

### 추천 소스: VATSIM VAT-Spy Boundaries
- **URL**: `https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson`
- **포맷**: GeoJSON FeatureCollection (MultiPolygon), `properties.id` = ICAO FIR 코드
- **커버**: 대상 20개 중 **19개** 포함(RKRR·RJJJ·ZYSH·ZBPE·ZSHA·ZHWH·ZGZU·ZJSA·RCAA·VHHK·ZMUB·VVHN·VVHM·RPHI·VTBB·WMFC·WSJC·WIIF·WAAF)
- **라이선스**: **CC-BY-SA-4.0** — 상업 사용 가능, 단 **출처 표기 필요**(+파생물 동일 라이선스). 인증 불필요(공개 CDN).
- **갱신**: 커뮤니티 활성 유지.

### ⚠️ 주의: VDPP vs VDPF
- 우리 목록의 "VDPP 프놈펜"은 **공항 코드**이고, 프놈펜 **FIR 코드는 VDPF**로 재지정됨(ICAO). VAT-Spy엔 **VDPF**로 있음. → 필터 목록에 `VDPF` 사용.
- 즉 SIGMET의 `firId`와 매칭할 때 프놈펜은 VDPF 기준.

### 적용 방법
1. 다운로드 후 20개 FIR(`VDPP→VDPF` 치환)만 필터:
   ```bash
   curl -s https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson -o vatsim-fir.geojson
   # node로 properties.id ∈ 20FIR 필터 → fir-overseas.geojson
   ```
2. 우리 스키마로: feature마다 `{ id: <ICAO FIR>, geometry }` 유지. 표시는 기존 aviation-layers의 fir 레이어 패턴 재사용(별도 `해외 FIR` 레이어 or 기존 fir.geojson에 병합).
3. **출처 표기**(CC-BY-SA) — 지도 attribution 또는 정보 화면에 "FIR boundaries © VATSIM VAT-Spy (CC-BY-SA-4.0)".
4. SIGMET 표시엔 사실 FIR 경계가 필수는 아님(SIGMET 자체가 도형 좌표 보유) — FIR 경계는 **배경 구획 표시/그룹 라벨용**. 우선순위는 중간.

### 대안(비추)
- OpenAIP airspaces: CC-BY-NC(상업 불가) + API키. ICAO 공식 GIS: 유료($1995). FlightMapEurope: 유럽 위주. → **VAT-Spy가 최선.**

---

## ② NOAA에서 METAR/TAF/SIGMET 가져오기 (구현 설계)

결정 복기: **국내(RKxx)=기상청 유지, 해외만 NOAA**. NOAA는 JSON이라 별도 파서 갈래 추가.
아래는 실제 호출로 확정한 스키마·엔드포인트.

### A. 엔드포인트 (실측)
| 종류 | URL | 파라미터 | 비고 |
|---|---|---|---|
| METAR | `https://aviationweather.gov/api/data/metar` | `ids=RJTT,ZBAA,...&format=json` | **벌크(콤마 다건) 1콜**, 50+ 가능 |
| TAF | `https://aviationweather.gov/api/data/taf` | `ids=...&format=json` | 벌크 |
| 국제 SIGMET | `https://aviationweather.gov/api/data/isigmet` | `format=json` | **ids 없음 — 전세계 전량(~1000건)**, 코드에서 firId로 필터 |

- **인증 불필요**(공개). rate limit 문서화 안 됨(엄격 제한 없음). JSON 외 `format=xml`(IWXXM)도 됨.

### B. 응답 → 정규화 매핑 (핵심 필드)

**METAR** (`icaoId, reportTime, temp, dewp, wdir("VRB"가능), wspd, wgst, visib, altim(hPa), rawOb, fltCat, clouds[{cover,base}], lat, lon`)
- ⚠️ **`visib`는 통계마일(SM)** — "6+"=≥6SM. **km로 변환 필요**("6+"→"10000+", 숫자 SM×1.609 반올림). 국내(KMA)는 km라 변환 후 저장해 통일.
- ⚠️ `wdir`가 "VRB"(가변) 문자열일 수 있음 — 처리.

**TAF** (`icaoId, issueTime, validTimeFrom/To, rawTAF, fcsts[{timeFrom/To, fcstChange(null|TEMPO|BECMG), timeBec, wdir, wspd, visib, wxString, clouds}]`)
- 우리 브리핑이 요구하는 `base`(기본예보) + `change_groups`(TEMPO/BECMG)로 매핑: `fcstChange===null`→base, 나머지→change_groups. visib 동일 SM→km 변환.

**SIGMET** (`icaoId, firId, firName, hazard, qualifier, base/top(ft), validTimeFrom/To, coords[{lon,lat}](닫힌 폴리곤), geom(AREA/LINE/POINT), dir/spd, rawSigmet`)
- **firId로 아시아 20 FIR 필터**(VDPF 포함). 도형 coords 그대로 표시·경로매칭.

### C. 파일 계획
신규 파서 3종(기존 IWXXM 파서와 분리, **출력은 기존 정규화 shape에 맞춤**):
- `backend/src/parsers/noaa-metar-parser.js` (+ `convertSmToKm`)
- `backend/src/parsers/noaa-taf-parser.js` (base/change_groups)
- `backend/src/parsers/noaa-sigmet-parser.js` (firId 필터)

수정:
- `backend/src/config.js`: `noaa{ base_url, timeout_ms, overseas_airports[], asia_firs[] }`
- `backend/src/api-client.js`: `fetchNoaaMetar/Taf/Sigmet` + JSON 재시도 헬퍼(EUC-KR 디코딩은 KMA 전용, NOAA 경로 제외)
- `backend/src/processors/{metar,taf}-processor.js`: 공항 목록을 국내(RK)/해외로 분기 — 국내는 KMA(현행), 해외는 NOAA 벌크 → NOAA 파서 → 같은 store에 병합
- `backend/src/processors/sigmet-processor.js`: 해외는 NOAA isigmet 1콜 → firId 필터 → 국내 SIGMET과 병합

### D. 폴링 (기존 주기 재사용, 새 cron 불필요)
| 종류 | 주기 | 방식 |
|---|---|---|
| METAR | 10분(기존) | 해외 벌크 50/콜 1~2콜 + 국내 KMA |
| TAF | 30분(기존) | 동일 |
| SIGMET | 5분(기존) | NOAA 전세계 1콜 → 아시아 FIR 필터 + 국내 병합 |

### E. KMA와 다른 점(주의)
- 포맷 JSON(vs IWXXM XML), 인증 없음, **시정 단위 SM→km 변환 필수**, wdir "VRB" 문자열, 벌크 다건 지원.
- IWXXM(`format=xml`) 재사용 검토했으나 — NOAA IWXXM 스키마가 KMA와 100% 동일하진 않을 수 있어 **JSON 파서 신규가 안전**(권고).

### F. 남는 빈칸(예정된 한계)
- **AIRMET**: 아시아 미발행(NOAA 미국 전용) → 해당없음.
- **해외 공항경보**: 해외 피드 없음 → TAF+SIGMET로 대체.
- **경로 상층기상(바람/착빙)**: NOAA GFS(2차, 별도 트랙).

---

## 우선순위 제안 (다음 트랙)
1. **NOAA METAR/TAF**(해외 공항 실황·예보) — 브리핑 ②현재/④목적지 채움. 가장 효과 큼.
2. **NOAA SIGMET**(FIR 필터) — 경로 위험기상. (FIR 경계 표시는 이와 함께 or 직후)
3. **FIR 경계(VAT-Spy)** — 지도 공역 구획(표시용, SIGMET 도형은 이미 있으므로 후순위 가능).
4. (2차) GFS 상층기상.
