# KIM 난류 GKTG 대체·공통 수치예보 통합 계획

작성: 2026-10-03. 상태: 코드 통합·로컬 검증 완료, 운영 실자료 검증 일부 대기.

구현 결과와 검증 범위는 [구현 결과 보고서](2026-10-03-kim-gktg-implementation-report.md)에 기록한다. 현재 로컬 실자료는 `2026091006`의 +6/+9시간이며, 운영 기본 13시각 검증과 실제 KST 하루 키 사용량은 미완료다. 추가 API 호출은 기존 일간 예산 차단(`api_hub_budget_blocked`)으로 실행되지 않았다.

기존 저층 KTG 수집과 난류 표출을 GKTG로 대체한다. GKTG를 바람·기온·습도·착빙과 같은 KIM 수치예보 체계에 통합하고, 지도·연직 단면·비행 전 브리핑·기관 지도·ADMIN이 같은 자료와 등급 기준을 사용하도록 바꾼다. 기존 KIM 키의 12 UTC 회차는 레이더·위성 키로 옮긴다.

이 문서는 확정 범위와 완료 기준을 정한다. 코드에는 새 수집·키 배분을 연결했으며 운영 서버 배포는 수행하지 않았다.

## 1. 확정 범위

| 항목 | 변경 후 |
|---|---|
| 실시간 난류 제품 | 기존 KTG 제거, Python으로 계산한 GKTG 사용 |
| 지도 진입점 | 기존 `난류` 버튼 하나 유지. 별도의 `난류(실험)` 버튼·시험 선택 패널 제거 |
| 공통 KIM 관리 | 같은 모델·발표회차·예보시간·기압층·격자·저장소·정리 정책 사용 |
| 연직·시간 선택 | 기존 KIM 연직 슬라이더와 공통 시간축에 연결 |
| 다른 기능 | 연직 단면, 비행 전 브리핑, 고도 비교, 기관 지도, 고정 자료 선택, 스냅샷, AI의 브리핑 읽기까지 연계 |
| ADMIN | 자료 상태, 수동 수집, 스케줄, 수집 통계, API 사용량, 디스크 사용량 연결 |
| KIM 기본 입력 키 | 00·06 UTC: KIM / 12 UTC: 레이더·위성 / 18 UTC: 항공 |
| GKTG 추가 입력 키 | 네 회차 모두 레이더·위성 키. 기존 기본 입력은 재다운로드하지 않음 |
| 계산 엔진 | Python·NumPy·Numba. Fortran은 오프라인 대조에만 사용 |
| 운영 보관 결과 | 최종 GKTG. 24종 중간 진단지수와 CAT/MWT는 검증 산출물로 분리 |

계수 재보정, 항공기 관측에 의한 정확도 검증, 전 지구 91층 수집·MPI·1000 ft `.Q` 운영 실행의 전체 이식은 이번 통합 범위에 포함하지 않는다. 지도·브리핑의 GKTG 출처와 지원 범위는 실제 자료에 맞게 표시한다.

## 2. 현재 상태와 재사용할 부분

### 통합 전 기준 상태

- `scripts/turbulence/python_port.py`와 관련 모듈에 실제 선택 24종 → CAT/MWT → 최종 GKTG의 Python 이식이 있다.
- 실제 KIM `2026091006`, +6/+9시간과 합성 입력 세 사례를 원본 Fortran과 대조했다. 실제 두 시각에서 27개 결과 중 각각 20개는 binary32 값이 정확히 같고, 모두 지수별 단정밀도 허용 오차 이내다. 결측 위치도 일치한다.
- 실제 GKTG 최대 절대 오차는 +6시간 `8.94e-8`, +9시간 `5.96e-8`이다. 이는 같은 입력의 원본 계산 재현 검증이다.
- 현재 시험은 `kim_turbulence_experiment` 저장소와 전용 API·훅·버튼을 쓰며 자동 수집·ADMIN·기존 브리핑에 통합되어 있지 않다.
- 기존 난류는 `ktg-processor.js`의 외부 NetCDF 수집과 `/api/ktg/*`, 독립 고도 선택, 1,000–10,000 ft의 저층 계약을 사용한다.

