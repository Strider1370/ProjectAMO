# 해외 기상(NOAA) 수집 — 상태

상태: **백엔드 수집·병합 구현 완료 + 검증** · 2026-07-05 · main
설계 근거: `docs/superpowers/plans/overseas-weather-and-fir.md`

## 한 일 (task 1~6)
국내(RKxx)=기상청(IWXXM) 그대로, **해외만 NOAA** 별도 갈래로 추가. 출력은 기존 정규화 shape에 맞춰 downstream 무변경.

신규
- `backend/src/parsers/noaa-metar-parser.js` (+`convertSmToMeters`) + test
- `backend/src/parsers/noaa-taf-parser.js` (base/change_groups/timeline, TEMPO·BECMG·FM) + test
- `backend/src/parsers/noaa-sigmet-parser.js` (firId 필터 → 정규화 item) + test

수정
- `config.js`: `noaa{ base_url, timeout_ms, overseas_airports[48], asia_firs[20] }` (VDPP→**VDPF**, RKRR 제외)
- `api-client.js`: `fetchNoaaMetar/Taf`(벌크 ids 1콜)·`fetchNoaaSigmet`(전세계 1콜). JSON·무인증·resultCode/EUC-KR 없음.
- `metar-processor.js`/`taf-processor.js`: 국내 수집 뒤 `collectOverseas()` — NOAA 벌크→파서→**같은 `result.airports`에 ICAO 병합**. 실패 격리(국내 무영향).
- `sigmet-processor.js`: 국내 SIGMET + NOAA isigmet(asia_firs 필터) 병합 후 기존 `mergeAdvisories`.
- 스케줄 변경 없음(기존 METAR 10분/TAF 30분/SIGMET 5분 재사용).

## 실측 반영 (plan과 다른 점)
- **시정 단위 = 미터**(KMA store가 9999m 기준). plan 문구 "km"는 오기 — 목표값 "10000+"이 곧 미터. NOAA `visib "6+"` → 9999m, 숫자 SM×1609.34 반올림·9999 캡.
- NOAA isigmet 피드에 **RKRR 1건 존재** 확인 → asia_firs에서 RKRR 제외(KMA와 중복 방지).
- 구름 base는 NOAA도 피트, TAF 시각은 unix초.

## 검증 (증거)
- 파서 단위테스트 **18/18 pass** (SM→m, "6+"/분수, VRB, TEMPO/BECMG/timeline, FIR 필터·FL변환·닫힌 폴리곤·만료제외). 기존 테스트 회귀 정상.
- **실 NOAA 라이브 파싱**: METAR 9/9·TAF 10/10·SIGMET 136→23(아시아 13 FIR, RKRR/타대륙 제외) 정상.
- **store 기록**: 실제 fetch→파서→`store.save` 후 `latest.json`에 해외 46 METAR/46 TAF·24 SIGMET 병합 확인(shape 정상). ※ 검증용 임시 overseas-only 스냅샷은 원복함.
- **프론트 소비 경로 코드검증**: `server.js` `/api/metar`가 latest.json 전체를 ICAO키로 반환 → `AirportPanel.jsx:68` `weatherData.metar.airports[icao]` 조회. 해외 ICAO 자동 표시(프론트 무수정).

## 저장 구조: 국내/해외 완전 분리 (2026-07-05 리팩터)
초기엔 국내 processor에 해외를 섞어 같은 `metar/taf/sigmet` 파일에 병합했으나 → **별도 파일로 분리**.
- 국내 `metar/taf/sigmet-processor.js`는 **원복(pristine)** — KMA만.
- 신규 `processors/overseas-weather-processor.js`(`processMetar/Taf/Sigmet`) → 별도 store 타입 `metar_overseas`/`taf_overseas`/`sigmet_overseas`(store.js TYPES/FILE_PREFIX/cache 추가).
- `index.js`: 국내와 같은 주기(METAR 10분/TAF 30분/SIGMET 5분)로 **별도 cron job** + 초기수집 등록(lock 키 분리).
- `server.js`: `/api/{metar,taf,sigmet}-overseas` 라우트 + 캐시 revalidate 허용목록.
- 프론트 `weatherApi`: `loadWeatherData`·`loadChangedWeatherData`가 국내+해외를 받아 `mergeAirportPayloads`(ICAO)·`mergeAdvisoryPayloads`(items)로 병합 → 다운스트림 무변경. 폴링은 국내 변경 신호에 해외를 묶음(같은 주기).
- 검증: 해외 processor 직접 실행 — `*_overseas/latest.json`에 METAR 46/TAF 46/SIGMET 22 저장, 국내 `metar/latest.json`은 15 유지·해외 미유출 확인. 백엔드 파서 20/20, 프론트 weatherApi 3/3 pass.
- ⚠️ **라이브 반영은 백엔드 재기동 필요**(구동 중 3001은 구코드라 `/api/*-overseas` 404).

