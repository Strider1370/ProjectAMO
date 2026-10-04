# KIM 대류권계면·제트기류 표출 구현 계획

작성: 2026-10-04. 상태: 1~6단계 코드 구현·자동 시험 완료(커밋 전). 운영 실자료 게시·화면 확인은 대기.

KIM 전구모델로 열적 대류권계면과 제트기류를 산출해 지도와 항로 연직 단면에 표출한다. 목적은 운항관리·조종사가 **권계면이 어디에 몇 FL로 있는지**(1차)와 **제트의 위치·풍속·고도**(2차)를 바로 읽게 하는 것이다. 난류 판단의 배경 정보로 GKTG와 함께 본다.

시험 산출과 표현 결정은 ignored `artifacts/tropopause-test/`(계산 `compute.py`·`sigwx.py`, 화면 `kim-tropopause.html`)에 있다. 이 계획은 그 결과를 운영 구조로 옮긴다.

## 1. 확정된 결정

| 항목 | 결정 |
|---|---|
| 권계면 정의 | WMO 열적 권계면(2 K/km), 성긴 층용 Reichler 외(2003) 보간. 2 PVU 역학적 권계면은 쓰지 않음 |
| 이중 권계면 | 표시하지 않음. 관측된 제2 권계면은 FL450~590으로 순항고도 위이고, KIM 탐지율도 낮다(봄 4/23 5/8곳, 5/1 1/7곳) |
| 지도 권계면 | 파랑 5단계 면(<300·300·340·380·420), FL450 이상은 칠하지 않음. FL450 상한 후 약 1° 평활 |
| 권계면 라벨 | `TROP 380`, 연한 파랑 둥근 상자. 제트 라벨과 모양·색·글자 모두 구분 |
| 지도 제트 바탕 | 표시하지 않음(2026-10-04 화면 검토). 연직 최대풍 면은 고도 정보가 없어 오해 소지가 있다 |
| 지도 제트 축 | 안내선. 원 축에서 30 km 안으로 제한, 500 km 미만 조각은 점선으로 유지. 제트별 점검(95% 지점 50 km 초과)에 걸리면 그 축만 생략 |
| 바람깃 | SIGWX HIGH 렌더러와 같은 모양. 제트마다 가장 센 지점 하나에 깃과 `FL340`(화면 밖이면 보이는 구간의 최대 지점). 값은 그 지점 원 격자 |
| 연직 단면 | 권계면 위(성층권) 연보라 면 + 경계선 + `TROP` 라벨, 이웃 표본 사이 5,000 ft 넘게 뛰면 단절로 끊어 그림. 등풍속선은 80 kt(SIGWX 제트 기준) 굵게, 그 위 20 kt 간격 가늘게, 선마다 숫자. 닫힌 80 kt 영역마다 제트 핵 `J` + `110 kt FL310` 상자. 등온선 0°C 굵은·−20°C 가는 빨강. 자료 없음 빗금. 설정 고도 최대 60,000 ft. 온위·PV는 표시하지 않음. 단면 버튼 `권계면·제트` |

### 시험 검증 근거

- 레윈존데 7회차·관측소 8~10곳 비교(같은 시각 F000). 열적 권계면 평균 절대오차: 봄 900~1,300 ft(상관 0.83·0.99), 여름 8/4 800 ft, 가을 1,700~2,000 ft. 여름 7/10은 3,900 ft로, 낮은 권계면 관측소를 놓쳤다.
- FL500 부근(150~100 hPa 층 사이)은 KIM 값이 거의 고정되어 관측 변동을 따라가지 못한다. FL450 상한 표시는 이 한계를 숨기기 위한 결정이기도 하다.
- 2 PVU는 평균 4,500~24,600 ft 낮아 권계면 높이로 부적합했다.
- 제트 축 점검: 실제 최대풍 축과 거리 중앙 5~30 km. 점검을 통과한 축에서 100 kt 이상 강풍대가 빠진 경우는 0~15%(빠진 강풍대는 바탕 빗금으로 표시).

## 2. 자료와 계산

### 추가 수집

| 항목 | 값 |
|---|---|
| 변수·층 | `T`·`hgt`·`u`·`v` × 100·70 hPa (`u`·`v`는 2026-10-04 추가, 단면 상층 등풍속선용) |
| 시각 | 기존 F000–F012 13시각 |
| 요청 수 | 8 × 13 = **104건/회차**, 하루 4회차 416건 |
| 키 | 기본 KIM 격자·GKTG 추가 입력과 같은 회차별 키(`selectKimRunCredential`: 00·06 KIM, 12 레이더·위성, 18 항공). 키 장부 operation은 `kim_grid_trop`로 분리 |
| 재시도 | 기존 `kim_grid` 정책(2회 시도, 2초 간격)을 따름 |
| 저장 | `kim_nwp/runs/<run>/raw/trop/hfNNN-<name>-<level>.txt`, 기본 21층을 다 확보한 시각만 요청 |