계산 원본은 [Python 이식 설명](../../../scripts/turbulence/README.md), 누락 수정 이력은 [소스 감사 기록](../../../scripts/turbulence/SOURCE_AUDIT.md)에 있다. 실제 대조 결과는 ignored `artifacts/kim-turbulence-python-v5/verification.json`·`verification.md`에 있다.

### 기존 난류와 같은 제품은 아님

기존 KTG와 새 GKTG를 같은 발표·예보시각·고도로 맞춘 사례에서 공간 상관은 0.515–0.730이고, 표시되는 난류 강도와 범위는 다르다. 기존 KTG에 맞추기 위해 GKTG의 값이나 임계값을 조정하지 않는다. 모든 소비자를 GKTG의 동일 기준으로 바꾼다.

## 3. 공통 디렉터리·자료 규격

### 코드 위치

- Node 수집·입력·게시 서비스는 `backend/src/processors/`와 기존 KIM 모델/저장소 모듈이 소유한다.
- 운영 Python 계산 모듈은 `backend/python/kim_turbulence/`로 옮기고, backend 배포에 함께 포함한다. 기존 이식 모듈을 한 벌만 유지하고 운영용 근사 계산을 따로 만들지 않는다.
- `scripts/turbulence/`에는 원본 Fortran 대조·합성 사례·기존 제품 비교 등 검증 진입점을 둔다. 검증도 운영 Python 모듈을 가져와 검사한다.
- NumPy/Numba 버전 명세, Python 실행 경로와 Numba cache 설정을 backend 환경 계약에 포함한다. 운영 계산은 `reference/TURB`, Fortran 실행 파일, ignored `artifacts`·개발 가상환경의 존재에 의존하지 않는다. 필요한 계수와 출처 해시는 운영 패키지에 포함한다.
- frontend는 API와 공통 등급 정의를 읽으며 backend/Python 계산 코드를 가져오지 않는다.

### 소유권

운영 자료의 소유자는 기존 `kim-nwp-store.js`다. GKTG 전용 최상위 `gktg/`나 시험 저장소를 새 운영 자료의 기준으로 만들지 않는다. 운영에서는 `DATA_PATH/kim_nwp/`, 개발에서는 같은 규칙의 로컬 데이터 루트를 사용한다.

현재 운영 루트는 `/opt/projectamo/shared/data`다. 루트 경로를 코드에 하드코딩하지 않고 기존 설정과 경로 resolver를 사용한다.

### 저장 배치

```text
<DATA_PATH>/kim_nwp/
  index.json                             # 기존 KIM 공통 인덱스
  latest.json                            # 기존 KIM 기본 자료 포인터
  derived/gktg/latest.json                # 마지막 완전한 GKTG 계산을 가리키는 뷰
  derived/gktg/last-attempt.json           # ADMIN이 읽는 최근 시도 상태
  runs/KIMG_NE57_<tmfc>/
    manifest.json                        # 기존 기본 변수의 완료/가용 상태
    raw/hf006/...                        # 기존 raw 보관 설정·캐시 정책 적용
    normalized/hf006/500hPa/
      grid.json                          # 기존 바람·기온·습도·고도·착빙 입력
      gktg/<hourRevision>.json     # 같은 시각·층·격자의 불변 GKTG 필드
    derived/gktg/
      <runRevision>/manifest.json # 입력·계산 출처, 시각/층 목록, 완료 증거
      last-attempt.json                  # 대기·실패 원인, 재사용·성능·계측
```

GKTG 필드는 기존 정규화 자료와 같은 `run → hf → pressure level` 아래에 둔다. 계산 revision을 별도로 두는 이유는 기존 입력 `grid.json`을 덮어쓰지 않고, 계산 중 실패했을 때 이전 완전한 GKTG와 고정된 브리핑의 값을 보존하기 위해서다. 읽기·가용성 판정·경로 검증·보존 정리는 공통 KIM 저장소에서 제공한다.

구현 시 필드 배치는 공통 store의 resolver로 캡슐화한다. 지도나 브리핑에서 파일 경로를 직접 조합하지 않는다. GKTG 저장소를 KIM 저장소 옆에 따로 만들거나 기본 변수들을 GKTG 디렉터리에 복사하는 방식은 사용하지 않는다.

### 필드·인덱스 계약

