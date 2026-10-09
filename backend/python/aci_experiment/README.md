# 3변수 실험 ACI용 컴파일 CAPE 후보

상태: 로컬 검증 후보. 기존 운영 collector/derived worker와 연결하지 않았으며 개발 지도 결과도 교체하지 않았다.

`kernel.py`는 Float64 Numba nopython 커널이다. MetPy1.7.1의 열역학 정의, LCL, 지상 parcel, 가상온도, LFC/EL 선택 및 로그기압 적분을 따른다. 습윤 상승 적분은 LSODA 대신 기본 최대20hPa 간격 RK4를 사용한다. 1hPa 및0.5hPa 간격으로 줄인 기준 결과와 비교한다. `fastmath`와 수평 격자 표본화는 사용하지 않는다. 프로젝트의 혼합층 parcel Fortran 알고리즘으로 대체한 것이 아니다.

`engine.py`는 배열 모양·압력 순서·적분 간격을 검증한다. 부력이0 근처인 수준에서 수치 적분 오차로 교차점 선택이 달라질 수 있어 해당 열만 기존 MetPy로 재확인한다. 커널의 상태3은 이 재확인을 요청하는 내부 값이며 결측으로 게시하지 않는다. 결과 상태0=정상,1=입력 불충분/비정상,2=비정상 계산값이다. 기본 입력 범위·지하층 제외·비습0 및 이슬점 제한 정책은 현재 시제품과 같다. 150hPa 상한의 한계는 유지된다.

## 재현

저장소 루트, Python3.13 기준. 프로젝트 운영 환경과 별개의 검증 환경을 사용한다.

```bash
uv venv --python 3.13 artifacts/aci-experiment/env
uv pip install --python artifacts/aci-experiment/env/bin/python -r backend/python/aci_experiment/requirements-verify.txt
NUMBA_CACHE_DIR="$PWD/artifacts/aci-capacity/numba-cache" PYTHONDONTWRITEBYTECODE=1 artifacts/aci-experiment/env/bin/python backend/python/aci_experiment/test_kernel.py
```

테스트8개는 안정/불안정·고산지대 연직 구조, 적분 간격 수렴, 지하층 제외, 결측, 포화 지상, 실제 교차점 회귀사례, 잘못된 적분 간격·압력 순서를 검사한다. 입력 단위는 Pa/K/kg/kg이고 등압면은 내림차순이다. 테스트 실행 중 upstream API를 호출하지 않는다.

전체 실제 자료 검증은 기존 시제품의 `artifacts/aci-experiment/private/inputs.json`, `artifacts/aci-experiment/public/data.json`이 필요하다. 검증용으로 배열을 준비한다:

```bash
artifacts/aci-experiment/env/bin/python - <<'PY'
import json
from pathlib import Path
import numpy as np
points=json.loads(Path('artifacts/aci-experiment/private/inputs.json').read_text())['points']
np.savez('artifacts/aci-capacity/kernel-inputs.npz',
  surface=np.array([[p['ps'],p['t2m'],p['q2m']] for p in points]),
  levels=np.array([v['p']*100 for v in points[0]['profile']]),
  t=np.array([[v['T'] for v in p['profile']] for p in points],float),
  q=np.array([[v['q'] for v in p['profile']] for p in points],float))
PY
NUMBA_CACHE_DIR="$PWD/artifacts/aci-capacity/numba-cache" PYTHONDONTWRITEBYTECODE=1 artifacts/aci-experiment/env/bin/python backend/python/aci_experiment/verify_local.py
NUMBA_CACHE_DIR="$PWD/artifacts/aci-capacity/numba-cache" PYTHONDONTWRITEBYTECODE=1 artifacts/aci-experiment/env/bin/python backend/python/aci_experiment/benchmark_shape.py
```

`verify_local.py`는 기존34,645개 실제 지표 프로파일 결과와 CAPE/CIN·결측·점수 색구간을 비교하고100Pa/50Pa 적분 간격 결과를 비교한다. 허용 CAPE/CIN 오차는 `max(1J/kg, 기준의0.1%)`다.

`benchmark_shape.py`는 같은 실제 프로파일을 반복하여841×529개 작업을64×64 블록, 단일 worker로 수행한다. **전체 확대영역의 실제 기상 자료를 사용한 검증이 아니다.** 특정 로컬 CPU에서의 산술 작업량 시험이며 운영 VM 속도나 다른 계절의 정확도를 보장하지 않는다.

## 운영 연결 전에 남은 일

- 실제 확대영역·다른 회차/계절의 MetPy 비교, 재확인 비율 측정.
- NC 블록 읽기/쓰기와 기존 derived worker 연결, 전체62개 시각 작업 스케줄 검증.
- 첫 컴파일/캐시 손상·알고리즘 버전·CPU 제한, 운영 RSS/CPU/게시 완료시간 측정.
- 150hPa 상한 상태와 입력/계산 실패 원인을 결과 메타에 기록.
- 운영 Python 환경의 MetPy/Numba 의존성 설치·배포 경로 준비. 현재 requirements 파일은 로컬 검증용이다.

MetPy를 참고한 계산 부분의 라이선스는 `METPY-LICENSE`에 보존했다. 이 커널은 운정고도나 발생 확률을 산출하지 않는다.
