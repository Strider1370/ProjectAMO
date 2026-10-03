# KIM → GKTG Python 이식

현재 지도 계산은 **kim-gktg-python-v5**다. 실제 운영 메인이 포함하는 TURB
소스의 선택 24종과 CAT/MWT → 최종 GKTG까지 Python으로 옮겼다.
Fortran은 오프라인 대조에서만 실행하며 수집기·앱 계산에서는 실행·빌드하지 않는다.
이전 v3 근사식과 v4 원본 직접 실행은 과거 검증용으로 남긴다.

## 운영 통합

현재 앱의 **기상정보 → 수치모델 → 난류**는 최종 GKTG를 읽는다. 공통 KIM
기압층/시간축·ADMIN·연직단면·비행 전 브리핑·고도 비교·기관 고정 지도에
연결했다. 운영 계산 원본은 `backend/python/kim_turbulence/` 한 벌이고,
이 폴더의 대응 Python 모듈·계수·requirements는 그 원본의 상대 링크다.

```bash
bash scripts/setup-gktg-python.sh
npm run collect:gktg -- --tmfc 2026091006 --hours 6,9
.venvs/kim-gktg/bin/python -m unittest discover -s scripts/turbulence -p 'test_*.py'
```

기본 실행/정기/ADMIN은 F000–F012 전체를 계산하며 `--hours`는 검증 범위 제한이다.
운영 키·환경·정리·API는 [GKTG 운영 안내](../../docs/operations/kim-gktg.md),
실측·남은 검증은 [구현 보고서](../../docs/design/proposals/2026-10-03-kim-gktg-implementation-report.md)를 따른다.

아래 실험 CLI와 자료는 원본 대조·기존 KTG 비교용이다. 시험 API·별도 버튼은
실시간 앱에서 제거했으며 새 운영 결과는 `DATA_PATH/kim_nwp/`에 저장한다.

## 오프라인 실험 실행

```bash
uv venv .artifacts/turbulence-venv
uv pip install --python .artifacts/turbulence-venv/bin/python -r scripts/turbulence/requirements.txt
npm run experiment:turbulence -- --output-root backend/data
.artifacts/turbulence-venv/bin/python -m unittest discover -s scripts/turbulence -p 'test_*.py'
```