제트는 추가 호출이 없다. 기존 21층 u·v(최상층 150 hPa ≈ FL445)로 500–150 hPa 연직 최대풍을 구한다. 150 hPa 위의 최대풍은 다루지 않으며, 이는 FL450 상한 결정과 맞는다.

### 계산 위치

GKTG와 같은 방식으로 Python 패키지 `backend/python/kim_tropopause/`를 만들고, Node processor가 자식 프로세스로 실행한다. 시험 코드(`compute.py`·`sigwx.py`)의 검증된 수치 부분을 옮긴다. 기존 GKTG 가상환경(NumPy)을 재사용하며 새 의존성은 없다.

| 모듈 | 내용 |
|---|---|
| `thermal.py` | 기둥별 (제1) 열적 권계면 기압, 권계면 기온 |
| `jet.py` | 연직 최대풍(풍속·기압, 포물선 보정), 80 kt 층 하단/상단, 축 추적·정리·30 km 제한, 제트별 점검 |
| `calculate.py` | 한 예보시각 입력 → 출력 JSON, 입력 검증 |

### 산출물(시각당, 205×169)

- 격자: `trop`(hPa), `tropT`(°C), `vmax`(kt), `pmax`(hPa). 기존 `int16-scaled-json-v1` 인코딩.
- 벡터: 제트 축 GeoJSON. 속성은 `minor`, `ok`, 깃 지점 목록(경위도, kt, FL, 핵 여부, 80 kt 층 하단/상단), 점검 수치.
- 지도용 평활 면(FL450 상한 + 1° 평활)과 TROP 경계선은 화면 표현이므로 프런트에서 만든다. 저장은 원 격자만 한다.

### processor·저장·API

- `backend/src/processors/kim-tropopause-processor.js`: GKTG processor 구조를 따른다(입력 revision, 불변 시간별 파일, F000–F012 완성 시 `kim_nwp/derived/tropopause/latest.json` 게시, 부분 실패 시 기존 latest 유지, 취소 처리).
- `kim-nwp-store.js`: tropopause 경로·읽기/쓰기·게시 함수를 추가한다.
- `collector-registry.js`·`index.js`: `kim_tropopause` 수집기. 기본 KIM 수집이 끝난 뒤 실행하며, GKTG와 같은 UTC 공개 지연 일정을 따른다.
- `server.js`: `GET /api/kim/tropopause/index`, `GET /api/kim/tropopause/field?tmfc&hf&revision`. GET은 계산·수집을 하지 않는다.
- `api-operation-registry.js`, `admin/data-health-catalog.js`: `kim_grid_trop`, `kim_tropopause`(권계면·제트) 상태 항목.

## 3. 지도

- 진입점: 기상 메뉴의 KIM 그룹에 `권계면·제트` 토글 하나. 공통 NWP 시간축을 따르며, 고도 슬라이더와는 무관(2차원 자료).
- 훅: `useKimTropopause.js`(index/field 선택, 캐시, 요청 취소). `useKimGktg.js` 패턴을 따른다.
- 권계면 면: Canvas 래스터 이미지 오버레이(`temperatureOverlaySync.js` 패턴). 색은 공용 토큰에 추가하고, 어두운 지도용 단계를 별도로 검증한다.
- TROP 경계선·라벨: GeoJSON 선 + 선 따라 배치한 기호 라벨(`temperatureContourOverlay.js` 패턴). 둥근 상자 배경은 `icon-text-fit` 이미지로 만든다.
- 제트 바탕 빗금: 연결 격자 경계 다각형 + fill-pattern(`cloudIcingModel.js`·`icingPatternOverlay.js`의 기존 경계 생성 재사용).
- 제트 축·깃·FL 라벨: 화면 좌표 Canvas 렌더러. `wafsChartRenderer.js`의 `barb`·제트 라벨 배치를 공용 모듈(`jetSymbols.js`)로 빼서 SIGWX HIGH와 함께 쓴다. 깃 간격 규칙은 화면 거리 기준으로 확대 수준에 맞춘다.
- 범례(`WeatherLegends.jsx`), 기상자료 시각 카드(`WeatherLayerTimestampBar.jsx`), 지점 조회(`weatherPointInspector.js`: 권계면 FL·기온, 최대풍 kt·FL)를 연결한다.
- 지도 스타일 교체 시 소유 리소스를 복구하고, 반응형(4개 화면폭)과 접근성(색 외 글자·모양 구분)을 지킨다.

## 4. 항로 연직 단면

