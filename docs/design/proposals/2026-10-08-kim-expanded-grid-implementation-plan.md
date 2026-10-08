# KIM 확대 영역 구현 계획

**목표:** KIM 전구모델 수집 영역을 한반도(119–136°E, 30–44°N, 205×169)에서 확대 영역(100–145°E, 6–50°N, 541×529)으로
넓힌다. 현재 서버(t3.small, 2 vCPU, RAM 약 1.9 GiB, 디스크 30 GB)를 유지하고, 대용량 키(2026-10-07~11-06,
KST 15:00~24:00, 일 2 TB, 호출 건수 제한 없음)로 받는다.

**근거와 결정:** [KIM 격자 확대 검토](../../operations/kim-grid-scaling.md). 이 계획은 그 문서의 결정 사항,
운영안, 관리 방법, 프론트엔드 제공 방식을 구현 순서로 옮긴 것이다. 수치(호출·시간·용량)는 그 문서가 정본이다.

## 영역 변경 (2026-10-08 결정)

확대 영역을 **90~160°E, 6~50°N(841×529, 기존 확대 시험 영역의 1.55배)** 으로 정했다. 데스크톱 가로 화면 비율, 그리고
100°E·145°E 경계에 방콕(100.5°E)·괌(144.8°E)이 걸려 GKTG 가장자리 10칸(약 0.83°) 비움에 들어가는 문제 때문이다.
요청 범위 `sub=1081,1153,1921,1681`.

운영 서버 대용량 API 전송 실측(2026-10-08 18시대, 이 영역, 예보시각당 147건·858 MB): 동시 4건 초당 2.7 MB,
동시 8건 초당 9.1~9.7 MB. **확대 영역 수집은 동시 8건**으로 한다. 이때 06 UTC 33개(약 51 GB) 다운로드는 약 90분
(20:15 → 약 21:45). 측정 중 서버 사용 가능 RAM 최소 867 MiB, health 200 유지.
로컬 실측(100~145°E, 13시각, 동시 4건): 기본 수집 24.5분·3,818건·실패 0.

아래 표의 시간·용량은 100~145°E 기준이며 이 영역에서는 약 1.55배다.

## 결정 요약

| 항목 | 결정 |
|---|---|
| 수집 | 한반도: 일반 키, 00·12·18 UTC(+0~12h 1시간). 06 UTC 한반도는 확대 영역에서 잘라 게시. 확대: 대용량 키 00 UTC 29개(+24h 1시간, +36h 3시간), 06 UTC 33개(+24h 1시간, +48h 3시간) |
| 저장 | NetCDF-4, zlib 4, shuffle, 128×128 블록, 예보시각별 파일. raw 보조 입력도 NC |
| 계산 | GKTG 192×192 창·24격자 겹침(확대 16블록), 영역 전체 온위 범위·고도 구간을 먼저 구함. 권계면은 영역 전체. 무거운 작업 동시 1개, 순번 단위는 예보시각 |
| 프론트엔드 | 브라우저 렌더링 유지. 지점 조회 API, int16 바이너리 전송, 캐시 바이트 상한·래스터 해상도 조절, 화면 범위 요청 |
| 관리 | 영역별 보관(게시 1 + 수집 1), 디스크·메모리 보호선, 23:50 요청 중단, 부분 회차 게시 기준(00 UTC +15h, 06 UTC +27h), 만료·키 오류 시 자동 전환, `bulk` 사용량 분류, 텔레그램 알림 |

## 확인된 기술 사항

- 블록 분할 GKTG는 확대 영역 전체 계산과 552만여 개 값이 모두 같다(2026-10-07 로컬 검증).
- Node.js에서 `h5wasm` 0.10.3으로 NetCDF-4(zlib·shuffle)를 읽을 수 있다(2026-10-08 확인). 확대 영역 필드 하나 전체 7 ms,
  130×160 범위 1 ms, 한 지점 0.3 ms, 63개 필드 169 ms·RSS +49 MiB. 값은 Python `netCDF4`와 일치.
- 쓰기는 Python `netCDF4`가 담당한다. Node는 읽기만 한다.

## 공통 제약

- 시각은 UTC 또는 epoch로 저장·비교한다. 대용량 키 사용시간·만료일만 KST로 해석한다.
- 수집·계산이 일부 실패해도 마지막 정상 게시 회차를 유지한다. 상류 자료는 경계에서 검증한다.
- 백엔드는 프론트엔드 코드를 가져오지 않는다.
- 새 의존성(`h5wasm`, Python `netCDF4`)은 `deploy/deploy-vm-full.sh`로 배포한다. fast deploy는 의존성을 설치하지 않는다.
- 각 단계는 단독으로 배포 가능해야 하고, 확대 영역 수집은 설정 플래그(`KIM_EXPANDED_ENABLED`)가 켜질 때만 동작한다.
- 브라우저 계약은 데스크톱 기준으로 짧게 유지하고, 레이아웃 변경일 때만 4개 화면 크기를 본다.

## 결정 필요

- **지도에 보일 회차 선택.** 한반도 단독 회차(12·18 UTC)는 확대 회차보다 새롭지만 영역이 좁다.
  권장: 지도 레이어는 확대 회차 하나로 통일하고, 한반도 단독 회차는 브리핑·항로 단면·공항 비교 등 국내 수치 기능과
  확대 회차가 없을 때의 지도에 쓴다. 한 화면에서 회차를 섞지 않는다. 4단계 시작 전에 확정한다.

## 진행 묶음

기존 영역의 저장 방식을 먼저 바꾸고 안정화한 뒤 확대 영역을 진행한다(2026-10-08 결정).
NC 전환 문제는 한반도 영역에서 먼저 드러나게 하고, 확대 영역 문제와 섞지 않는다.