- 모델 `KIMG/NE57`, UTC `tmfc`, 정수 `hf`, UTC `validTime`, 기존 KIM `level.id`·`grid`·행 순서를 사용한다.
- 영역은 현재 205×169, 119–136°E·30–44°N이다. 압력층은 기존 21개 `KIM_NWP_LEVELS`를 재사용한다.
- 수집 시간은 기존 운영 설정인 F000–F012, 13시각이다. 시험의 +6/+9 두 시각을 운영의 전체 범위로 취급하지 않는다.
- 외부 노출 형식은 기존 KIM 필드 API와 같은 선택·단위·격자·결측 규칙을 따른다. 필드 이름은 `gktg`, 제품 출처는 `GKTG`다.
- 수치값은 Python 계산의 float32 값을 보존한다. 기본 int16 scale `0.01`이나 기존 KTG의 소수 네 자리 반올림을 적용하지 않는다. JSON 결측은 `null`이다.
- 계산 revision은 입력 내용, Python 계산 코드, 의존성 명세, 선택 계수와 원본 출처로 만든다. `collectedAt` 같은 실행 시각 때문에 같은 입력을 재계산하지 않는다.
- `algorithm`, `calculatedAt`, `inputRevision`, 각 변수의 입력 출처, 계산 코드 revision, 지원 범위와 완료 상태를 보존한다.
- 기본 변수와 GKTG의 가용성을 구분한다. KIM 바람이 준비되었다는 이유만으로 GKTG도 준비되었다고 표시하지 않는다.
- `kimNwp.variables.gktg`의 가용성·내용 해시를 공통 snapshot-meta에 반영한다. GKTG 계산 갱신 때문에 내용이 같은 바람·기온 캐시를 불필요하게 무효화하지 않는다.
- 보존 정리는 기본 latest, 마지막 완전한 GKTG, 진행 중 계산, 보존 중인 고정 자료가 참조하는 회차/revision을 보호한다. 기존 `max_runs` 숫자만 적용해 참조 중 입력을 지우지 않는다.

## 4. 수집·키 배분·계산 수명주기

### 발표회차별 기본 입력 키

| KIM 발표 UTC | 발표 KST | 기본 KIM 격자·공항 비교 키 |
|---|---|---|
| 00 UTC | 09시 | `KMA_KIM_NWP_AUTH_KEY` |
| 06 UTC | 15시 | `KMA_KIM_NWP_AUTH_KEY` |
| 12 UTC | 21시 | `KMA_RADAR_SATELLITE_AUTH_KEY` |
| 18 UTC | 다음 날 03시 | `KMA_AVIATION_AUTH_KEY` |

이는 발표시각의 배분이다. 다운로드 실행시각은 기존 KIM 공개 지연·재시도 스케줄을 따른다. API 한도 초기화는 KST 날짜를 기준으로 계산하며 UTC 발표 날짜와 같다고 가정하지 않는다.

`selectKimRunCredential`에서 이 규칙을 한 번 정의하고 기본 격자·공항 비교가 함께 사용한다. 12 UTC의 선택 키가 없거나 차단되었다고 KIM/항공 키로 자동 대체하지 않는다. 재시도도 같은 발표회차의 키를 유지한다.

### GKTG 추가 입력

| 입력 | 처리 |
|---|---|
| u/v/T/hgt/q, 21층 | 기존 KIM 저장 자료 재사용 |
| w, 1000–300 hPa | 기존 착빙 수집 자료 재사용 |
| w, 250/200/150 hPa | 누락분만 레이더·위성 키로 수집 |
| ps/topo/hpbl | 같은 격자의 캐시가 있으면 재사용, 없으면 레이더·위성 키로 수집 |

지형 `topo`는 같은 모델·격자·내용의 정적 자료를 공유한다. 발표시각만 바꿔 같은 지형을 반복 다운로드하지 않는다. 넓은 영역의 지상 일기도 자료는 격자가 다르므로 같은 배열이라고 재사용하지 않는다.

### 실행 순서