- 백엔드: `gktg-cross-section.js`처럼 `tropopause-cross-section.js`가 항로 표본점의 `trop`·`vmax`·`pmax`를 같은 시각 자료에서 읽는다. 없는 시각은 다른 시각으로 채우지 않는다.
- 프런트 `VerticalProfileChart.jsx`·`crossSectionLayers.jsx`:
  - 권계면 선: 빨강 실선, `TROP` 라벨
  - 80·100·120 kt 등풍속선: 기존 단면 u·v 21층에서 계산, 녹색 점선
  - 온위 10 K 선(옅은 회색)
  - 차트 상단(150 hPa)보다 높은 권계면은 상단에 `TROP ≥ FL450` 표시
- 기관 지도의 확대 단면도 같은 상태를 공유한다.

## 5. 구현 순서(커밋 단위)

1. **계산 패키지**: `kim_tropopause` + Python 단위 시험(합성 기둥: 일반·이중 구조에서 제1 선택·탐지 불가 권계면 / 합성 제트: 직선·곡선·꺾임·영역 가장자리 / 점검 수치)
2. **수집·저장·API**: processor, store, registry, 키 장부, ADMIN 상태 + Node 시험(부분 실패, revision 불변, 취소, 키 정책)
3. **지도 권계면 면 + TROP 라벨 + 범례·시각 카드·지점 조회**
4. **지도 제트**: `jetSymbols.js` 분리(SIGWX HIGH 회귀 시험 포함), 빗금 바탕, 축·깃·라벨
5. **연직 단면**: 백엔드 표본 + 차트 표시
6. **문서**: 운영 안내 `docs/operations/kim-tropopause.md`, `docs/operations/kim-nwp-variables.md` 사용 현황, `Architecture.md`·`AGENTS.md`/`CLAUDE.md` 동기화

## 6. 검증

- `npm test`, `npm run build`(= `npm run check`).
- 브라우저 계약: 데스크톱만, 지도 토글·시간 이동·스타일 교체·단면 표시. 레이아웃 시험만 4개 화면폭.
- 수치 대조: 운영 첫 회차 F000 결과를 시험 산출(`artifacts/tropopause-test/`)과 같은 입력으로 비교. 권계면·최대풍 격자가 일치해야 한다.
- 관측 대조(오프라인 스크립트, 선택): 레윈존데 TEMP(`upp_temp.php`, 레이더·위성 키)와 관측소 좌표(`stn_inf.php?inf=UPP`, 항공 키)로 00/12 UTC 회차를 비교하는 `scripts/verify-tropopause-raob.mjs`. 결과는 `artifacts/`에 둔다.
- 화면 확인은 사용자 확인 항목으로 넘긴다: 진한 면 위 해안선·깃 가독성, 어두운 지도, 라벨 겹침, 확대 단계별 깃 간격.

## 7. 확인이 필요한 것

1. **연직 단면의 PV 음영**: 2 PVU를 권계면으로 쓰지 않기로 했으므로 단면에서도 뺀다(기본값). 성층권 공기 침투를 보는 용도로 남기려면 PV 계산과 u·v 100/70 hPa 추가(52건/회차 추가)가 필요하다.
2. **추가 입력 키**: 2026-10-04 GKTG 키 배분 변경에 맞춰 회차별 키를 쓴다(결정됨).

## 8. 위험과 제약

- KIM 보관 기간이 약 170일이라 겨울 사례는 지금 검증할 수 없다. 운영 후 겨울 회차를 관측과 대조한다.
- 같은 작업 트리에서 다른 세션이 `VerticalProfileChart.jsx`·`weatherOverlayLayers.js` 등 같은 파일을 수정 중이다. 4·5단계 전에 그 변경이 커밋되었는지 확인하고, 커밋 전마다 브랜치를 확인한다.
- 의존성 변경은 없다. 새 Python 패키지는 기존 GKTG 가상환경(NumPy)을 쓰므로 빠른 배포로 반영된다. 의존성이 늘어나면 `deploy/deploy-vm-full.sh`의 `setup-gktg-python.sh` 경로로 설치해야 한다.
- 판정 기준값(축 30 km 제한, 50 km 숨김, 깃 간격 규칙, FL450 상한·1° 평활)은 7회차로 정한 값이다. 운영 자료가 쌓이면 다시 맞춘다.

## 9. 후속 과제(이번 범위 밖)

2026-10-04 검토에서 나온 연계 후보로, 이번 구현에는 넣지 않았다.

1. 순항고도 비교(`altitude-weather-comparison.js`): 후보 고도별 권계면 대비 높이, 100 kt 이상 제트 핵 근접 거리.
2. AI 기상이: 1번 결과의 자동 반영, 지도 토글 화면 조작(`shared/copilot-ui-actions.js`).
3. 항로 구간표(`route-weather-legs.js`): 구간별 권계면 FL·최대풍.
4. 위성 운정고도·에코톱 카드: 권계면 돌파 가능 표시.
5. 기관 고정 자료 모드, 지점 조회 카드, 스냅샷 준비 점검 연결.