| 묶음 | 작업 | 대상 | 끝 조건 |
|---|---|---|---|
| **1차: 기존 영역 NC 전환** | D-3, D-5 → 0-1 → 1-1 → 1-2(+D-2) → 1-3(+D-1) → 1-4 → D-4 → 5-3 | 한반도 영역 | 운영 반영 후 D-1 대조 1주 일치, 3일 정상 게시 |
| **2차: 확대 영역** | 2-1~2-3, 3-1, 3-2, 3-3, 4-1~4-5(+D-2 관리자 화면 표시), 5-2, 5-4, 6 | 확대 영역 | 6단계 운영 적용 |

- 3-1의 블록 계산은 한반도 영역(205×169)이 창(192×192)보다 커서 1차에는 필요 없으므로 2차에 둔다.
  1차의 3-2·3-3은 NC 직접 입력과 예보시각 순번만 적용한다.
- 대용량 키가 2026-11-06에 끝나므로 1차는 2주 안쪽을 목표로 한다.

## 1차 진행 기록 (2026-10-08, 브랜치 `feat/kim-nc-store`)

| 작업 | 상태 | 내용 |
|---|---|---|
| D-1 동시 저장·대조 | 완료 | `KIM_STORE_FORMAT=both`: NC를 쓰자마자 다시 읽어 비교, 불일치는 NC 삭제 + `store_check_mismatch` 기록. 관리자 화면 경고는 하지 않고 `kim-inspect --compare`·`--events`로 확인한다 |
| D-2 회차 진행 기록 | 완료 | `kim-run-events.js`: 기본 수집 결과·게시, GKTG·권계면 시각별 계산/재사용·실패, 게시, 정리, 저장 대조 |
| D-3 점검 명령 | 완료 | `scripts/kim-inspect.mjs` |
| D-4 재처리 | 완료 | `scripts/kim-replay.mjs`(운영 경로 거부). 운영 회차로 재계산한 GKTG 42·권계면 2 revision이 운영 게시본과 같음 |
| D-5 시험 자료 | 완료 | `backend/test/fixtures/kim-grid-850hpa-24x24.json`(실제 값) |
| 0-1 정리 시점 | 완료 | GKTG·권계면 게시 직후에도 정리. 이때는 완성 회차만 지워 수집 중 회차를 보호 |
| 1-1~1-4 NC 저장 | 완료(방식 변경) | Python 묶기 대신 Node(`h5wasm`, 기존 의존성)가 문서 단위 NC를 직접 쓴다. 기존 `.json` 경로 옆 `.nc`, 읽으면 JSON과 키 순서까지 같은 객체. raw 텍스트는 NC 대신 gzip(머리말 검증 유지) |
| 신규 | 완료 | `scripts/kim-store-convert.mjs`(기존 JSON 회차 → NC, 문서별 대조) |
| 3-2·3-3 | 2차로 이동 | 한반도 영역은 Node가 큐브를 만들어 넘겨도 메모리 문제가 없고, Python에 NC 의존성을 더하지 않기 위해 |
| 5-1 지점 조회 API | 하지 않음 | 지점 조회는 이미 화면에 그리는 필드에서 값을 꺼내 추가 수신이 없다. 줄어드는 것은 지위고도 배열뿐인데 바이너리로는 확대 영역 0.08 MB. 클릭 지연·보간 이중 구현 위험이 더 크다 |
| 5-2 바이너리 전송 | 2차로 이동 | 한반도 필드는 gzip 12~250 KB로 이득이 작고, 렌더러가 일반 배열·null을 전제로 해 typed array 전환은 화면 범위 요청(5-4)과 함께 한다 |
| 5-3 캐시 상한 | 완료 | `kimFieldCache.js`: 6개 KIM 레이어 공용 64 MB LRU |

운영 반영: 2026-10-08 01:37 KST `both` 배포 → 00 UTC 회차 문서 585개 대조 일치·저장 대조 불일치 0 →
15:54 `nc` 전환(b6e06a13) → 기존 JSON 585개 변환·삭제. `kim_nwp` 약 0.8 GB → 143 MB. 전환 전후 KIM API 응답 10개 동일.
1주 대조는 대용량 키 만료(11-06)를 고려해 사용자 결정으로 줄였다.

실측(운영 회차 KIMG_NE57_2026100706, 이 PC):

- 문서 585개 JSON 664 MB → NC 141 MB(79% 감소), raw 텍스트 77.5 MB → gzip 9.4 MB. 회차 약 741 MB → 약 150 MB.
- 585개 문서 모두 JSON과 같음. KIM API 36개 응답(지도 필드·GKTG·권계면·항로 단면) 바이트 단위로 같음.
- 변환 20초·최대 RSS 264 MB. 문서 읽기 JSON 4.6 ms → NC 7.9 ms(GKTG 한 회차 입력 273개 기준 약 +1초).
- `h5wasm`은 shuffle 필터를 쓸 수 없어 벤치마크(shuffle+zlib 4)보다 약 34% 크다. 확대 영역 최대 디스크 추정은 약 7.9 GB → 약 9.5 GB.
- 백엔드 시험은 json·both·nc 세 형식 모두 1,497개 통과, 프론트 1,845개 통과, 빌드 정상.

## 2차 진행 기록 (2026-10-08, 로컬 시제품)

운영 반영 전, 이 PC에서 대용량 키로 확대 영역을 받아 화면에 띄우며 확인했다(`artifacts/kim-expanded-local/`,
데이터 `artifacts/kim-expanded-local/data`, 실행 `node artifacts/kim-expanded-local/run.mjs [base|gktg|tropopause|all]`,
화면 `DATA_PATH=... KIM_STORE_FORMAT=nc npm run dev:test`). 영역은 시제품 당시 100~145°E였고, 이후 90~160°E로 정했다.

### 백엔드 (커밋 `3ba430b4`, 미배포)

- 대용량 키: `KIM_USE_BULK_KEY=1`이면 KIM 격자 호출이 모두 `KMA_BULK_AUTH_KEY`·대용량 호스트로 간다. KST 15~24시·
  승인 기간 밖이면 일반 키로 넘어가지 않고 실패한다(`kim-run-credential.js`). API 등록부가 대용량 호스트를 인정하고,
  사용량 장부에 `bulk` 분류(한도 2 TB, 키가 설정된 서버에서만 표시)가 생겼다. 4-1 일부.
