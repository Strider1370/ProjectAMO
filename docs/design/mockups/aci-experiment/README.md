# CAPE·강수강도·OLR 실험 지수

보고서의 반올림된 다항식 계수를 사용하지 않는 3변수 시제품이다. CAPE와 강수강도는 증가할수록, OLR은 감소할수록 점수를 높이는 구간별 선형 함수를 사용한다. 초기 기준은 실험용 설정이며 관측으로 보정하지 않았다.

| 입력 | 0점 | 1점 | 초기 가중치 |
|---|---:|---:|---:|
| 지표 기반 CAPE | 0 J/kg | 1000 J/kg | 1/3 |
| 강수강도 | 0 mm/h | 5 mm/h | 1/3 |
| OLR | 250 W/m² | 150 W/m² | 1/3 |

구간 밖에서는 각 점수를 0 또는 1로 제한한다. 가중치는 합이 1이 되도록 정규화한다. 입력 하나라도 결측이면 결과도 결측이다. 모든 가중치가 0이거나 상한이 하한 이하이면 계산하지 않는다. 점수는 발생 확률이 아니며 원본 ACIM의 비행고도 변환표를 적용하지 않는다.

## 실제 자료 예시

KIMG/NE57 실행 `2026092306`, 예보 `+3h`, 유효시각 `2026-09-23T09:00:00Z`(18:00 KST)를 사용한다. 기존 프로젝트 저장 자료의 21개 등압면 `T`, `q`와 같은 시각의 API `ps`, `t2m`, `q2m`, `pr`, `ulwrtoa`를 결합한다. 2026-10-09에 지상·강수·OLR 5개 요청을 수행했다. 최신 예보가 아닌 과거 자료 재계산이다.

CAPE는 MetPy 1.7.1 `surface_based_cape_cin`으로 계산한다. 기압 내림차순으로 지상 값을 먼저 넣고 지상기압 이상의 등압면은 제외한다. `q`는 비습이므로 `dewpoint_from_specific_humidity`로 이슬점을 구한다. 습도 양자화로 이슬점이 기온을 넘으면 기온으로 제한하며, 상층 비습 0은 계산을 위한 `1e-8`로 대체한다. 연직 자료는 150hPa까지이므로 EL이 그보다 높으면 잘린 적분이 된다. 최대 CAPE 예시는 약 2631 J/kg이다. 비정상 계산값 1,129개는 결측으로 남겼다.

강수는 KIM `pr`의 kg/m²/s에 3600을 곱한 mm/h 상당 강도다. 보고서의 3시간 누적강수량과 다른 입력이다. 시간 최대 CAPE 또는 평균 OLR도 적용하지 않은 단일 예보시각 예시다. 205×169, 1/12도 원본 격자 34,645개를 생략 없이 계산했다. 정상 결과 33,516개를 표시하며 격자 간격은 약 7~9km다. 세 입력 모두 같은 격자의 같은 시각을 사용한다.

## 실행

저장소 루트에서 별도 Python 환경을 사용한다. 프로젝트 운영 의존성은 변경하지 않는다.

```bash
uv venv --python 3.13 artifacts/aci-experiment/env
uv pip install --python artifacts/aci-experiment/env/bin/python 'metpy==1.7.1'
node docs/design/mockups/aci-experiment/collect.mjs
artifacts/aci-experiment/env/bin/python docs/design/mockups/aci-experiment/cape.py
node docs/design/mockups/aci-experiment/build.mjs
python3 -m http.server 8766 --bind 0.0.0.0 --directory artifacts/aci-experiment/public
```

`collect.mjs`는 지정한 회차의 API 입력만 수동 수집하고 기존 스케줄러를 실행하지 않는다. API 응답은 `artifacts/aci-experiment/private`에 캐시하며, 서버는 계산 결과와 완성 HTML이 있는 `public` 폴더만 제공한다. 표준 수집 예산·인증 정책을 사용한다.

검증:

```bash
node --test docs/design/mockups/aci-experiment/calculation.test.mjs
node artifacts/aci-experiment/verify.mjs
```

점수의 단조성·경곗값·결측·가중치 검사를 포함한다. 브라우저에서는 실제 자료의 점수를 독립 산술로 대조하고 시간대·설정 오류·변수 선택·모바일 화면을 검사한다. CAPE의 별도 점검에서는 안정한 연직 구조의 0값, 지하층 제외, 상층 결측 거부를 확인했다. 이는 수학·화면 검증이며 기상 예측 성능 검증은 아니다.

자료 계산 근거: [MetPy CAPE](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.surface_based_cape_cin.html), [비습으로부터 이슬점](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.dewpoint_from_specific_humidity.html). 임계값과 가중치는 위 자료에서 도출한 값이 아닌 시제품의 조절 가능한 설정이다.

## 프로젝트 지도

`npm run dev:test`로 실행한 `http://localhost:5173`에서 **기상정보 → 수치모델 → 대류 실험**을 켠다. 개발 서버에만 노출되며 기존 위성 ‘대류 가능성’과 독립적이다. 저장된 2026-09-23 06 UTC 회차의 +3h 자료를 사용한다. 실제 자료는 `frontend/public/data/aci-experiment/2026092306-hf003.json`이며 수집 스크립트 결과 `artifacts/aci-experiment/public/data.json`을 복사한 것이다. 최신 자동 갱신·타임라인 연동은 하지 않는다.

범례에서 임계값과 가중치를 바꾸고 ‘지도에 적용’을 누르면 점수와 색이 다시 계산된다. 격자를 클릭하면 입력값과 세 변수의 기여도를 표시한다. 0.25 미만은 투명하며 결측은 표시하지 않는다. 원본 격자 영역 안에서 각 원본 격자점을 사각형으로 표시하므로 경계는 실제 대류영역 경계가 아니다. 지도와 HTML의 점수 계산은 `frontend/src/features/weather-overlays/lib/aciExperimentScore.js`를 함께 사용한다.