1. 기존 KIM 수집이 공통 저장소에 기본 입력을 확보한다.
2. `kim_gktg` 계산기가 대상 회차·시각의 21층 입력과 추가 변수 가용성을 검사한다.
3. 누락된 입력만 공통 API client/parser/요청 관측 경로로 받는다. 변수·단위·격자·시각·결측을 경계에서 검사한다.
4. 같은 입력 revision의 계산이 완료되어 있으면 외부 호출과 계산을 생략한다.
5. Python으로 시각별 전체 3차원장을 계산한다. 특정 층만 따로 계산하거나 브라우저에서 계산하지 않는다.
6. 시각별 21개 GKTG 필드를 staging에 저장하고 값·결측·정확한 시각/층·revision을 검사한다.
7. 13시각의 전체 회차가 완전할 때 계산 manifest와 GKTG 뷰 포인터를 원자적으로 게시한다. 정상 계산된 시각은 실패 후 재시도 때 재사용한다.
8. 기본 입력이 아직 덜 수집되면 `입력 대기`, 제공자/계산 실패면 해당 실패 원인을 기록한다. 새 불완전 회차로 마지막 완전한 GKTG를 교체하지 않는다.

기본 KIM 수집과 GKTG 게시가 같은 회차에서 경합하지 않도록 공유 저장소의 쓰기·정리 경계를 조정한다. 계산 전에 읽은 입력 revision을 게시 전에 다시 확인하고, 입력이 바뀌었으면 다른 revision의 결과를 섞지 않는다.

계산 작업은 별도 collector 식별자와 lock을 가지되 기존 KIM 공개 시각·시작 시 복구·수동 수집 패턴을 따른다. 의존하는 기본 수집과 추가 입력, 로컬 계산의 결과를 ADMIN에서 구분한다. 캐시가 완전한 로컬 계산은 불필요한 외부 키 확인 때문에 차단하지 않는다.

13시각 전체 입력을 거대한 cube JSON으로 복사해 쌓지 않고 시각별 입력·계산·검증을 순차 처리한다. 작업 취소와 timeout을 자식 프로세스까지 전달하고, 계산 병렬성은 실제 운영 메모리 측정 후 제한한다.

## 5. API·지도·연직 슬라이더

### 공통 KIM API

- `GET /api/kim/gktg/index`: GKTG가 완전한 회차의 시각·기압층·가용성·revision.
- `GET /api/kim/gktg/field?tmfc=...&hf=...&level=...&revision=...`: 정확한 선택의 GKTG 필드.
- 기존 `sendKimIndex`·`sendKimField` 및 exact/pinned 자료 읽기 패턴을 확장한다.
- 없는 시각·층·revision 요청을 다른 값으로 대체하지 않는다. GET 요청은 외부 API 수집이나 Python 계산을 실행하지 않는다.
- 사용자 선택을 초기화할 때의 기존 KIM 기본 선택 규칙과, 이미 선택한 필드가 없을 때의 빈 자료 처리를 구분한다.

### 지도

- 기존 `turbulence` 레이어 ID와 `난류` 버튼을 유지하고 공급자만 GKTG로 바꾼다. 검색·모바일 버튼·코파일럿 화면 액션도 이 버튼을 사용한다.
- 개인 레이어 설정과 기존 난류 선택은 같은 ID로 유지한다. 시험 `kimTurbulence` 설정이 남은 경우 새 `turbulence` 선택으로 정리하고 두 난류가 동시에 켜지지 않게 한다.
- `kimTurbulence` 시험 레이어와 별도 진단지수 선택 UI는 일반 지도에서 제거한다.
- `useKimGktg`를 기존 KIM 훅 패턴으로 구성하고 `useNwpOverlays`에서 공통 `nwpSelection`을 공유한다.
- 난류의 연직 선택도 기존 KIM 기압층 슬라이더를 사용한다. 기존 KTG의 독립 1,000–10,000 ft 슬라이더는 제거한다.
- 압력층에 표시하는 보조 ft 값은 다른 KIM 레이어와 같은 표준대기 근사 표시 규칙을 따른다. 실제 지점의 기하 고도나 브리핑 보간 높이로 취급하지 않는다.
- 기존 바람·기온·습도·착빙과 동일한 레이어 상호 배제, 시간축, 발표/유효시각 표시, 위치 값 조회, 로딩·오류·빈 자료 처리를 적용한다.
- MapView는 조합만 담당한다. 픽셀 변환·소스/레이어·이벤트 정리·스타일 변경 복원은 weather-overlays 소유 모듈에서 처리한다.

### 공통 등급과 색상

