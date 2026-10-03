# KIM GKTG 대체 구현 결과

작성: 2026-10-03. 코드 통합과 로컬 검증을 완료했다. 운영 서버 배포, 새 실자료 13시각 수집, 네 발표회차의 실제 일간 키 사용량 검증은 수행하지 못했다. 새 추가 API 요청은 기존 예산 차단 `api_hub_budget_blocked`에서 중단됐다.

## 변경 결과

- 기존 `난류` 버튼의 실시간 공급자를 KTG에서 GKTG로 교체했다. 별도 실험 버튼을 제거하고 KIM 공통 기압층·시간축·발표/유효시각·값 조회에 연결했다.
- 검증된 선택 24종→CAT/MWT→GKTG Python 모듈을 `backend/python/kim_turbulence/`에 한 벌만 유지한다. Node 수집기는 이 Python을 실행하며 운영 Fortran 호출은 없다.
- 결과는 다른 KIM 입력과 같은 `DATA_PATH/kim_nwp/runs/.../normalized/hfNNN/<pressure>/gktg/`에 보관한다. float32 원시값·null·같은 입력 hgt·입력/엔진/revision을 보존한다.
- 기본 KIM 키는 00/06 UTC KIM, 12 UTC 레이더·위성, 18 UTC 항공으로 배분했다. GKTG 누락 입력은 레이더·위성 키를 사용하며 차단 시 다른 키로 대체하지 않는다.
- 정기·시작·수동 수집, ADMIN 상태/스케줄/API/사용량/디스크를 `kim_gktg`로 연결하고 active KTG collector와 live 기본 API를 퇴역시켰다. 저장된 과거 KTG 자료의 의미는 유지한다.
- 연직단면·경로 브리핑·고도 비교는 같은 입력 hgt와 GKTG 공통 등급을 사용한다. 10,000 ft 고정 상한을 제거하고 실제 층별 지지 범위 밖/결측은 채우지 않는다.
- 기관 고정 지도·브리핑 출처·스냅샷·AI 읽기에 정확한 GKTG 회차와 revision을 연결했다. 참조 회차를 cleanup에서 보호한다.
- 부분 실패·취소·입력 변경 시 기존 완전한 latest를 유지한다. 정상 시간별 결과를 재사용하며 내용이 깨진 필드는 거부하고 재계산 복구 시 손상 파일을 별도로 보존한다.

강도는 원본 NCL의 **0.15 / 0.22 / 0.34**와 `#33ff00 / #ffcc00 / #ff2900`을 공유한다. float32 경계도 원본 단정밀도 비교를 따르며 자료 없음을 NIL로 바꾸지 않는다.

## 실제 입력 계산·저장 검증

| 항목 | 실행 결과 |
|---|---|
| 발표 | `2026091006`, 2026-09-10 06 UTC / 15 KST |
| 실제 검증 예보 | +6 / +9시간; 2026-09-10 21 KST / 09-11 00 KST |
| 격자·층 | 205×169, 21개 원래 압력층 |
| 새 운영 계산 결과 | 42필드, run revision `a8f4da3521af65c43116` |
| 저장 후 값 대조 | 이전 Fortran 대조를 통과한 Python 결과와 **42필드 전체 값·null이 정확히 동일** |
| 기존 원본 Fortran 대조 | 실제 +6/+9 최종 GKTG 최대 절대 차이 `8.94e-8` / `5.96e-8`; 24종·결합·중간값·결측은 설정한 float32 오차 범위 이내 |
| 계산 성능 | 두 시각 신규 Python 계산 전체 11.12초, 측정 최대 RSS 591,324 KiB; Numba 캐시가 있는 개발 환경 |
| 보관량 | 같은 입력 hgt 포함 42필드 **45,798,528 bytes**. 같은 비율의 13시각은 약 298 MB/회차 추정 |
| 재실행 | 최종 코드에서 2.33초, 최대 RSS 475,612 KiB. 같은 입력 결과 재사용, 추가 외부 호출 없음 |
| 실제 앱 | mock 없이 새 API field 200·지도 GKTG source 표시·공통 rail 선택·브라우저 오류 없음 |

새 운영 결과와 이전 Python 결과의 일치는 원본 Fortran과 전부 비트 단위로 같다는 뜻이 아니다. 위 Fortran 최대 차이와 허용 오차를 구분한다. 신규 13시각 전체가 실자료로 통과한 것은 아니다.

근거: [42필드 전체 대조](../../../artifacts/gktg-operational-verification.json), [계산 성능](../../../artifacts/gktg-operational-calculation.log), [원본 대조](../../../artifacts/kim-turbulence-python-v5/verification.md), [실제 API/지도 조회](../../../artifacts/gktg-actual-map-verification.json), [실제 지도 캡처](../../../artifacts/gktg-operational-map.png).

## 자동 검사