## 프론트 (해외 공항 마커 + 패널)
- `api/weatherApi.js` `loadWeatherData`: navdata `airports-overseas.json`(48) → 국내 shape로 매핑해 `weatherData.airports`에 병합. 지도 마커·클릭→패널·검색 카탈로그 모두 국내와 동일 경로로 편입(마커/패널 컴포넌트 무수정). 회귀 테스트 3/3 pass.
- 파서에 `header.raw_text`(rawOb/rawTAF) 보존 → METAR/TAF 탭 하단에 **원문(TAC)** 블록 표시(국내 IWXXM는 원문 없어 미표시). TAF는 `formatTafTac`로 FM/BECMG/TEMPO/PROB 앞 줄바꿈+들여쓰기(우리가 읽는 형태), 타임라인 **아래** 배치.
- 스타일은 인라인(RAW_TAC_STYLE) — Vite dev CSS HMR가 대소문자 파일명(`AirportPanel.css` vs `airportPanel.css`)로 append 규칙을 못 잡는 이슈 회피.
- 검증(Playwright, 1536×864): 해외 마커 렌더 + `?airport=RJTT` 패널 → METAR 디코드 그리드+원문, TAF 타임라인(BECMG 12006KT→04010KT·TEMPO 운고 800ft)+원문 다줄. 콘솔 pageerror 0. 스샷 `artifacts/overseas-weather-20260705_1353/`.
  - ⚠️ 검증은 실행 중 구코드 백엔드(3001)에 병합 latest.json을 주입해 확인. 구코드 스케줄러가 METAR 10분/TAF 30분 주기로 도메스틱만 덮어써 자동 원복 → **영구 적용은 새 코드로 백엔드 재기동 필요**.

## SIGMET 후속 (지오메트리·레이어 분리)
- **자기교차(bowtie) 수정**: NOAA 라인정의 구역(WI/NW OF LINE…)은 좌표가 순서대로 안 와 폴리곤이 꼬임. `noaa-sigmet-parser`에 `ringSelfIntersects` 판정 추가 — **주어진 순서가 실제 자기교차할 때만** 중심각 정렬로 복구, 정상 오목 폴리곤(중국·몽골 등)은 원순서 보존. 라이브 24건 전부 self-int 0 확인. 회귀 테스트 2종 추가(오목 보존/bowtie 복구).
- **국내/해외 SIGMET 레이어 분리**: `advisoryLayers`에 `sigmet_intl` kind 추가(소스/레이어 독립). `weatherOverlayModel`이 `item.source==='NOAA'`로 지도 피처를 분리(`sigmetFeatures`=국내, `sigmetIntlFeatures`=해외). `weatherOverlayLayers`(MET_LAYERS·sync·install)·`WeatherOverlayPanel`(위험기상 그룹에 'SIGMET(해외)' 타일, Globe 아이콘)·`layerActions`(검색 라벨)·MapView(advisoryLayerModel) 연동. 기상레이어 패널에 **SIGMET(국내)/SIGMET(해외)** 독립 토글 2버튼.
- **상단 칩은 국내만 카운트**: `advisoryBadgeItems`의 SIGMET 카운트를 `source!=='NOAA'`만 집계(해외는 패널 토글로만).
- 일본(RJJJ): asia_firs에 포함되어 연동됨. 다만 NOAA isigmet 피드에 활성 일본 SIGMET이 없을 때가 많음(현재 0건) — 발효되면 표시됨. 소스측 한계.
- 검증: 백엔드 파서 7/7, 프론트 overlay/panel/registry 29/29 pass. Playwright — 칩 'SIGMET 1'(국내), 패널 'SIGMET(국내)'/'SIGMET(해외)' 2버튼 확인.

## 남은 것
- **라이브 Playwright 스크린샷(해외 공항 패널/브리핑)**: 미실시. 필요조건 = 새 코드로 백엔드(3001) 재기동 → 스케줄러가 해외 수집(해외는 무인증이라 즉시, 국내 KMA는 키 있으면 정상). 현재 구동 중인 서버는 4h+ 된 구코드라 store에 해외 없음. 재기동은 사용자 확인 후 권장.
- ~~**FIR 경계(task 7, VAT-Spy)**~~ **완료**: `scripts/generate_overseas_fir.mjs`가 VAT-Spy Boundaries에서 20개 아시아 FIR 필터 → `frontend/public/data/fir-overseas.geojson`. `overseas-fir` 항공레이어(경계선+라벨, 점선)로 공역 패널에 토글 추가. source attribution "FIR boundaries © VATSIM VAT-Spy (CC-BY-SA-4.0)"(레이어 ON 시 노출)로 라이선스 준수. Playwright 검증 완료.
- 예정된 빈칸: AIRMET(아시아 미발행)·해외 공항경보(피드 없음, TAF+SIGMET 대체)·경로 상층기상 GFS(다음 트랙).