- GKTG 격자 고정(205×169) 검사 제거(JS·Python). 1/12° 간격·최소 크기만 확인. 2-1 일부.
  배포하면 GKTG 엔진 revision이 바뀌어 한반도 회차를 한 번 다시 계산한다(결과 동일).
- 추가 입력 머리말 영역 비교를 공백 개수와 무관하게 했다. 기상청은 한 자리 위도를 `lat1 =  6.0`처럼 두 칸 띄워
  확대 영역 GKTG·권계면 추가 입력이 모두 "identity mismatch"로 거부됐다.

### 로컬 실측 (100~145°E, 00 UTC 13시각, 동시 4건)

- 기본 수집 24.5분, 3,818건, 실패 0. NC 약 0.98 GB(예보시각당 약 75 MB).
- GKTG 영역 전체 한 번 계산 예보시각당 약 61초, Node 최대 RSS 약 4.07 GB, 계산용 임시 `input.json` 약 300 MB.
  Node가 큐브를 JSON으로 넘기는 구조 때문이라 서버에는 3-2(Python이 NC 직접 읽기)가 필요하다.
- 권계면 예보시각당 약 60초, 최대 RSS 약 1.47 GB.
- 화면: 바람·기온·난류·권계면이 확대 영역 전체에 표시되고 시각·고도 전환도 빠르다(사용자 확인).

### 지면 아래 기압면 표시 (미커밋)

- 고원·산지에서 지상기압보다 큰 기압면은 모델 외삽값이다. 확대 영역 서쪽(티베트 고원 동쪽)에서 850·700 hPa GKTG가
  지면 아래인데도 LGT~SEV로 칠해졌다. 예보관용 고층 일기도(지형 회색 처리)·AWC 뷰어("Below Surface")의 관례를 따라 가린다.
- `backend/src/processors/kim-surface-mask.js`: GKTG 추가 입력으로 이미 받은 `ps` 원문 캐시로 지면 아래 격자를 구한다
  (새 API 호출 없음). `/api/kim/gktg/field`가 그 격자 값을 비우고 `belowGround`(bitset-base64-v1)를 붙인다.
  ETag에 `below-ground-v1`, 프론트 요청에 `view=bg1`을 붙여 immutable 캐시의 이전 응답과 구분한다.
- 프론트: 난류 이미지 안에서 지면 아래 칸을 회색 단색으로 칠한다(`kimBelowGround.js`). 별도 벡터 빗금 레이어는
  이미지 칸과 미세하게 어긋나 버렸다. 지점 조회는 "난류 · 지면 아래".
- 지금은 GKTG만 적용. 바람·기온·구름·착빙은 같은 방식으로 이어 적용한다.
- 마스크 경계 바로 바깥에 난류 띠가 남는 것은 GKTG 특성이다. 지면 위 0~25 hPa에서 700 hPa MOD 이상 35%,
  200 hPa 이상 0.6%. 산악파 항이 지형+1,500 m 이하를 키우는 원본 설계(`python_port.py` `mountain_multiplier`)라 지우지 않는다.

### 이미지 레이어 위치 보정 (미커밋, 운영 한반도에도 해당)

- 이미지 레이어(난류·기온·구름·착빙·바람 풍속·KTG·난류 실험)는 위도 간격이 일정한 격자 이미지를 지도 네 모서리에
  늘려 붙였다. 지도는 Web Mercator라 중간 위도가 밀렸다: **한반도 30~44°N 최대 약 36 km, 확대 6~50°N 최대 약 270 km**.
  권계면만 이미 보정돼 있었다.
- `overlayUtils.js`: `cellCoordinatesForGrid`(이미지 모서리를 격자 칸 바깥 경계에) + `mercatorSourceRows`(이미지 각 행의
  Mercator 위도에 해당하는 격자 행). 행 배율 `RASTER_ROW_SCALE=1`: 4배로 했더니 고도·시간 전환이 눈에 띄게 늦어 되돌렸다.
  남는 오차는 반 칸(약 4 km) 이내.

### 바람 애니메이션 (미커밋)

현황: 넓은 화면에서 입자가 점처럼 보이고, 너무 빽빽하고, 저층 속도 차이가 안 보였다.

| 원인 | 조치 |
|---|---|
| 입자 이동이 경위도 고정량이라 축소하면 프레임당 0.15 px(꼬리 1~2 px) | 수치모델 바람에도 `zoomSpeedReference: 6`(지상일기도 바람과 같은 보정) |
| WebGL 선 굵기가 대부분 브라우저에서 1 px 고정이라 선 굵기 설정이 꼬리에 반영 안 됨 | 꼬리를 사각형(삼각형 2개)으로 그림 |
| 입자 수가 화면 넓이 비례(데스크톱 약 3,200개), 줌 5 이하 감소 없음 | 줌 3 이하 45%, 3~5 선형 증가 |
| 전 고도 공통 범례에서 저층(바람 90%가 0~30 kt)이 파랑~초록 3~4색 | 범례는 하나로 유지(같은 색 = 같은 풍속), 0~30 kt를 5 kt마다 다른 색, 12구간 |

고도별 범례는 같은 색이 고도마다 다른 풍속이 되어 고도 간 비교가 헷갈려 택하지 않았다.
실제 분포(00 UTC +9h): 10m 중앙값 7 kt·상위 10% 18 kt, 850 hPa 10·20 kt, 250 hPa 28·86 kt.

### 임시 기능

- `frontend/src/features/map/KimDomainPreview.jsx`: 개발 서버 전용 "KIM 영역 비교" 버튼(영역 후보 사각형, 가장자리 10칸
  경계, 주요 공항). 영역을 정했으므로 다음 커밋 전에 지운다.

### 영역 일반화 (2026-10-08, 2-1~2-3 + 예보시각·API)

- 저장 위치는 계획(`runs/kr/…`)과 다르게 정했다: **한반도는 기존 `kim_nwp/` 그대로, 확대 영역은 `kim_nwp_ea/`**.
  운영 자료·시연 스냅샷을 옮기지 않고, 한반도 경로를 직접 쓰는 기능(운고·브리핑·단면·기관 브리핑)을 고치지 않아도 된다.