NumPy 2.5.3·Numba 0.68.0을 고정한다. Python으로 작성한 구조함수 반복문은
Numba로 가속하며 fastmath는 사용하지 않는다. [Numba 의존성 지원표](https://numba.readthedocs.io/en/stable/user/installing.html#version-support-information).
`uv`가 없으면 표준 venv·pip를 사용한다. Python은 `--python <path>` 또는
`KIM_TURBULENCE_PYTHON`으로 지정한다. 앱 npm 의존성에는 컴파일러를 추가하지 않는다.
CLI는 `--tmfc <UTC YYYYMMDDHH> --hours 6,9 --source-root <data root>
--output-root <data root> --python <python path>`를 지원한다.

저장된 KIM `2026091006`, +6/+9시간의 21개 압력층을 사용한다.
지원 영역은 국내 205×169 격자(119–136°E, 30–44°N)다. 같은 발표·예보시간의
모든 입력이 완전해야 한다. 입력 누락·NaN·격자·단위 오류는 계산 전에 실패시킨다.
입력 캐시는 `artifacts/kim-turbulence-demo/inputs/<tmfc>/`에 있다.

`.env`의 **KMA_RADAR_SATELLITE_AUTH_KEY**만 사용한다. 기존 u/v/T/hgt/q와
1000–300 hPa w 캐시를 이용하며, 추가 변수는 ps/topo/hpbl와 250/200/150 hPa w다.
기존 요청량 기록·재시도 경로를 사용하고 인증키·인증 URL을 저장하지 않는다.
당시 v5 실험 재계산은 캐시로 수행해 새 외부 요청이 없었다. 운영 통합은 위 안내를 따른다.

이전 `난류(실험)` UI에서 GKTG/CAT/MWT/24종을 표시했다. 현재 앱은 최종 GKTG만 기존 `난류` 버튼에서 표시한다.

## 코드와 원본 대응

| Python | 실제 TURB 소스·역할 |
|---|---|
| `calculate_python.py` | 입력 검사·계산 실행·지도 JSON 게시 준비 |
| `python_port.py` | `indices_gtg40ARismwtNoRi.f`의 선택된 계산 순서·전처리·필터 |
| `python_core.py` | 불균등 미분·높이 가중 평균·Ri 보정·원본 필터·지도 계수 |
| `python_dynamics.py` | Def/관성 가속도·UBF/LHFK·PV/RiTW·Roach·NCSU2/F3D |
| `python_theta.py` | `interproutines38.f`의 등온위 왕복 보간과 Fth |
| `python_structure.py` | `sfnroutines40-nofit.f`의 높이 보간·구조함수 |
| `python_combine.py` | 실제 `itfacomp41.f`·`remaproutines31x5.f`의 결합과 저장 순서 |
| `calibration.json` | 실제 DABA 파일의 선택 24종·고도대별 28쌍 계수 |
| `verify_python_port.py` | 별도 원본 Fortran 실행으로 전 지수·게시값 대조 |

low 7 / mid 8 / high 13개의 합집합 24종을 사용한다. PDF remap=2,
동일 가중치, 100–10000 / 11000–20000 / 21000–60000 ft 설정이다.
원본의 REAL 저장 지점·DOUBLE 연산·결측·한쪽 차분·Ri와 혼합비 평활화·
등온위 보간·구조함수·산악파·고도대 합성·지수별 필터를 보존한다.
`clampi`는 작은 양수를 바닥값으로 올리지 않고 0으로 만든다.
선택 흐름에서 SIGW가 상속하는 필터 설정과 원본의 특이한 분기까지 유지한다.
MWT는 원본 493.F처럼 최종 추가 평활화 전 값을 게시한다.

입력은 KIM 비습이고 구름 액체·얼음은 원본 KIM 입력 처리처럼 0이다.
원본 계산에 없는 지하층 공통 마스크를 추가하지 않는다. 외곽 10칸은
표출에서 숨긴다. 계수 재보정·항공기 관측 대조·강도 등급 검증은 아직 하지 않았다.
이식 범위는 프로젝트의 지역 압력층 계산이다. 전 지구 91층 수집·MPI·NetCDF와
1000 ft 최종 .Q 파일까지의 전체 실행 프로그램은 이 시험 범위 밖이다.

## 수치 검증

원본 소스는 변경하지 않고 GNU Fortran으로 컴파일해 오프라인 기준으로 사용한다.
이는 지도 계산을 위해 설치·빌드해야 하는 의존성이 아니다.

```bash
# 원본 대조를 수행할 때만 GNU Fortran 필요
.artifacts/turbulence-venv/bin/python scripts/turbulence/build_fortran_reference.py
.artifacts/turbulence-venv/bin/python scripts/turbulence/verify_python_port.py \
  --input artifacts/kim-turbulence-demo/inputs/2026091006/cube-555cf1f5b4b3cc7b8bfc.json \
  --data-root backend/data --synthetic
```

revision `555cf1f5b4b3cc7b8bfc`의 실제 +6/+9시간, 27종·1,134개 게시 필드를
검증한다. 모든 지수의 결측 위치와 원본 고도대 경계가 일치한다.
각 시각 27종 중 20종은 binary32 값이 정확히 같고 나머지는 float32 수치
허용 오차 이내다. 허용 오차는 지수별 크기에 맞춘 `128*eps*abs(reference)
+8*eps*RMS(reference)`로, 작은 지수에 고정 1e-8 오차를 적용하지 않는다.
온위·혼합비·원시 및 평활 Ri·미분 등 중간값도 대조한다.
합성 입력 세 사례는 해석 가능한 바람/지형, 온위 역전·음수 Ri·영전단,
일정 바람을 포함한다.

검증 표·소스/실행 파일/입력 해시는
`artifacts/kim-turbulence-python-v5/verification.md`·`verification.json`에 있다.
이전 누락과 수정 이력은 [SOURCE_AUDIT.md](SOURCE_AUDIT.md)에 기록했다.
런타임의 참조 Fortran 및 v3 근사 모듈 미호출은 unittest로 검사한다.

## 범례·오프라인 시험 게시

GKTG/CAT/MWT는 실제 NCL의 **0.15 / 0.22 / 0.34**를 따른다.
NIL(<0.15), LGT(0.15–<0.22), MOD(0.22–<0.34), SEV(≥0.34)로 표시한다.
`gui_default`의 10/17/22 색상은 #33ff00 / #ffcc00 / #ff2900이다.
[원본 팔레트](https://raw.githubusercontent.com/NCAR/ncl/develop/ni/src/db/colormaps/gui_default.rgb)와
[NCL 인덱스 문서](https://www.ncl.ucar.edu/Document/Graphics/ColorTables/gui_default.shtml)를
기준으로 확인했다. NIL은 원본 WF 코드의 무색 처리를 적용한다. 지도는
기존 반투명도와 최근접 격자를 사용한다. 원시 지수는 시각·기압층 공통
99백분위 상한의 cividis 구간을 사용하며 난류 강도 등급을 뜻하지 않는다.

결과는 `<output-root>/kim_turbulence_experiment/runs/<revision>/` 아래의
immutable JSON이다. Python 계산 코드·의존성 명세·원본 출처·계수·입력을 해시해 revision을 만든다.
계산과 전체 필드 검증 후 index를 원자적으로 교체하므로 실패 때 마지막
완전한 자료를 유지한다. GET 요청은 계산·외부 API 호출을 실행하지 않는다.

- 운영 API: `/api/kim/gktg/index` 및 `/api/kim/gktg/field?tmfc=...&hf=6&level=500hPa&revision=...`. 정확한 선택의 원시값을 읽으며 결측은 null이다. 이전 turbulence-experiment 앱 API는 제거했다.
- `npm run check`: 앱 테스트·프론트엔드 빌드.
- Python unittest: 런타임의 Fortran 분리, 24종 선택, Ri·필터·MWT 저장 순서, 입력·참조 실패와 비교 도구 회귀.
- `verify_python_port.py`: 원본 Fortran 별도 실행과 Python 및 게시값의 전 필드 대조.
- 브라우저 계약 `kim-gktg`: 기존 난류 버튼·공통 기압층·불변 revision·반응형·스타일 복원.

실제 자료로 찍은 화면은 `artifacts/kim-turbulence-demo/gktg-python-v5-500hPa.png`다.

## 기존 ‘난류’ KTG와 비교

대체 전 지도 난류 레이어는 `/api/ktg/grid`의 저층 KTG였다. 임계값은
0.30 / 0.475 / 0.75이므로 GKTG의 원시값·강도 구간과 구분한다.

```bash
node scripts/turbulence/fetch-ktg-comparison.mjs
.artifacts/turbulence-venv/bin/python scripts/turbulence/compare_ktg.py
# 지도 생성은 선택적으로 matplotlib 설치 후 --plots 사용
.artifacts/turbulence-venv/bin/python scripts/turbulence/compare_ktg.py --plots
```

다운로드는 기존 KTG 수집 경로의 키를 명시적으로 사용한다. `--credential radar`는
레이더/위성 키만 시도하며 자동 대체하지 않는다. 이전 사례에서 radar 키는 403,
기존 수집용 키는 정상 응답했다. 인증키·URL을 기록하지 않으며 운용 latest/index를
바꾸지 않는다. 응답의 모델·발표·예보시간을 확인하고 기존 요청량 계측을 사용한다.

같은 발표와 revision의 입력 hgt로 높이를 근사해 1,000–10,000 ft 연직 보간 후
KTG 좌표로 이중선형 보간한다. 공통 유효값만 비교하며 외삽하지 않는다.
공간 상관·각 제품의 고유 등급 일치·LGT+ 겹침을 전체 영역과 국내 관심영역
(124–132°E, 32–39°N, 바다 포함)에서 기록한다. 결과는
`artifacts/kim-turbulence-comparison/comparison.md`·JSON이다. 결과의 algorithm·revision을 확인해 현재 계산과 같은 버전인지 확인한다. 관측 정확도 검증을 대신하지 않는다.