| 검사 | 결과/범위 |
|---|---|
| `npm run check` | backend 1,455 통과/1 조건부 skip, frontend 1,783 통과, 공통/운영 스크립트 테스트와 production build 통과 |
| Python unittest | 35개 통과. 기존 계산 구현과 이동된 운영 모듈을 같은 코드로 검사 |
| GKTG 최종 집중 검사 | 20개 통과. 13×21 게시 fixture·부분 실패 보존·취소 상태·손상 복구·동일 hgt·고도 범위 밖·키 선택 등 |
| `kim-gktg` 브라우저 | desktop / iPad / mobile 3개 통과. 기존 버튼·기압층·revision·스타일 복구·pageerror 검사 |
| 기존 브리핑·ADMIN 브라우저 | 25개 통과·7개 대상 외 skip·모바일 구름 윤곽 스크린샷 1개 실패 |
| 실패 기준 이미지 확인 | GKTG 변경 전 `HEAD`의 차트 코드에서도 같은 모바일 기준 이미지 차이를 재현. 해당 기준 이미지는 수정하지 않음 |
| 정적 검사 | `git diff --check`, setup/bootstrap/full-deploy shell 구문 검사, AGENTS/CLAUDE 동일성 통과 |

이후 과거 KTG 범례의 제품명/임계값 표기를 보존하는 작은 수정도 지도·범례·고정 선택·등급 집중 검사 34개와 최종 production build로 확인했다. [최종 UI 검사](../../../artifacts/gktg-final-ui-check.log), [최종 빌드](../../../artifacts/gktg-final-build.log).

근거: [전체 앱 검사](../../../artifacts/gktg-implementation-check.log), [집중 검사](../../../artifacts/gktg-final-targeted-check.log), [Python 검사](../../../artifacts/gktg-python-check.log), [GKTG 브라우저](../../../artifacts/gktg-browser-check.log), [기존 화면 검사](../../../artifacts/gktg-regression-browser-check.log), [변경 전 차트 재현](../../../artifacts/gktg-mobile-baseline-head-check.log).

## 외부 요청·키 용량

새 supplemental operation과 레이더 키로 `2026100300` +6시간 ps 요청을 실제 수집 경로에 넣었다. 외부 transport 전 예산 차단으로 실패했으며 한도를 초기화하거나 다른 키로 대체하지 않았다. [요청 결과](../../../artifacts/gktg-supplement-api-verification.json)에 차단 상태를 기록했다. 과거에 받아 둔 같은 격자의 supplemental 캐시로 위 두 시각 계산은 완료했다.

현재 구성은 13시각×5개 추가 필드와 지형 최대 1회로 **65–66요청/회차**다. 네 회차의 추가 입력 추정은 약 119–120 MB/일이며, 레이더 키에 이전하는 기본 KIM 한 회차 약 1.57 GB/일까지 합쳐 증가분은 약 **1.69 GB/일**이다. KIM 키 두 회차는 기존 응답 크기 기준 약 **3.14 GB/일**이다. 이것은 실제 그날의 레이더/위성/일기도·재시도 합산 장부 확인을 대신하지 않는다.

## 남은 운영 검증

1. 예산 여유가 있는 정상 수집 시점에 F000–F012 21층 전부를 실자료로 수집·계산·재시도하고 전체 게시를 확인한다.
2. 00/06/12/18 UTC 회차의 실제 선택 키와 KST 하루 세 키의 물리 응답 바이트를 장부에서 확인한다.
3. full deploy 전 서비스 계정의 Python ≥3.12, venv·Numba cache 쓰기 권한, cold cache 계산 시간/메모리·timeout·재시작 복구를 확인한다. 로컬 캐시 환경의 두 시각 수치를 운영 메모리 한도로 확정하지 않는다.
4. 기존 모바일 구름 윤곽 기준 이미지의 화면 변경 이력을 별도 확인한다. 새 GKTG 화면 계약 3개는 통과했다.

비행 알림 코드를 조사한 결과 기존 diff는 minima·TS/FG/SN·SIGMET을 감지하고 난류 전용 변화 알림은 원래 없었다. 재브리핑의 GKTG 사용은 연결했으며 새로운 알림 종류·발송 정책은 추가하지 않았다.

개발 서버는 3001/5173에서 유지한다. [GKTG 운영 안내](../../operations/kim-gktg.md)와 [계획/완료 체크리스트](2026-10-03-kim-gktg-replacement-plan.md)에 환경·소유권·키·정리 계약을 기록했다.

## 추가·이동한 코드 파일과 역할

처리 순서는 기존 KIM 입력 재사용 → 누락 입력 확보 → Python 선택 24종 계산 → CAT/MWT 결합 → 최종 GKTG 게시 → 지도/브리핑 조회다. 운영 Python 파일은 이전에 검증한 이식 모듈을 backend로 이동한 것이며 별도의 근사 계산기를 추가한 것이 아니다.

### 운영 Python: `backend/python/kim_turbulence/`