- `backend/src/processors/kim-domain.js`: 영역 `kr`·`ea`의 저장 폴더, 저장 가능한 예보시각(`ea`는 +0~24h 1시간·+27~48h 3시간),
  대용량 키 전용 여부. 요청 범위는 `config.kim_expanded`(`sub=1081,1153,1921,1681`, 90~160°E·6~50°N).
- 저장소 함수 전체·기본 수집기·GKTG·권계면·지면 아래 표시가 `domain`(기본 `kr`)을 받는다. latest·index·파생 게시·회차 정리가
  영역별로 따로다(2-2·2-3). 캐시·지문은 경로가 영역별이라 따로 구분할 것이 없다.
- 확대 영역은 설정(`KIM_USE_BULK_KEY`)과 관계없이 대용량 키만 쓴다. 공항 비교·지상바람 스냅샷은 한반도 전용.
- API: `/api/kim/*/index`·`/field`·`/tropopause/runs`가 `?domain=kr|ea`(없으면 `kr`)를 받고, index 응답에 `domain`을 붙인다.
  한반도 ETag는 그대로라 브라우저 캐시가 유지된다. `kim-inspect --domain ea`.
- 시험: `kim-domain.test.js`(영역 해석, 요청 범위, 예보시각, 같은 회차 분리 저장, 영역별 정리, 확대 권계면 +30h 대용량 키),
  `kim-domain-api.test.js`(영역별 응답·ETag, 잘못된 영역 400).
- 남은 일: 프론트는 아직 `domain`을 보내지 않는다(지도 회차 선택 결정 후). 확대 영역 수집 일정·회차별 예보시각은 4단계.

### 계산 구조 3-1: GKTG 블록 계산 (2026-10-08)

- 입력 방식은 계획("Python이 NC 직접 읽기")과 다르게 정했다: **Node가 기본 격자를 한 층씩 읽어 float32 파일로 쓰고
  Python이 블록 창만 읽는다.** 서버 Python 환경(NumPy·Numba)에 NetCDF 라이브러리를 더하지 않아 전체 배포가 필요 없고,
  Node가 21층 큐브를 JSON으로 들고 있던 문제(확대 영역 Node 약 4 GB)가 없어진다.
  `job.json` + `cube.f32`(u·v·w·T·q·hgt × 기압면 × y × x) + `surface.f32`(ps·topo·hpbl) → `gktg.f32`.
- `calculate.py`: 192×192 창·24칸 겹침(결과 144×144). 영역 면적이 192×192 이하면 한 번에 계산(한반도). 확대 영역(841×529)은 24블록.
  계산 전에 영역 전체의 온위 범위(계산 마스크 안)와 고도 구간(서쪽 두 열)을 구해 블록마다 넣는다. 블록 결과는 결과 파일에 바로 쓴다.
- 엔진: `Geometry(frame=)`(위도·격자 간격을 영역 전체 기준), `front_theta(theta_range=)`, `calculate(cube, context)`. 인자가 없으면 기존과 같다.
- Node: 입력 변경 감지를 기본 격자 21층 재읽기 대신 파일 지문(inode·크기·수정 시각)으로 한다. `inputRevision`은 float32 입력 값으로 만든다
  (엔진 파일도 바뀌어 배포 후 한반도 GKTG를 한 번 다시 계산한다. 결과는 같다). Python 제한시간은 블록마다 다시 잰다(`KIM_GKTG_TIMEOUT_MS`).
- 검증(이 PC):

  | 입력 | 비교 대상 | 결과 | Python 최대 메모리 | 시간 |
  |---|---|---|---:|---:|
  | 한반도 운영 회차 +6h (2026-10-07 측정 입력) | 운영 서버 게시값 | 564,921값 차이 0, 결측 위치 같음 | 409 MiB | 2.6초 |
  | 확대 영역 100~145°E +6h (같은 측정 입력) | 영역 전체 한 번 계산 | 5,525,793값 차이 0 | 530 MiB | 24초(16블록) |
  | 확대 영역 2026100800 +0h, Node부터 끝까지 | 이전 경로(JSON 큐브)로 게시한 값 | 5,525,793값 차이 0 | — | 34초 |

  처음 memmap으로 읽었을 때 677 MiB, 창만 읽게 바꿔 553 MiB, 블록 결과를 파일에 바로 써 530 MiB.
  기준은 "Python 600 MiB 안, 서버 남은 메모리 512 MiB 이상은 3-3의 대기로 보장"으로 정했다(창 176은 메모리는 줄지만 블록 35개로 시간 약 25% 증가).
- 선택 읽기: 층 문서(NC)는 변수별 배열이 파일 안에 따로 저장돼 있어 GKTG는 6개 변수만 연다(`readKimDocumentArrays`,
  `readKimNwpGridVariables`). 저장 구조를 나누거나 계산 전용 파일을 새로 만드는 안(A)은 택하지 않았다.
- 단계별 시간·Node 메모리(확대 영역 100~145°E +0h, 이 PC): Node 입력 준비 1.1초(276 MiB) → Python 24.9초 → Node 결과 저장·게시 4.5초,
  Node 최대 826 MiB(결과 저장·게시 단계). 전체의 약 80%가 Python 계산이라 시간을 줄이려면 계산 가속(Numba)이 필요하다.
- **3-3에서 다룰 것:** Node 쪽 결과 저장·게시 확인 단계(GKTG 21장 NC 쓰기·다시 읽기)에서 확대 영역 Node 메모리가 868 MiB까지 오른다
  (힙 한도 256 MB로 돌리면 566 MiB, 계산 중에는 약 220 MiB). 파생 계산 자식의 힙 한도(지금 1024 MB)를 낮추고 h5wasm 메모리를 확인한다.

### 계산 구조 3-2: 권계면 입력 (2026-10-08)

