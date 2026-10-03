# TURB 실제 실행 경로 재대조 — 2026-10-03

현재 계산은 **Python 완전 이식 v5**다. 아래 v3 근사와 v4 Fortran 직접
실행 기록은 과거 구현의 검증 이력이다. 현재 이식과 대조 결과는 마지막 절에 있다.

## 기준 경로

`SHEL/amo_gdps_diag_gktg_body2_12hr.ksh` 69행은
`EXEC/g_ktg_score_8km_KIM_global_mpi_remap_main`을 호출한다.
대응 메인 `.f` 4523–4530행에서 실제 포함하는 파일은
`indices_gtg40ARismwtNoRi.f`, `interproutines38.f`, `itfacomp41.f`,
`remaproutines31x5.f`다. 수정본·백업본을 선택 기준으로 사용하지 않는다.

제공된 EXEC 실행 파일의 `itfamax_`를 objdump로 확인했다.
`meanfilter3d_` 호출 두 개와 `itfamax smooth` 출력 문자열이 있고,
별도 수정본의 `simplified/robust` 문자열은 없다. 메인 include의
최종 평활화 경로를 지지하는 증거다. 이것만으로 모든 소스가 해당
실행 파일과 일치한다고 증명하지는 않는다.

제공된 빌드 스크립트는 Intel MPI Fortran과 NetCDF Fortran을 요구한다.
현재 환경에서 해당 컴파일러와 런타임이 확인되지 않았으므로 운영
실행 파일을 실행해 전체 수치 일치를 검증한 상태는 아니다.

## 확인 및 수정

| 항목 | 실제 기준 | 시험 구현 v3 |
|---|---|---|
| 선택 지수 | 계수 파일 low 7 / mid 8 / high 13, 합집합 24 | 유지 |
| 통계 변환 | 선택 지수의 고도대별 a/b 28쌍, PDF remap=2 | 28쌍 재대조 일치 |
| 범주 결합 | equal weights, itfasum의 결측 누적값 유지 | 엄격한 완전성 평균을 제거하고 원본 순서 적용 |
| 최종 결합 | itfacomp41.f 1173–1176행, CAT/MWT 모두 필요 | 한 성분 대체 분기 제거 |
| 고도대 | GetkBdys(.F), 왼쪽 두 계산 열의 최저 지면층 지점 | 임의의 격자별 고도 혼합 제거 |
| 지역 경계 | MergeRegions, 중심→상층→하층 순서 | 갱신된 중심을 사용하는 원본 순서 적용 |
| 최종 필터 | itfacomp41.f 1204–1209행, GTGMAX/MWT만 마지막 고도대 | 누락된 평활화 적용; CAT는 추가 평활화하지 않음 |
| 역 Ri 상한 | indices 소스 1250행 부근 및 1370행 부근, 평활화→상한 100 | 평활화 전 상한 제거 |
| N² | stabd/mirregzk의 평균 온위 + Nsqcomp의 추가 연직 필터 | 중심 온위 분모와 필터 누락 수정 |
| 공통 필터 | meanFilter3D, y→x→z, 결측 triplet 건너뜀 | 유효 이웃 재정규화 제거 |

v2는 별도 수정본을 따랐고 위 순서 차이가 있었다. v2로 계산한 기존
KTG 비교 수치는 v3의 결과나 원본 Fortran 결과로 해석하면 안 된다.

## 남은 검증 범위

이 문서는 실제로 호출되는 소스의 선택과 확인한 처리 순서를 기록한다.
24종 전체의 수치 일치를 인증하는 문서가 아니다. 21개 지역 압력층,
native 비습 입력, 지역 경계, 등온위 계산의 근사 및 보간 차이는
README의 미검증 사항으로 남는다. 아래 직접 실행 비교로 개별
진단지수→범주→최종 결과의 차이를 확인했다.

지도 범례는 실제 NCL의 0.15 / 0.22 / 0.34를 유지한다.
기존 KTG와 비슷하게 보이도록 계수나 임계값을 조정하지 않는다.

## 같은 입력으로 원본 루틴 직접 실행

GNU Fortran 13.4를 작업 폴더 안에 준비하고 실제 include 소스를 수정 없이
컴파일했다. 비교 어댑터와 원문 그대로 추출한 CheckIndices·AVEVAR를 연결해
indices_gtg → GetkBdys → ITFA_MWT → ITFA_static → itfamax를 실행했다.
전체 Intel MPI 실행 파일을 실행한 것은 아니다.