| 파일 | 역할 |
|---|---|
| `calculate.py` | 새 운영 진입점. 한 예보시각의 전체 3차원장을 계산하고 21층 최종 GKTG를 출력한다. 출력 범위·결측을 검사하고 외곽 10칸 표출 마스크를 적용한다. |
| `python_port.py` | 원본의 전체 실행 순서. 비습 처리·가온도/온위·전단·Ri 등 전처리, 선택 24종 계산, 필터와 최종 결합을 연결한다. |
| `python_core.py` | 격자 기하, 수평/연직 미분, 높이 가중 평균, 평활화, Ri 보정과 REAL/DOUBLE 정밀도 규칙. 여러 지수가 공유한다. |
| `python_dynamics.py` | 변형·관성 가속도·PV·열풍 Ri·NCSU/F3D 등 선택된 동역학 진단의 계산 함수. |
| `python_theta.py` | 등온위 층으로 보간하고 원래 높이로 되돌려 계산하는 Fth 경로. 원본 보간/온위 보정 분기를 보존한다. |
| `python_structure.py` | 구조함수 기반 EDR·산악파 관련 계산. Python 반복문을 Numba로 가속하며 `fastmath=False`다. |
| `python_combine.py` | 원본 고도대 경계·통계 변환·결합·평활화 순서를 적용해 CAT/MWT와 최종 GKTG를 만든다. 단순한 24개 평균이 아니다. |
| `calibration.json` | 실제 선택 24종의 고도대별 구성과 원본 통계 변환 계수·출처 해시. 계산 시 원본 reference 폴더를 읽을 필요가 없다. |
| `input_validation.py` | 입력 격자·압력층 순서·배열 크기·누락/NaN·기온/비습 범위를 검사한다. |
| `products.py` | 24개 지수와 CAT/MWT/GKTG의 이름·원본 번호·단위 목록. 원본 대조와 결과 대응에 사용한다. |
| `requirements.txt` | NumPy/Numba 버전 고정. 배포와 계산 revision에도 반영한다. |
| `__init__.py` | 운영 Python 패키지 식별. 계산식을 별도로 포함하지 않는다. |

### 새 앱 연결 파일

| 파일 | 역할 |
|---|---|
| `backend/src/processors/kim-gktg-processor.js` | 입력 재사용/추가 수집·검증·캐시·Python 실행·timeout/취소·revision·재시도·완전한 회차 게시를 조정한다. |
| `backend/src/briefing/gktg-cross-section.js` | 정확한 예보시각의 GKTG와 같은 입력 hgt를 경로 지점에 샘플링한다. 고도 비교/브리핑이 사용할 원래 21층 단면을 제공한다. |
| `frontend/src/features/weather-overlays/lib/useKimGktg.js` | 공통 회차/시각/기압층 선택의 API 조회·캐시·갱신·빠른 선택 변경·고정 revision을 관리한다. |
| `frontend/src/features/weather-overlays/lib/gktgOverlaySync.js` | GKTG 격자를 공통 색상으로 지도 이미지에 변환하고 source/layer 설치·갱신·스타일 복구·정리를 맡는다. |
| `shared/gktg.js` | 모든 소비자의 단정밀도 등급 경계와 원본 색상 정의를 공유한다. |
| `scripts/collect-kim-gktg.mjs` | 수동 CLI. 별도 계산 구현 없이 정기/ADMIN과 같은 processor를 호출한다. |
| `scripts/setup-gktg-python.sh` | Python 버전 확인·venv 생성·고정 의존성 설치. bootstrap/full deploy가 재사용한다. |

GKTG 저장소/API를 따로 운영하지 않는다. 기존 `kim-nwp-model.js`·`kim-nwp-store.js`·`server.js`를 확장했다. 키 배분도 기존 `kim-run-credential.js`, 지도 조합도 기존 `useNwpOverlays.js`, 스케줄·ADMIN·브리핑도 기존 소유 모듈에 연결했다.

### 검증과 이전 시험 파일

- `backend/test/gktg-fixture.js`: 작은 가상 격자로 정확한 회차/층/revision을 만드는 테스트 입력.
- `backend/test/kim-gktg.test.js`: 완전 게시·불완전 보존·취소·손상 복구·단면·스냅샷·추가 operation 검사.
- `shared/gktg.test.js`: 등급 경계·float32 경계·결측·색상 검사.
- `frontend/verification/contracts/kim-gktg.spec.mjs`: 실제 브라우저의 기존 버튼·공통 기압층·revision·스타일 복구 검사.
- `scripts/turbulence/verify_python_port.py`·`fortran_runtime.py`·`build_fortran_reference.py`: 원본 Fortran 별도 실행과 Python 대조. 앱 런타임에서 실행하지 않는다.
- `scripts/turbulence/compare_ktg.py`·`fetch-ktg-comparison.mjs`: 기존 저층 KTG와 같은 회차/시각/고도로 비교하는 도구.

`scripts/turbulence/`의 현재 Python 계산 모듈·계수·의존성 파일은 운영 패키지로 연결한 상대 symlink다. 계산식을 두 벌로 관리하지 않는다. 이전 v3/v4·실험 CLI와 `backend/src/turbulence/experiment-store.js`, frontend `TurbulenceExperiment*` 파일은 과거 시험 파일로 남아 있지만 실시간 server/MapView 경로에서는 연결을 제거했다. 운영 Python 모듈도 이전 근사 계산이나 원본 Fortran 실행기를 호출하지 않는다.
