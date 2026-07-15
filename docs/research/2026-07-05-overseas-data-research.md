# 해외 공항 확장 — 데이터 소스 조사 결과 (근거)

상태: 조사 완료 · 2026-07-05 · 실측 기반

MVP 범위 문서: `korean_airlines_international_mvp_data_scope.md`(해외 50공항·FIR 20·항로 100·순항 WPT 500).
구현 계획: `docs/superpowers/plans/overseas-noaa-integration.md`.

## 현재 파이프라인 (조사)
- METAR/TAF/SIGMET/AIRMET/경보 = **전부 기상청(apihub.kma.go.kr, IWXXM XML), 국내 전용**.
  공항목록 `shared/airports.js`(국내 15개). 구조: 공항목록 순회 → `api-client` → 파서 → `store`.
- SIGMET/AIRMET 처리 존재하나 FIR=RKRR 고정. 경로 브리핑은 "경로 위 기상 샘플링"만(항로 DB 없음, 클라 입력).
- 글로벌인 건 ADSB(api.adsb.lol, 한반도 필터)뿐.

## 항목별 실측 판정

### METAR/TAF — NOAA `aviationweather.gov/api/data/{metar,taf}` ✅
- 무료·무인증. **벌크**: `ids=RJTT,ZBAA,...&format=json` 50개 1콜, 1.5초. 한도 100콜/분.
- 실측: 아시아 10개 중 METAR 10/10, TAF는 대형공항만(나리타·상하이 등 일부 TAF 미제공).
  전체 50개면 METAR ~44–48, TAF ~20–25 추정.
- 포맷 JSON(`rawOb`, temp/wind/visib/clouds/`fltCat` 등) — 신규 파서 필요.

### SIGMET — NOAA `.../isigmet?format=json` ✅ (FIR 단위)
- **한 번 호출로 전세계 활성 SIGMET**. 항목마다 `firId`, `hazard`, `top/base`, `coords[]`(닫힌 폴리곤),
  `motion`, `rawSigmet`, 유효시간. → FIR 분류·지도표시·경로매칭에 그대로.
- 아시아 20 FIR 중 (조회 시점) 11개 활성 확인: RKRR·ZYSH·ZBPE·ZSHA·ZHWH·ZGZU·ZJSA·VVHN·WMFC·WIII·WAAF.
  나머지(RJJJ·RCAA·VHHK 등)는 미발행 시 빈 것일 뿐, 커버 대상.
- **SIGMET은 공항이 아니라 FIR 단위** — 공항 50루프 금지, FIR 기준 분류.

### AIRMET ⛔ (아시아 미해당)
- NOAA AIRMET은 미국 FIR 전용. 일·중·동남아는 AIRMET 미발행(SIGMET로 저고도 위험 포함). → 빈칸 정상.

### 경로 상층기상(바람/난류/착빙) — GFS(NOMADS) ⚠️ 부분무료 (2차)
- GFS `filter_gfs_0p25.pl` 서브셋(위0–45N·경90–150E, 회당 ~5MB) 실측 다운로드 OK, Public Domain.
  바람/온도 기압면별 ✅. 착빙은 GFS+기존 로직 heuristic 가능. **난류는 무료 글로벌 없음**(WAFS는 로그인).
- GRIB2 디코딩(wgrib2 or npm gribjump) 필요. 기존 KIM 격자 저장구조 복제.

### 항법 데이터(공항/웨이포인트/항로) — 테스트는 X-Plane 무료로 해결 ✅(2012 스냅샷)
- 공항: OurAirports CSV(Public Domain) ✅.
- **항로+웨이포인트: X-Plane `earth_awy.dat`/`earth_fix.dat`(GitHub mcantsin 미러) 무료 확보.**
  - 실측: earth_awy 70,295 세그먼트(전세계), earth_fix 11만 웨이포인트. 아시아(일 905·동남아 1225·중국 206) 커버.
  - 포맷: 좌표 인라인 고정폭 텍스트 → 파싱 쉬움. GPL v3(테스트용 무방, 회사자료로 교체 예정).
  - ⚠ **2012.08 사이클** — 전통항로(A/B/G/W) 빽빽하나 최신 RNAV(Y계열) 아시아 거의 없음(Y722=0).
  - 변환기 완성: `scripts/generate_overseas_navdata.py` → 해외만 필터 → 우리 route-graph 포맷 `*-overseas.json`.
    실측 산출 해외 2,749 세그먼트/492 항로/1,941 노드(중복 저·고고도 제거 후).
- 더 최신 무료는 사실상 없음(X-Plane12 기본 ~2021은 sim 소유·라이선스 애매, FAA CIFP는 미국 전용).
  최신 원하면 유료 Navigraph(~$40/년)뿐. → **테스트=X-Plane 2012, 운영=회사 AIRAC** 결정.
- 경로 자체는 기존 `routePlanner`(route-graph 최단경로)로 국내와 동일하게 처리(신규 엔진 불필요).

### KMA 세계공항(AftnAmmService) — 대안이나 열세
- `apihub.kma.go.kr/.../AftnAmmService/{getMetar,getTaf,getSigmet}?icao=..&authKey=..` 실존·동작 확인
  (ZMUB·VHHH·일본·중국 실데이터 수신). **단, 원문(raw TAC), 공항당 1콜, 낮은 호출한도**(데모키 ~70콜서 소진).
  → 대량 폴링 불리. 보조/교차검증 여지만.

## 결론
- 1차(METAR/TAF/SIGMET)는 **NOAA로 무료 구현 가능**(실측). 국내는 KMA 유지.
- 2차 이연: GFS 상층기상, FIR 경계 폴리곤(표시엔 SIGMET 자체 도형으로 충분), 항로 navdata(유료 병목).