입력은 현재 Python v3 revision `23e36094c2caa0569e8c`의 KIM 2026091006
+6/+9시간, 205×169×21이다. 공통 계산 경계 10칸, 통계 제외 경계 20칸을
사용했다. binary32 입력의 원본 u/v/T/hgt/pressure 저장값이 정확히 일치하며,
24종 선택, 28쌍 계수·동일 가중치, 고도대 경계가 일치하는지 검사했다.

| 대조 단계 | +6시간 | +9시간 | 판단 |
|---|---:|---:|---|
| 최종 GKTG 상관, 전체 압력층 | 0.9489 | 0.9543 | 큰 분포는 유사하나 수치 불일치 |
| 최종 GKTG RMSE | 0.017984 | 0.016583 | 평균 편향 약 +0.0085–0.0088 |
| 원본 24종을 넣은 GKTG 결합 RMSE | 9.08e-9 | 8.98e-9 | 비교 격자 전부 지정 허용오차 이내 |
| Fth/Ri 상관 | 0.0798 | 0.0186 | 개별 진단 계산 이식 불일치 |
| 1/SATRi 상관 | 0.2513 | 0.2646 | Ri 계산부터 추가 대조 필요 |

원본 혼합비의 1회 수평·연직 평활화(소스 655–659행)가 현재 Python에 빠져
있다. Fth/Ri의 명시적 등온위 보간을 근사한 경로도 그대로 같은 식이 아니다.
README에서 NCSU2까지 명시적 재격자화라고 설명했던 부분은 정정했다.
각 차이의 기여도를 모두 분리해 검증한 상태는 아니다.

원본은 MWT의 493.F를 itfamax 전에 저장하고 itfamax에서 내부 MWT만 추가
평활화한다. Python은 추가 평활화된 배열을 저장하므로 493.F와는 저장 시점
차이가 있다. 같은 원시 지수를 넣어 원본 내부 배열과 대조하면 MWT RMSE는
약 3.2e-9다. CAT·GKTG와 이 차이를 구분해 기록했다.

재현 명령은 README의 ‘원본 Fortran 직접 실행 비교’를 참조한다. 전체 결과,
기압층별 통계, 결측 차이, 지도, 빌드/소스/입력 해시는 ignored
`artifacts/kim-turbulence-fortran/`에 있다. 현재 시험 표출값은 변경하지 않았다.

## v4 수정: 원본 직접 계산을 지도에 연결

Python 근사 계산 경로를 기본 수집기에서 제거했다. v4 당시
`calculate_fortran.py` → 어댑터 active-main → 원본 `indices_gtg` → 원본
`ITFAcompF`가 실행된다. 습도 평활화·온위·Ri·등온위 보간·구조함수·산악파·
결합·필터를 모두 원본 소스가 수행한다. 원본 소스 파일은 수정하지 않았다.
이전 `calculate.py`는 과거 비교용이며 직접 실행을 차단했다.

원본 492.F / 493.F / 494.F를 읽어 CAT/MWT/GKTG를 저장한다. MWT의 저장
시점 차이도 제거했다. binary32 실수를 JSON에서 별도로 반올림하지 않는다.
지역 계산 경계 10칸은 표출에서 숨긴다. 입력 누락·NaN·빌드 변경을 감지하면
실패시키고 마지막 완전한 index를 유지하며 근사 계산으로 대체하지 않는다.

KIM 2026091006 +6/+9시간의 같은 205×169×21 입력, revision
`e2a27d4c4b08c8a5f55c`에서 검증했다. 독립 대조는 이전처럼 GetkBdys →
ITFA_MWT → ITFA_static → itfamax를 직접 호출했다. 게시된 24종과 CAT/MWT/
GKTG 총 27종의 1,134개 필드에서 모든 계산 격자의 실수 값과 결측이 정확히
일치했다. **모든 지수의 RMSE·최대 절대 오차는 0**이다.

출처·입력·계수·가중치 검증과 결과는
`artifacts/kim-turbulence-fortran-v4/verification.md`·JSON에 있다.
이 검증 범위는 지역 21층의 원본 계산과 게시값이다. 전체 Intel MPI·NetCDF·
91층 전 지구 실행 및 1000 ft 최종 .Q와의 동일성은 확인한 상태가 아니다.