- GKTG와 같은 방식: Node가 필요한 변수만 층별로 읽어 `job.json` + `cube.f8`을 쓰고 Python이 읽는다. 권계면 계산은 float64라
  float64로 넘긴다(T·hgt 21층+100·70 hPa, u·v는 제트 탐색 층 500~150 hPa 8개만).
- 블록 분할은 하지 않는다. 제트 축 추적의 평활(box)이 영역 전체 누적합이라 나누면 마지막 자리가 달라질 수 있다. 대신 바람을
  탐색 층만 넘겨 입력을 줄였다(계산 순서·값은 그대로). 계획의 "영역 전체 507 MiB"는 100~145°E 측정이라 90~160°E에서는 넘을 수 있었다.
- 입력 변경 감지는 GKTG와 같이 파일 지문으로 바꿨다.
- 검증(확대 영역 2026100800 +0h, 이 PC): 이전 경로가 게시한 권계면·기온·위쪽 표시·최대풍·기압·제트 축·검사값·단면 상층 모두 같음.
  Node 준비 1.0초 → Python 18.5초(최대 305 MiB) → Node 저장 1.1초, Node 최대 305 MiB. 90~160°E는 Python 약 470 MiB로 예상.

### 계산 가속: 권계면 열적 판정 Numba (2026-10-08)

- 함수별 측정: 권계면 한 시각(확대 영역) 시간의 거의 전부가 `thermal.py` 기둥별 판정(순수 Python, 보간 690만 회)이었다.
  GKTG(한반도 한 시각 2.3초)는 약 40%가 이미 Numba인 EDR 구조함수이고 나머지는 여러 함수에 고르게 퍼져 있다.
- `thermal.py`의 `column`·`_field`를 Numba로 컴파일했다. 평균은 NumPy와 같은 합산 순서(pairwise)로 계산한다.
- 차이: 거듭제곱(p^κ)이 NumPy 자체 구현과 C 라이브러리 구현에서 끝자리가 달라 권계면 기압이 최대 4×10⁻¹³ hPa 다르다.
  게시값(권계면 0.1 hPa, 기온 0.01 °C 반올림)은 같다: 확대 영역 2026100800 13개 시각, 권계면·기온 7,437,944값과
  위쪽 표시·최대풍·제트 축·검사값·단면 상층 모두 이전 경로 게시값과 같음.
- 속도: 열적 판정 17.3초 → 2.3초, 권계면 한 시각 전체(Node 포함) 약 20초 → 약 5.6초(이 PC).
- 컴파일 결과는 GKTG와 같은 `NUMBA_CACHE_DIR`(`config.kim_gktg.cache_path`)에 둔다.

### 재개 안내 (2026-10-08 19시경 기준)

2차는 로컬 시제품으로 "되는지 확인"까지 끝났다. 운영에는 아직 아무것도 들어가지 않았다.

| 작업 | 상태 |
|---|---|
| 영역 결정(90~160°E)·서버 전송 실측 | 완료 |
| 대용량 키 사용(4-1 일부)·GKTG 격자 고정 해제(2-1 일부)·머리말 공백 수정 | 커밋 `3ba430b4`, 미배포 |
| 지면 아래 표시 | GKTG만, 커밋 `20cea312` |
| 이미지 위치 보정·바람 애니메이션 | 커밋 `20cea312` |
| 영역 일반화(2-1~2-3, 예보시각, API 영역 인자) | 완료(위 "영역 일반화") |
| 계산 구조(3-1~3-3) | 3-1·3-2 완료(위 기록). 3-3(순번·메모리) 남음 |
| 확대 영역 수집기(4단계) | 미착수 |
| 프론트 전송(5-2·5-4) | 미착수 |
| 운영 적용(6단계) | 미착수 |

작업 위치: 브랜치 `feat/kim-nc-store`(origin/main = `99c56d3d` + 커밋 `3ba430b4`). 미커밋 파일:
`backend/server.js`, `backend/src/processors/kim-surface-mask.js`(신규), `frontend/src/api/weatherApi.js`,
`frontend/src/features/weather-overlays/lib/`의 `overlayUtils.js`·`kimBelowGround.js`(신규)·`gktgOverlaySync.js`·
`temperatureOverlaySync.js`·`cloudPotentialOverlaySync.js`·`icingPotentialOverlaySync.js`·`ktgTurbulenceOverlaySync.js`·
`turbulenceExperimentOverlay.js`·`windOverlaySync.js`·`webglWindRenderer.js`·`windField.js`·`useNwpOverlays.js`·
`weatherPointInspector.js`와 해당 시험 파일(`mercatorSourceRows.test.js` 신규), `Architecture.md`, 이 문서.
`frontend/src/features/map/KimDomainPreview.jsx`(신규)와 `MapView.jsx`의 그 마운트 한 줄은 임시 기능이라 커밋하지 않고 지운다.
`docs/operations/kim-tropopause.md`, `tropopauseJetModel.js`·`.test.js`, `tropopauseJetPresentation.js`는 다른 작업(권계면 제트)의
미커밋 변경이라 이 작업 커밋에 넣지 않는다.

다음 순서(권장):

1. **정리·먼저 배포.** 임시 영역 비교 버튼 삭제 → 미커밋 변경 커밋(위 제외 파일 빼고) → `npm test`(백엔드·프론트) →
   main 병합·push → 운영 fast deploy. 한반도 운영의 이미지 최대 36 km 어긋남과 바람 애니메이션이 바로 개선된다.
   함께 배포되는 대용량 키 지원은 운영에 키가 없어 동작이 바뀌지 않고, GKTG는 엔진 revision 변경으로 한 번 재계산된다.
   배포 후 브라우저에서 바람·난류를 보고, 사용자 브라우저 캐시는 `view=bg1`로 구분된다.
2. **지면 아래 표시 확대.** 바람·기온·구름·착빙 필드 응답에도 `applyKimBelowGround`를 적용하고, 각 이미지 빌더에서 회색 칸,
   지점 조회 "지면 아래". 정수 인코딩 배열(u·v·T 등)은 결측값(-32768)으로 비우는 방식과 렌더러 결측 처리를 확인한다.
   각 필드 요청에도 `view` 인자를 붙여 캐시를 구분한다.