| 등급 | GKTG 값 | 색 |
|---|---|---|
| NIL | <0.15 | 투명 |
| LGT | 0.15–<0.22 | `#33ff00` |
| MOD | 0.22–<0.34 | `#ffcc00` |
| SEV | ≥0.34 | `#ff2900` |

실제 TURB NCL 기준을 유지한다. 지도·툴팁·범례·연직 단면·브리핑·고도 비교가 공유하는 환경 독립적인 등급 정의를 만든다. 기존 KTG의 0.30/0.475/0.75를 새 GKTG에 적용하지 않는다. NIL과 자료 없음은 원시값/상태에서 구분하며, 결측을 0 또는 난류 없음으로 바꾸지 않는다.

## 6. 다른 기능과의 연결

| 소비자 | 변경 내용 | 완료 확인 |
|---|---|---|
| 연직 단면 | KIM 원래 압력층의 GKTG와 같은 회차의 hgt를 읽어 지점별 높이에 배치 | 단면의 색·수치·시각이 원래 GKTG 필드와 일치 |
| 비행 전 브리핑 | 계획 고도·상승/하강 프로파일에 GKTG를 샘플링하고 구간별 노출·요약·출처를 갱신 | 지도·단면·구간 요약이 같은 등급 기준을 사용 |
| 고도 비교 | 후보 고도별 난류 노출·중/강 난류 구간을 GKTG로 계산 | 범위 밖 고도는 결측, 낮은 층의 값으로 채우지 않음 |
| 기관 지도·고정 자료 | KIM 모델 선택에 GKTG 자원을 포함하고 tmfc/hf/level/revision을 고정 | 기관 지도 선택이 실시간 최신 자료로 바뀌지 않음 |
| 저장 브리핑·출처 | 계산 algorithm·입력 회차·유효시각·revision을 보존 | 과거 브리핑 값과 출처가 재계산/배포 때문에 바뀌지 않음 |
| 스냅샷·데모 | `kim_nwp` 복사에 GKTG 필드·manifest·뷰 포인터를 포함 | 참조 파일이 모두 있고 운영 저장소와 섞이지 않음 |
| AI 브리핑 읽기 | 난류 원천·범위·등급을 새 브리핑 모델에서 읽음 | 기존 KTG 10,000 ft 상한·출처 문자열이 새 GKTG를 제한하지 않음 |
| 비행 알림 | 기존 재브리핑이 새 GKTG 자료를 사용하도록 연결 | 코드 조사 결과 기존 알림 diff는 minima·TS/FG/SN·SIGMET만 지원한다. 난류 전용 변화 알림 규칙은 원래 없으며 별도 기능 추가 대상이다 |

비행 고도(ft)에 맞출 때는 **같은 회차·시각의 hgt(m)**로 기하 고도를 얻어 연직 보간한다. 압력층의 표준대기 고도나 기존 KTG의 고정 고도 배열로 대체하지 않는다. 기존 경로 샘플링·최악 구간·시간 구간 선택 계약은 유지하며, 새 205×169 정규 격자를 기존 KTG의 곡선/LCC 격자처럼 읽지 않는다.

이식된 GKTG 값의 연직 보간은 24종 지수를 새 고도에서 다시 계산하는 것과 구분한다. 보간 방법과 범위는 메타데이터에 기록하고 경계·결측 이웃·높이 비단조·지원 고도 밖에서는 외삽하지 않는다.

기존 KTG의 10,000 ft 상한을 제거하되, 새 상한을 무조건 60,000 ft라고 정하지 않는다. 실제 21층 hgt와 공통 유효값으로 지점·시간별 지원 범위를 판단한다.

과거 KTG 브리핑·스냅샷 원문을 새 GKTG 값으로 덮어쓰지 않는다. 과거 제품 식별자를 보존하고 새 자료 모델과 구분한다. 과거 자료를 열 때 지원되지 않는 자원을 실시간 GKTG로 대신 가져오지 않는다.

## 7. ADMIN·계측·용량

### ADMIN 연결 항목