수정 검증: Python 29개 통과, `npm run check` 통과, 브라우저 계약 desktop /
ipad-landscape / mobile 3개 통과. 사용자 개발 서버를 유지하기 위해 Playwright의
명시적 서버 재사용 설정으로 실행했다. 실제 API 응답이 검증한 게시 파일과
일치하고 지도에서 GKTG·Fth/Ri 및 두 시각을 선택했을 때 pageerror가 없음을
확인했다. 실제 화면은 `artifacts/kim-turbulence-demo/`에 있다.
기존 KTG 비교도 수정된 v4로 다시 생성했으며 결과 파일에 새 revision을 기록했다.

## v5 수정: 선택 24종과 결합을 Python으로 완전 이식

현재 `calculate_python.py` → `python_port.py`가 계산하며 Fortran 실행·빌드를
호출하지 않는다. NumPy REAL/DOUBLE 연산과 Python 구조함수 반복문을 사용한다.
구조함수 반복문만 Numba로 가속하며 fastmath는 끈다. v3 근사 모듈을 가져오지 않는다.
Fortran은 `verify_python_port.py`에서 원본 소스를 대조하는 기준으로만 사용한다.

실제 소스의 다음 처리와 순서를 보존했다.

- 비습→혼합비 변환과 전체 격자 수평·연직 평활화, Tv/온위의 REAL 저장 시점.
- 불균등 연직 미분, 높이 가중 평균, 영전단 처리, 음수 Ri 매핑 후 Ri 평활화.
- 지수별 미분 좌표·이산 지도 계수·결측 및 한쪽 차분 처리.
- Fth의 등온위면 보간·온위 단조 조정·외삽 후 원래 높이로 되돌리는 보간.
- 5×5×3 높이 보간·네 거리의 구조함수와 원본 PDF 변환.
- 산악파 저층 탐색과 지형 필터, 각 지수의 고유 필터와 `clampi`의 작은 값→0 처리.
- 실제 선택 흐름에서 SIGW가 상속하는 필터 0/0; 임의로 1/1을 지정하지 않는다.
- `Def2dz`의 실제 dzdx 사용, `vort2dz`의 한쪽 차분 조건, scalar 높이 보간의
  미할당 작업 배열 유지처럼 원본에 있는 특이한 동작도 그대로 유지한다.
- 동일 가중 CAT/MWT 누적과 결측 처리, 고도대 경계 합성 순서, 최종 고층 필터,
  493.F에 해당하는 MWT의 추가 필터 이전 저장 시점.

revision `555cf1f5b4b3cc7b8bfc`의 실제 +6/+9시간, 27종·1,134개 게시 필드를
원본 `indices_gtg → ITFAcompF`와 대조했다. 중간값·고도대 경계·결측 위치도
확인한다. 각 시각 27종 중 20종은 binary32 값이 정확히 같으며, 나머지는
단정밀도 수치 허용 오차를 적용한다. 단순한 고정 절대 오차로 작은 지수의
차이를 덮지 않고 각 지수의 크기와 float32 epsilon으로 오차를 평가한다.
해석 가능한 합성 입력, 온위 역전/음수 Ri/영전단, 일정 바람의 세 사례도 대조한다.

과학 검증과 소스·실행 파일 해시는 `artifacts/kim-turbulence-python-v5/verification.json`,
사람이 읽는 표는 같은 폴더의 `verification.md`다. 원본 파일은 수정하지 않았다.
현재 지도 연결은 지역 21개 압력층의 계산이며 전체 전 지구 91층 수집·MPI·
1000 ft .Q 출력 파이프라인을 이식한 것은 아니다.

실제 +6/+9시간 GKTG 최대 절대 오차는 각각 8.941e-8 / 5.960e-8,
RMSE는 7.095e-9 / 7.006e-9다. 두 실제 입력과 세 합성 입력 모두 전 지수·
중간값·결측·고도대 경계 검증을 통과했고, 게시된 1,134개 필드는 Python
계산값과 정확히 같다. Python unittest 35개, `npm run check`, 브라우저 계약
desktop / ipad-landscape / mobile 3개가 통과했다. 서버를 유지한 채 실제
API와 지도에서 두 시각·지수를 선택하고 pageerror가 없음을 확인했다.
화면은 `artifacts/kim-turbulence-demo/gktg-python-v5-500hPa.png`다.