3. **계산 구조(3-1~3-3).** Python이 NC를 직접 읽고(3-2), GKTG 192×192 창·24격자 겹침 블록 계산(3-1, `scripts/benchmark-kim-compute.py`의
   `install_tile_context`를 정식화), 예보시각 단위 순번·메모리 보호(3-3).
4. **영역 일반화(2-1~2-3) → 수집기(4단계, 90~160°E·`sub=1081,1153,1921,1681`·동시 8건) → 운영 적용(6단계).**
5. 프론트 전송(5-2·5-4)은 운영 적용 후 반응을 보고 진행.

로컬 시제품 재현: 대용량 키 사용시간(KST 15~24시)에만 수집 가능. 이미 받은 00 UTC 회차가
`artifacts/kim-expanded-local/data`에 있어 화면 확인은 언제든 `DATA_PATH=/home/john_doe/ProjectAMO/artifacts/kim-expanded-local/data
KIM_STORE_FORMAT=nc KIM_USE_BULK_KEY=0 npm run dev:test`로 할 수 있다(100~145°E 자료).

## 디버깅 기반

저장 형식·계산 구조·수집 일정·전송 방식이 함께 바뀌므로, 문제가 어느 단계에서 생겼는지 짚을 수 있는 도구를
1차 묶음 맨 앞에 만든다.

**D-1. JSON·NC 동시 저장과 자동 대조**

- 설정 `KIM_STORE_FORMAT=json|nc|both`. 1차 운영 반영 후 1주는 `both`.
- 회차 게시 때마다 두 형식의 값·결측 위치·메타데이터와 `/api/kim/*/field` 응답을 비교해 회차 진행 기록(D-2)에 남기고,
  불일치가 있으면 관리자 화면 경고. 1주 연속 일치하면 `nc`로 바꾸고 JSON 쓰기를 끈다. 동시 저장 중 추가 디스크는 회차당 약 0.15 GB.

**D-2. 회차 진행 기록**

- 회차 폴더의 `events.jsonl`(크기 상한, 회차와 함께 삭제). 키 원문·응답 본문은 쓰지 않는다.
- 사건: 요청(예보시각·변수·바이트·소요·HTTP 상태·재시도·키 분류), NC 묶기(소요·최대 RSS), 계산 블록(창·소요·최대 RSS·
  시작 시 MemAvailable), 보호선 작동(디스크·메모리·사용시간·만료), 게시 판단(게시/보류와 이유, 받은 예보 범위), 대조 결과(D-1).
- 2차에서 관리자 수집 시간표의 확대 영역 행에서 최근 사건을 볼 수 있게 한다.

**D-3. 회차 점검 명령**

- `node scripts/kim-inspect.mjs [--domain kr] [--run <tmfc>] [--hf N] [--var base/850hPa/T] [--point lat,lon]`
- 출력: 영역별 게시 중·수집 중 회차, 예보시각별 완성 여부, 변수별 최소·최대·결측 수, 파일 크기, GKTG·권계면 게시 revision,
  지정 지점 값. JSON·NC 회차 모두 읽는다. 운영 서버에서 읽기 전용으로 실행 가능.

**D-4. 재처리 모드**

- `DATA_PATH`를 별도 폴더로 두고 저장된 회차 NC로 NC 묶기·계산·게시를 다시 실행한다. 네트워크 호출 없음.
- 운영 회차를 로컬로 가져와 운영에서만 나는 문제를 재현한다(기상청 일일 한도를 쓰지 않는다).

**D-5. 시험용 작은 NC 자료**

- 실제 회차에서 잘라낸 작은 영역(예: 24×24, 예보시각 1개, 21층)을 `backend/test/fixtures/`에 둔다.
- NC 읽기·쓰기, 결측 처리, 블록 계산 동일성, 지점 조회 보간의 단위 시험에 쓴다.

## 단계

아래 번호는 작업 식별용이고, 진행 순서는 위 묶음을 따른다. 각 작업의 완료 기준을 통과해야 다음 작업으로 간다. 검증 명령은 `npm test`(백엔드·프론트 단위),
`npm run build`, 필요 시 `npm run dev:contract -- --grep <id>`.

### 0단계. 사전 정리 (확대 영역과 무관, 바로 적용)

**0-1. 이전 회차 정리 시점 수정**

- 파일: `backend/src/processors/kim-nwp-store.js`(`cleanupKimNwpRuns`), `backend/src/processors/kim-gktg-processor.js`,
  `backend/src/processors/kim-tropopause-processor.js`
- GKTG·권계면 게시 직후에도 정리를 실행해, 평소 한반도 회차를 1개만 남긴다(`KIM_NWP_MAX_RUNS=1` 운영값).
- 완료 기준: 단위 시험(게시 직후 이전 회차 삭제, 수집 중·핀 고정·부분 24시간 이내 회차 유지). 운영에서 다음 회차 게시 후
  `kim_nwp/runs/`에 완성 회차 1개. 약 0.7 GB 확보.

### 1단계. NC 저장 전환 (한반도 영역에서 결과 동일성 확보)

**1-1. Python NC 저장 도구**

- 생성: `backend/python/kim_store/pack.py`, `backend/python/kim_store/requirements.txt`(또는 기존 venv 요구사항에 `netCDF4` 추가)
- 입력: 예보시각 하나의 임시 int16 배열 파일들과 메타데이터 JSON. 출력: `normalized/hf###.nc`
  (그룹 `base/<level>/<var>`, `upper/p<level>/<var>`, `surface/<name>`, 변수별 scale·offset·결측값 속성).
- 쓰기 cache를 변수 단위로 작게 두어 예보시각 하나 저장 최대 RSS < 300 MiB(전 회차 일괄 608 MiB 대비).
- 완료 기준: 2026-10-07 벤치마크와 같은 무손실 대조(값·결측 위치·메타데이터), 메모리 기록.

**1-2. 수집기 저장 경로 변경**

