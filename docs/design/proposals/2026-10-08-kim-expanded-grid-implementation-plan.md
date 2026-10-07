# KIM 확대 영역 구현 계획

**목표:** KIM 전구모델 수집 영역을 한반도(119–136°E, 30–44°N, 205×169)에서 확대 영역(100–145°E, 6–50°N, 541×529)으로
넓힌다. 현재 서버(t3.small, 2 vCPU, RAM 약 1.9 GiB, 디스크 30 GB)를 유지하고, 대용량 키(2026-10-07~11-06,
KST 15:00~24:00, 일 2 TB, 호출 건수 제한 없음)로 받는다.

**근거와 결정:** [KIM 격자 확대 검토](../../operations/kim-grid-scaling.md). 이 계획은 그 문서의 결정 사항,
운영안, 관리 방법, 프론트엔드 제공 방식을 구현 순서로 옮긴 것이다. 수치(호출·시간·용량)는 그 문서가 정본이다.

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
| **1차: 기존 영역 NC 전환** | D-3, D-5 → 0-1 → 1-1 → 1-2(+D-2) → 1-3(+D-1) → 1-4 → D-4 → 3-2, 3-3 → 5-1, 5-2, 5-3 | 한반도 영역 | 운영 반영 후 D-1 대조 1주 일치, 3일 정상 게시 |
| **2차: 확대 영역** | 2-1~2-3, 3-1, 4-1~4-5(+D-2 관리자 화면 표시), 5-4, 6 | 확대 영역 | 6단계 운영 적용 |

- 3-1의 블록 계산은 한반도 영역(205×169)이 창(192×192)보다 커서 1차에는 필요 없으므로 2차에 둔다.
  1차의 3-2·3-3은 NC 직접 입력과 예보시각 순번만 적용한다.
- 대용량 키가 2026-11-06에 끝나므로 1차는 2주 안쪽을 목표로 한다.

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