- 자료 수집 행은 `난류(GKTG)`로 교체하고 계산 상태·대상 회차·예보시각 수·층 수·마지막 성공·다음 점검을 표시한다.
- 입력 대기, 부분 계산, 키 차단, Python 실행 실패, 마지막 정상 자료 유지, 명시적 OFF를 구분한다.
- `수동 수집`은 기본 입력 확보와 누락 추가 입력, 계산을 같은 pipeline으로 수행한다. 이미 완료된 회차를 다시 다운로드하지 않는다.
- collector registry, processor binding, lock, startup recovery, stats 타입, data-health catalog를 함께 등록한다. 라벨만 바꾸고 기존 KTG collector를 남기지 않는다.
- KIM 기본 수집의 실제 선택 키를 회차에 따라 표시한다. 자료 출처가 KIM이라는 사실과 인증 키가 무엇인지 구분한다.
- 외부 요청은 실제 선택 키의 물리 요청 횟수·응답 바이트로 집계한다. GKTG 계산 횟수·소요시간·입력 재사용은 API 다운로드량과 분리한다.
- 새 추가 입력 operation을 등록한다. 기존 KIM 요청, 지상 일기도 요청과 URL이 같아도 operation·변수·영역에 따라 정확히 구분하며 자동 키 대체를 하지 않는다.
- 디스크 사용량은 공통 `kim_nwp`와 그 안의 GKTG 계산 결과를 기준으로 집계한다. 별도 시험 디렉터리를 운영 자료로 합산하지 않는다.

### 용량 산정

아래는 실제 시험 응답 크기와 현재 수집 구성에 근거한 추정이다. 재시도·그날의 다른 키 사용량은 별도로 실측해야 한다. MB/GB는 10진 바이트 기준이다.

| 항목 | 예상 |
|---|---|
| 기본 KIM 격자 한 회차 | 3,315회, 약 1.51 GB |
| 공항 상세 추가분을 포함한 한 회차 | 약 1.57 GB |
| 키 이전 후 기본 KIM 키 두 회차 | 약 3.14 GB/일 |
| 레이더·위성 키로 옮기는 기본 한 회차 | 약 +1.57 GB/일 |
| GKTG 추가 입력, 네 회차 | 약 +260–264회·119–120 MB/일. 13시각의 5개 추가 필드와 회차별 지형 최대 1회 기준 |
| 레이더·위성 키의 총 증가분 | 약 +1.69 GB/일 |
| 제거하는 기존 KTG 다운로드 | 한 회차 3파일·약 5.25 MB, 네 회차 약 21 MB/일 감소 |
| 최종 GKTG, 21층×13시각의 현재 JSON 형식 | 같은 입력 hgt를 포함해 약 298 MB/회차 추정. 실제 두 시각 42필드 45,798,528 bytes |
| 지도 한 시각·한 층 GKTG | 현재 gzip 약 235 KB |

기존 일간 한도는 키당 5 GB이고 프로젝트 차단 기준은 4.75 GB다. 이전 후에는 **레이더·위성 키에 기본 KIM 한 회차까지 추가되는 점**을 반드시 계산한다. GKTG 추가 입력 약 120 MB만으로 새 키 사용량을 평가하지 않는다.

이론 추정과 과거 운영 기록으로 오늘 사용량을 확정하지 않는다. 구현 검증에서 세 키의 KST 하루 장부, 일기도·레이더·위성의 기존 사용량, 재시도까지 합산해 여유를 확인한다. 서버에 저장한 결과와 브라우저에 전달한 gzip 용량은 기상청 키 다운로드량에 더하지 않는다.

## 8. 변경 대상과 구현 순서

실제 구현 시 완료·검증·남은 작업을 이 체크리스트에 기록한다.

### 1단계 — 공통 KIM 자료 계약

- [x] `kim-nwp-model.js`에 GKTG 필드·가용성·단위·값 보존 계약 추가.
- [x] `kim-nwp-store.js`에 GKTG 경로, revision/manifest, 이전 완전한 뷰, 참조 회차 보존 확장.
- [x] 공통 `gktg` 등급·범위 정의 추가. 기존 KTG 기준과 분리.
- [x] 기본 변수 hash와 GKTG hash, concurrent write/cleanup 보호, exact/pinned revision 계약 검증.

### 2단계 — 기본 KIM 키 이전