- 파일: `backend/src/processors/kim-surface-wind-processor.js`, `backend/src/processors/kim-nwp-store.js`
- 응답을 파싱해 int16 배열로 임시 파일에 쓰고, 예보시각이 모이면 1-1로 묶는다. GKTG·권계면 보조 입력(`raw/`)도 NC로.
- 임시 파일은 묶은 뒤 즉시 삭제. 실패 시 이어받기를 위해 완료된 예보시각 NC는 유지.

**1-3. Node 읽기 경로 변경**

- 파일: `backend/src/processors/kim-nwp-store.js`(읽기 함수들), `backend/package.json`(`h5wasm`)
- `readKimNwpGrid` 등은 기존과 같은 모양의 객체를 돌려준다. 값은 `Int16Array`.
  JSON 응답을 만드는 곳(`backend/server.js`의 `/api/kim/*/field`)은 5단계 전까지 배열로 변환해 기존 응답을 유지한다.
- 전환 기간에는 JSON 회차와 NC 회차를 모두 읽는다(시연 스냅샷 `snapshots/demo/kim_nwp` 포함).
- 읽는 곳 전체: `airport-model-comparison/kim.js`, `briefing/enroute-cross-section.js`, `briefing/gktg-cross-section.js`,
  `briefing/tropopause-cross-section.js`, `briefing/pinned-map-resources.js`, `briefing/organization-runtime.js`,
  `organizations/briefing.js`, `server.js`. 모두 store 함수를 거치는지 확인하고 직접 파일을 여는 곳은 store로 옮긴다.

**1-4. 파생 결과(GKTG·권계면) NC 저장**

- 파일: `backend/python/kim_turbulence/calculate.py`, `backend/python/kim_tropopause/calculate.py`, `kim-nwp-store.js`
- 계산 결과를 `derived/<product>/hf###.nc`로 쓴다. 게시 지문·revision 계산은 파일 지문 방식 유지.

**1단계 완료 기준**

- 같은 한반도 회차를 JSON 경로와 NC 경로로 각각 처리해 `/api/kim/*/field`, 지점·항로 단면 응답이 바이트 단위로 같다.
- 운영 한 회차 저장량 0.71 GB → 약 0.12~0.19 GB.
- 전체 배포(`deploy-vm-full.sh`) 후 3회차 연속 정상 게시.

### 2단계. 영역 일반화

**2-1. 격자 정의를 설정에서**

- 파일: `backend/src/config.js`(`kim_surface_wind.grid`를 영역 목록 `kim_domains: { kr, ea }`로), `kim-gktg-processor.js`
  (205×169 고정 검사 제거), `kim-tropopause-processor.js`, `kim-nwp-model.js`
- 영역 id를 회차 경로·manifest·index·latest에 포함한다(예: `runs/kr/KIMG_NE57_2026100800`).

**2-2. 캐시·지문 구분**

- `fingerprintKimNwpBase`, GKTG·권계면 revision, 기본 격자 재사용 판단에 격자 정의(영역 id·nx·ny·경계)를 넣는다.
- 완료 기준: 같은 tmfc의 한반도·확대 회차가 서로의 캐시를 재사용하지 않는 단위 시험.

**2-3. 영역별 보관**

- `cleanupKimNwpRuns`가 영역별로 센다. 각 영역 게시 1 + 수집 1, 부분 회차 24시간 규칙 유지.

### 3단계. 계산 구조

**3-1. GKTG 블록 계산**

- 파일: `backend/python/kim_turbulence/calculate.py`(NC 직접 읽기, 영역 전체 온위 범위·고도 구간 산출, 192×192 창·24 겹침,
  결과 이어 붙이기), `python_port.py`(창 단위 Geometry·전역 기준값 주입을 정식 인자로).
  진단용 어댑터 `scripts/benchmark-kim-compute.py`의 `install_tile_context`를 정식 코드로 옮긴다.
- 영역이 창보다 작으면(한반도) 블록 없이 한 번에 계산한다.
- 완료 기준: 한반도 결과가 현행과 차이 0. 확대 영역 블록 합성 = 전체 계산(로컬, 차이 0). 서버 블록 최대 RSS < 500 MiB.

**3-2. 권계면 NC 입력**

- 파일: `backend/python/kim_tropopause/calculate.py`, `kim-tropopause-processor.js`
- Node가 큐브를 JSON으로 넘기지 않고 NC 경로만 넘긴다.

**3-3. 예보시각 단위 순번과 메모리 보호**

- 파일: `backend/src/processors/kim-derived-worker.js`, `kim-derived-worker-entry.js`, `backend/src/lib/heavy-child-gate.js`
- `heavyChildGate` 순번을 작업 전체가 아니라 예보시각마다 받는다(위성 처리 대기 최대 약 2분 30초).
- Python 블록 시작 전 `/proc/meminfo` MemAvailable ≥ 512 MiB를 확인하고 부족하면 기다린다.
- 예보시각당 Python 제한시간을 블록 단위(예: 60초)로 바꾼다. Node 자식 힙 한도(1024 MB)는 JSON 큐브가 없어지므로 낮춘다.
- 완료 기준: 단위 시험(순번 사이 위성 작업 끼어들기, 메모리 대기), 한반도 운영 회차 GKTG·권계면 시간 현행 이하.

### 4단계. 확대 영역 수집기

시작 전 "결정 필요"의 지도 회차 선택을 확정한다.

**4-1. 설정과 키**

- `.env`·`backend/.env.example`: `KMA_BULK_AUTH_KEY`, `KMA_BULK_HOST`(apihub-org.kma.go.kr), `KMA_BULK_VALID_UNTIL=2026-11-06`,
  `KMA_BULK_WINDOW_KST=15-24`, `KIM_EXPANDED_ENABLED`.
- `backend/src/api-hub-usage.js`: `bulk` 분류(한도 2 TB, 호출 건수 기록). `backend/src/api-operation-registry.js`에 확대 영역 operation.
- `backend/src/processors/kim-run-credential.js`: 확대 영역은 대용량 키만, 다른 키로 대체하지 않는다.

**4-2. 일정**

- `backend/src/collector-registry.js`: `kim_expanded` 00 UTC 15:00 KST, 06 UTC 20:15 KST. 사용시간 밖은 `quiet`.

**4-3. 수집·처리 파이프라인**

- 앞쪽 예보시각부터 받고, 예보시각이 모이면 NC로 묶어 계산 순번에 넣는다(받으면서 처리).
- 23:50 KST에 새 요청 중단. 사용시간 안에서는 빠진 예보시각부터 이어받기. 06 UTC가 시작되면 00 UTC 이어받기 중단.
- 다운로드 중 권계면은 메모리 여유가 없으면 다운로드 뒤로 미룬다.

**4-4. 게시 규칙**

- 부분 회차: 받은 예보가 00 UTC +15h, 06 UTC +27h까지 이어지면 게시. 빠진 예보시각은 index에서 제외. 미달이면 이전 회차 유지.
- 한반도 06 UTC: 확대 06 UTC의 +0~12h 13개가 끝나면 한반도 범위를 잘라 `kr` 영역으로 게시(약 21:20).
  21:30 KST까지 끝나지 않으면 일반 KIM 키로 한반도 06 UTC를 받는다.

**4-5. 보호와 알림**

- 디스크: 회차 시작 전 여유 ≥ 예상 크기 + 3 GiB(`MIN_FREE_BYTES` 재사용), 다운로드 중 3 GiB 미만이면 중단. 기록 `skipped`/`disk_reserve`.
- 만료·키 없음·401/403: 확대 수집 자동 중지(`disabled`), 한반도 06 UTC는 일반 키로 복귀.
- `backend/src/alerts/ops-rules.js`: 만료 7일·1일 전 알림, 확대 회차 2회 연속 미게시 알림.
- 관리자 수집 시간표에 확대 00·06 UTC 행.

**4단계 완료 기준**

- 단위 시험: 사용시간·만료 판정(KST), 23:50 중단·이어받기, 부분 게시 기준, 한반도 잘라내기 값이 한반도 단독 수집과 같음,
  21:30 대체, 디스크 보호선, `bulk` 장부.
- 운영 서버 진단 모드(게시 없음)로 확대 00 UTC 한 회차 실측: 전송 속도, 다운로드·처리 겹침 메모리, 단계별 시간, 디스크.
  운영 문서 예상치(다운로드 2시간 11분, 게시 약 17:15, 최대 디스크 약 7.9 GB)와 비교.

### 5단계. 프론트엔드 제공

**5-1. 지점 조회 API**

- 백엔드: `GET /api/kim/point?domain&tmfc&hf&level&lat&lon&revision` → 풍향·풍속·기온·구름·착빙·난류·지위고도.
  기존 보간·결측·단위 규칙을 `weatherPointInspector.js`에서 확인해 같은 결과를 낸다(백엔드는 프론트 코드를 가져오지 않는다).
- 프론트: `frontend/src/features/weather-overlays/lib/weatherPointInspector.js`, `useWeatherPointInspector.js`가 API를 쓴다.
  늦게 온 응답이 다른 선택을 덮지 않게 요청 키를 비교한다.
- 필드 응답에서 `geopotentialHeight` 배열을 뺀다.

**5-2. 바이너리 필드 전송**

- 백엔드: 필드 응답을 `application/octet-stream`(int16 배열들) + 작은 JSON 메타데이터(격자·scale·offset·결측값·revision)로.
  전환 기간 JSON 응답 유지.
- 프론트: `frontend/src/api/weatherApi.js`와 `useKim*` 훅들이 `Int16Array`로 받는다.

**5-3. 캐시 상한·래스터 해상도**

- 필드 캐시를 바이트 기준 상한(예: 64 MB) LRU로. 영역 전체가 보일 때 래스터 배율을 4배에서 2배로.

**5-4. 화면 범위 요청**

- 화면 범위 + 여유 영역의 BBOX만 받는다. 이동 시 범위 밖으로 나갈 때만 다시 받는다.

**5단계 완료 기준**

- 지점 조회 결과가 현행 격자 조회와 같은 값(단위 시험·데스크톱 계약).
- 확대 영역 필드 한 장 전송 0.3~0.8 MB, 한반도 확대 시 0.1 MB 이하.
- 모바일에서 레이어 켜기·시각 변경 반응 측정(사용자 확인). 부족하면 권계면·제트부터 서버 이미지로 옮기는 후속 작업.

### 6단계. 운영 적용

- `KIM_EXPANDED_ENABLED=1`로 전체 배포 후 3일 관찰: 회차별 게시 시각, `bulk` 사용량(일 약 62 GB), 디스크 최대,
  메모리 최저, 위성 처리 지연, 사이트 health 응답.
- 만료 전환 리허설: 로컬에서 `KMA_BULK_VALID_UNTIL`을 과거로 두고 확대 수집 중지·한반도 06 UTC 일반 키 복귀 확인.
- 문서: `docs/operations/kim-grid-scaling.md`에 실측값, `docs/operations/operations.md`·`Architecture.md`에 새 저장 형식·
  영역 구조·의존성 반영.

## 되돌리기

- 확대 영역: `KIM_EXPANDED_ENABLED=0`이면 한반도 4회 수집(06 UTC 포함 일반 키)으로 돌아간다.
- NC 저장: `KIM_STORE_FORMAT=both` 기간에는 JSON도 쓰므로 `json`으로 바꾸면 즉시 이전 방식으로 돌아간다.
  전환 기간에는 JSON 읽기를 유지하므로 이전 배포로 되돌려도 JSON 회차를 읽는다. NC로만 저장된 회차는 다음
  정규 수집에서 JSON으로 다시 만든다.
- 프론트엔드: JSON 필드 응답을 전환 기간 동안 유지한다.

## 일정 메모

대용량 키 승인은 2026-11-06까지다. 1차 묶음은 확대 영역이 없어도 한반도 운영에 이득(디스크·메모리·위성 대기·
브라우저 부담)이므로 먼저 진행한다. 4단계 실측은 KST 15:00~24:00에만 가능하다.