- [x] `kim-run-credential.js`: 00/06 KIM, 12 레이더·위성, 18 항공.
- [x] `kim-surface-wind-processor.js`와 공항 모델 비교가 같은 키 선택을 사용하도록 연결.
- [x] API operation/ADMIN의 키 분류·예산 차단을 실제 회차 선택과 일치시킴.
- [ ] 네 회차·KST 날짜 경계·키 누락·차단·재시도에서 자동 대체가 없음을 검증.

### 3단계 — 운영 GKTG 수집·계산

- [x] `backend/src/processors/kim-gktg-processor.js`와 backend 소유 입력/계산 서비스 추가.
- [x] 검증된 Python 모듈을 `backend/python/kim_turbulence/`로 옮겨 운영 entrypoint 작성. 시험 수집 CLI에 의존하지 않음.
- [x] 기존 KIM 입력 공유, 누락 추가 입력 수집·캐시, 단위/시간/격자 검사 연결.
- [x] 13시각×21층 완료·revision 재사용·중단/실패 후 재시도·원자적 게시 구현.
- [x] 정식 저장은 최종 GKTG만. 전체 입력 cube 복사본과 24종 결과를 운영 데이터에 계속 남기지 않음.
- [x] 정기/시작/수동 실행을 같은 processor에 연결. 실제 2시각의 계산 시간·메모리·디스크를 측정; 13시각/서비스 계정 실측은 대기.

### 4단계 — 공통 KIM API·지도

- [x] `backend/server.js`의 공통 KIM index/field와 snapshot-meta에 GKTG 추가.
- [x] frontend API, `useKimGktg`, `useNwpOverlays`, 레이어 모델·범례·위치 값 조회 연결.
- [x] 기존 난류 버튼을 GKTG로 교체하고 공통 기압층 슬라이더·시간축 연결.
- [x] 별도 시험 버튼/패널과 기존 KTG 고도 슬라이더·live 요청 경로 제거.
- [ ] 데스크톱·태블릿·모바일, 시간대, 빈 자료, 빠른 선택 변경, 두 번의 스타일 변경 검증.

### 5단계 — 연직 단면·브리핑·고도 비교

- [x] `enroute-cross-section.js`, `cross-section-sampler.js`를 공통 KIM GKTG/hgt 읽기로 전환.
- [x] `enroute-model.js`, `route-weather-legs.js`, `altitude-weather-comparison.js`의 난류 등급/노출 계산 전환.
- [x] `VerticalProfileChart.jsx`, 브리핑 구간 표·요약·지도 위험구간의 색·출처·지원 범위 갱신.
- [x] 같은 입력 hgt, 10,000 ft 초과, 결측, 범위 밖을 자동 테스트. 실자료 42필드 저장값 전부 대조; 실제 비행 프로파일 전 구간 대조는 운영 검증에 남김.

### 6단계 — 기관·고정 자료·스냅샷·AI

- [x] `organization-runtime.js`, `pinned-map-resources.js`, `briefing-provenance.js`의 GKTG 자료 참조 추가.
- [x] `pinnedMapDataSelection.js`와 기관 지도에서 KIM 변수 GKTG의 exact 선택 지원.
- [x] snapshot-store의 준비 검사·복사·보존에 공통 KIM GKTG 자원 반영.
- [x] AI digests의 기존 KTG 10,000 ft 상한·출처 문자열·자료 없음 설명 갱신.
- [x] 비행 알림 재브리핑의 GKTG 사용과 기존 diff 범위를 조사. 난류 전용 알림은 기존 기능에 없어 별도 확장으로 기록.
- [x] 저장 브리핑·스냅샷·고정 지도에서 현재 최신 자료로 자동 대체하지 않음을 검증.

### 7단계 — ADMIN·기존 KTG 퇴역

- [x] `collector-registry.js`, `index.js`, `stats.js`, `data-health-catalog.js`, API operation registry 연결.
- [x] ADMIN의 자료 행·수동 수집·다음 점검·사용량·오류/대기·디스크 화면 검증.
- [x] 운영 KTG processor·스케줄·lock·startup·API operation·live 읽기·frontend 훅을 제거.
- [x] 기존 KTG의 파일·API·라벨 참조를 전체 검색하여 역사 자료/검증용 참조와 active 참조를 구분해 정리.
- [x] 과거 KTG 파일·immutable 브리핑은 일괄 삭제하거나 GKTG로 재해석하지 않음.

### 8단계 — 환경·최종 검증·운영 문서

- [x] 개발 bootstrap 및 full deploy에 Python·NumPy·Numba 환경과 코드 배포 포함.
- [ ] 서비스 계정의 Python 실행, 취소/timeout, 쓰기 권한, Numba cache 위치와 재시작 복구 확인.
- [x] dependency 변경이므로 fast deploy 대신 `deploy/deploy-vm-full.sh` 기준으로 배포 준비.
- [x] Architecture, 자료/시간·브리핑·스냅샷 계약, 환경변수·키 배분·보존 정책과 운영 안내 갱신.
- [ ] 과학 대조, 앱 검사·빌드, 브라우저 계약, 실자료 통합 검증 완료 후 결과 기록.

## 9. 검증과 완료 기준

| 검증 | 필수 확인 |
|---|---|
| 과학 이식 | 같은 입력의 원본 Fortran과 24종·결합·중간값·결측 대조. 운영 저장/조회 전후 최종 GKTG 값 보존 |
| 입력·키 | 기본 입력 재다운로드 없음, 누락 변수만 호출, 12 UTC 전체 기본 수집은 레이더 키, 18 UTC는 항공 키 |
| 상태·저장 | 일부 시각 실패·계산 취소·입력 변경·키 차단에서 이전 완전한 뷰 유지. 필요한 회차/revision이 cleanup으로 사라지지 않음 |
| API | 정확한 tmfc/hf/level/revision, 없는 선택/불일치 실패, 기본 KIM API와 같은 field/cache 계약 |
| 지도 | 기존 난류 버튼 하나, 공통 기압층·시간축·범례·샘플값 일치, responsive/접근성/스타일 복원 |
| 브리핑·단면 | 같은 입력·지점·고도의 등급 일치, hgt 기반 보간, 10,000 ft 초과 자료 지원, 범위 밖/결측 보존 |
| 기관·스냅샷 | 고정 자료가 실제 revision을 읽고 live로 바뀌지 않음. 과거 KTG 제품을 GKTG로 바꾸지 않음 |
| ADMIN | 상태·수동 수집·스케줄·입력 대기·계산 실패·실제 키별 요청/바이트·디스크 반영 |
| 실자료 운영 | F000–F012 전 시각·21층, 네 UTC 회차의 키 선택, KST 하루 사용량과 한도 여유를 검증 기록에 남김 |

실행 검사는 관련 backend/frontend 테스트, Python unittest와 원본 대조, `npm run check`, 기존 수치예보·브리핑·기관 지도·ADMIN 브라우저 계약을 포함한다. 새로운 난류 통합 계약을 등록하고 fixture 검증과 실제 API/자료 검증을 구분한다. 사용자가 보는 개발 서버는 유지하며 재사용 가능한 서버를 확인해 검증한다.

코드 통합과 운영 검증을 구분한다. 한 회차의 두 시각 과학 대조나 시험 지도 표시만으로 운영 검증 완료를 선언하지 않는다. 위 체크리스트와 소비자 연결이 끝나고, 기존 KTG의 active 수집·표출이 사라졌으며, 세 키의 사용량까지 확인한 상태를 완료로 본다.

## 10. 참고

- [프로젝트 구조](../../../Architecture.md)
- [자료·시간 계약](../../policies/engineering/data-and-time.md)
- [지도 소유권·레이어 계약](../../policies/engineering/map-and-layers.md)
- [공항 모델 비교 운영](../../operations/airport-model-comparison.md)
- [기존 KIM 지상 일기도 설계·과거 키 사용량](2026-09-22-kim-surface-chart.md)
- [GKTG Python 이식](../../../scripts/turbulence/README.md)
- [공통 KIM 저장소](../../../backend/src/processors/kim-nwp-store.js)
- [공통 KIM 모델](../../../backend/src/processors/kim-nwp-model.js)
- [기본 키 선택](../../../backend/src/processors/kim-run-credential.js)
- [키 사용량 기준](../../../backend/src/api-hub-usage.js)

이번 계획의 실측 근거·비교표는 ignored `artifacts/kim-turbulence-comparison/`에 있다. 이 디렉터리와 `artifacts/kim-turbulence-demo/`는 운영 저장소나 새 소비자의 실행 의존성이 아니다.
