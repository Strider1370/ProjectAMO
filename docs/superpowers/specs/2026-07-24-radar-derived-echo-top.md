# Spec: 레이더 원자료 기반 재산출 Echo Top

**Status:** Ready for planning and implementation
**Created:** 2026-07-24
**Last validated:** 2026-07-25

## Goal

조종사가 지도에서 대류 셀의 반사도와 수직 발달을 함께 판독할 수 있게, 기상청 레이더 사이트 QCD 원자료로부터 **18 dBZ Echo Top**을 재산출해 독립 지도 레이어로 제공한다.

표시는 KMA 공식 Echo Top이 아니라 ProjectAMO가 원자료로 계산한 참고용 산출물이다. 항공 위험등급, 자동 회피 권고, Go/No-go 판단을 제공하지 않는다.

## Decisions Already Made

- 기준 반사도는 **18 dBZ**로 고정한다. 초기 버전에는 사용자 임계값 선택을 넣지 않는다.
- 표시는 해발고도(MSL) 기준으로 한다. UI의 주 표기는 비행고도(FL 또는 ft MSL 중 기존 지도 표현과 일관된 방식)로 하고, 실제 단위와 기준은 범례·상세정보에서 명확히 밝힌다.
- Echo Top 레이어는 기본 OFF이며, 현재 레이더의 5분 시간축을 공유한다.
- 선택한 5분 시각과 실제 관측시각이 맞는 프레임만 표시한다. 이전 프레임을 새 시각 자료처럼 재사용하지 않는다.
- 브라우저에는 원시 레이더 파일을 보내지 않는다. 다운로드·파싱·계산·합성은 백엔드에서 수행한다.
- 호출 키는 `KMA_RADAR_SATELLITE_AUTH_KEY`를 사용한다. KIM NWP 및 항공기상 키와 섞지 않는다.

## Validated Data Source

### Operational source

현재 운영 가능한 경로는 KMA API Hub **레이더 사이트 자료 다운로드 2.1**의 QCD HDF5 파일이다.

```text
https://apihub.kma.go.kr/api/typ04/url/rdr_site_file.php
  ?tm={KST_YYYYMMDDHHmm}
  &data=qcd
  &stn={RADAR_SITE}
  &authKey={KMA_RADAR_SATELLITE_AUTH_KEY}
```

- 2026-07-25에 권한이 부여된 키로 `KWK`, `tm=202607252035`, `data=qcd`를 실제 요청해 HTTP 200 HDF5 파일(1,067,149 bytes)을 확인했다.
- 해당 파일은 `Conventions: Cf/Radial`, `version: CF-Radial v2.2`인 HDF5/NetCDF 계열 자료였다.
- 검증 표본에는 9개 sweep, 3,240개 ray, ray당 960 range gate가 있었다.
- `DBZH`는 `equivalent_reflectivity_factor_h`, 단위 `dBZ`, `scale_factor=0.01`, `_FillValue=-32768`인 `Int16` 반사도 배열이었다.
- 파일에는 레이더 위경도·해발고도, ray별 `elevation`/`azimuth`, `range`, sweep 경계, `time_coverage_start`/`time_coverage_end`가 들어 있다.
- 같은 표본에서 DBZH 18 dBZ 이상 gate 7,170개와 최고 빔 중심 약 9,327 m / 30,600 ft MSL를 실제로 계산해, 원자료로 Echo Top을 산출할 수 있음을 확인했다.

### Explicitly rejected source

과거 UF 경로(`typ01`의 `nph-rdr_uf_data`)는 최신 QCD 운영 수집에 사용하지 않는다. 2026-07-25 최신 시각 요청은 파일 부재를 반환했고, 응답은 QCD 자료가 2017-12-15까지만 제공된다고 명시했다. 이 경로는 과거 표본 검증 전용일 뿐 운영 Echo Top의 의존성이 아니다.

## Scientific Processing Contract

1. 각 레이더 사이트·선택 시각마다 QCD HDF5 한 파일을 요청한다.
2. `DBZH`만 사용한다. `_FillValue`, 결측, 비정상 range/geometry gate는 제외한다. 저장 정수값에 `scale_factor`를 적용한 뒤 dBZ로 판정한다.
3. 파일의 레이더 해발고도, range gate 중심 거리, ray 고도각을 이용해 표준 **4/3 지구반경** 빔 기하로 각 gate의 MSL 고도를 계산한다.

   ```text
   R_e = 4/3 × 6,371,008.8 m
   h_msl = sqrt(r² + R_e² + 2rR_e sin(elevation)) - R_e + radar_altitude_msl
   ```

4. 같은 방위·거리의 sweep 관측을 정렬해 가장 높은 `DBZH >= 18 dBZ` 위치를 찾는다. 바로 위의 유효 관측이 18 dBZ 미만이면 두 관측 사이의 18 dBZ 교차 고도를 선형 보간한다.
5. 유효한 상부 bracket이 없으면 임의로 외삽하지 않는다. 최고 18 dBZ 이상 빔 중심 고도를 보수적인 하한으로 사용하고, 메타데이터에서 보간 불가 상태를 구분할 수 있게 한다.
6. 사이트 산출물은 공통 지도 격자 또는 이미지로 재투영·합성한다. 중첩 영역은 더 높은 Echo Top을 우선하되, 사이트별 실제 관측시각과 품질 상태를 함께 보존한다.

이 산출물은 레이더 빔, 차폐, 빔 확산, 수직 샘플링 한계를 가진다. 지형·이상전파·레이더 간 시간차를 보정한 공식 기상청 ETOP으로 주장하지 않는다.

## Functional Requirements

- FR-001: 백엔드는 설정된 각 운영 레이더 사이트에 대해 5분 시간축의 QCD HDF5 파일을 수집하고, 파일의 실제 `time_coverage_start/end` 및 사이트 식별자를 기록해야 한다.
- FR-002: 요청 시각과 파일의 실제 관측시각이 같은 5분 bucket에 속하지 않으면 해당 파일을 그 프레임에 발행해서는 안 된다.
- FR-003: 백엔드는 위 Scientific Processing Contract에 따라 DBZH 18 dBZ Echo Top MSL 값을 산출해야 한다.
- FR-004: 사이트 하나의 다운로드·파싱·계산 실패는 다른 정상 사이트의 산출물을 폐기하지 않아야 한다. 프레임 메타데이터에는 성공·결측·지연·실패 사이트가 식별 가능해야 한다.
- FR-005: 레이어는 독립 토글로 제공하며 기본 OFF다. ON일 때에만 현재 선택된 레이더 5분 시각과 정확히 맞는 정상 Echo Top 프레임을 표시한다.
- FR-006: 지도 범례와 클릭 상세정보에는 `재산출 Echo Top`, `18 dBZ`, `MSL`, 실제 관측시각을 표시해야 한다. KMA 공식 산출물로 오인될 표기는 금지한다.
- FR-007: Echo Top 클릭 시 해당 위치의 Echo Top 값과 단위를 직관적으로 보여 주고, 값이 보간인지 보수적 빔 중심 하한인지 보조 정보로 제공해야 한다.
- FR-008: 기존 최대반사도, 최대반사도 고도, 위성 운정고도, 대류운 발생탐지와 데이터 원천·의미가 다른 독립 레이어로 유지해야 한다.
- FR-009: HDF5 원본, API 키, 사이트별 원시 gate 배열은 브라우저 응답·정적 파일·로그에 노출하면 안 된다.

## UI / State Contract

| Situation | Required behavior |
|---|---|
| Initial state | Echo Top 레이어는 OFF다. |
| Valid current frame | 18 dBZ 기준의 색상화된 Echo Top과 범례를 표시한다. 범례는 MSL/FL 기준을 혼동 없이 표기한다. |
| Clicked map point | Echo Top 값과 유효 관측시각을 강조하고, `재산출 · 18 dBZ · MSL` 및 보간 상태를 보조 정보로 표시한다. |
| No matching frame | 해당 시각에는 레이어를 숨기고 자료 없음을 표시한다. |
| Partial site coverage | 정상 사이트만 합성한다. 부분 커버리지임을 식별 가능하게 표시한다. |
| Late/stale file | 선택 시각의 레이어로 발행하지 않는다. 이전 결과를 새 시각처럼 표시하지 않는다. |
| New calculation in progress | 마지막 정상 프레임은 그 프레임의 실제 시각을 유지한 채 표시할 수 있으나, 새 선택시각 결과로 오인시키면 안 된다. |
| Toggle off/on | OFF에서는 source/layer와 inspector 값을 숨긴다. ON에서는 현재 선택시각의 정상 프레임만 복원한다. |

색상 팔레트와 FL 구간은 구현 계획에서 기존 레이더 범례와 충돌하지 않도록 정하되, 색상만으로 위험도나 회피 권고를 전달해서는 안 된다.

## Capacity and Scheduling

- 기존 레이더 시간축에 맞추면 사이트당 하루 288회(5분 간격) 호출이다.
- 12개 사이트는 3,456회/일, 13개 사이트는 3,744회/일, 18개 사이트는 5,184회/일의 QCD 파일 다운로드가 필요하다.
- 기존 HSR 합성 레이더 호출과는 별도 호출량이다.
- 1차 운영 사이트 수는 구현 시작 전 현재 QCD HDF5 가용성·처리시간·API 할당량을 재측정해 확정한다. 초기 기준은 12~13개 사이트이며, 18개 전체 확대는 5분 처리 마감과 호출 예산 검증 뒤에만 진행한다.
- 수집은 사이트 단위로 제한된 동시성, 재시도, 타임아웃을 사용해야 한다. 한 사이트 지연이 전체 프레임 발행을 무기한 막아서는 안 된다.
- 원본 HDF5 보존 여부·기간은 서버 저장공간을 기준으로 별도 운영 설정으로 정한다. 원본을 장기 보존하지 않아도 발행 산출물과 메타데이터 재현 경로는 남겨야 한다.

## Non-goals

- 기상청 공식 ETOP 또는 검증된 항공 위험등급의 대체
- 18 dBZ 외 사용자 선택 임계값, 다중 임계값(30/50/60 dBZ) UI
- 과거 UF API를 운영 수집 경로로 복구하거나 sweep API를 사이트 전체 수집에 사용
- 원시 레이더 볼륨을 클라이언트에서 파싱
- Echo Top만으로 착빙·난류·낙뢰·CB 위험을 판정하거나 경고

## Implementation and Verification Gates

1. 구현 시작 전, 현재 권한 키로 최소 두 개 사이트의 최신 QCD HDF5를 내려 받아 DBZH·geometry·관측시각 필드를 다시 확인한다. 키는 어떤 테스트 출력에도 노출하지 않는다.
2. HDF5 파서와 4/3 지구반경 높이 계산, scale/fill 처리, 18 dBZ 판정, 상부 bracket 보간, 결측 처리를 단위 테스트로 고정한다.
3. 사이트별 산출물과 전국 합성 메타데이터의 시간 일치·부분 실패·stale 거부를 통합 테스트한다.
4. 실제 최신 관측에서 Echo Top 분포가 동일 위치·시각의 반사도 대류 셀과 공간적으로 일관되는지 운영 검증한다. 공식 KMA ETOP과의 수치 동등성은 성공 기준이 아니다.
5. 브라우저에서 토글, 5분 시간 이동, 부분 자료, 클릭 inspector, OFF 상태를 Playwright로 검증한다.
6. 12~13개 사이트에서 5분 주기 처리시간·메모리·다운로드 실패율을 측정한다. 5분 안에 안정적으로 완료할 수 있을 때만 전체 사이트 확대를 검토한다.

## Research Basis

- 18 dBZ는 항공 EFB의 Echo Top 표시 및 NOAA Echo Top 제품에서 널리 쓰이는 기준이다. ForeFlight는 18 dBZ Echo Top을 MSL 고도로 표시하며, NOAA EchoTop 제품군은 18/30/50/60 dBZ 임계값을 지원한다.
- 참고: [ForeFlight Echo Tops](https://blog.foreflight.com/staging/9401/2015/12/21/missing-echo-tops/), [NOAA EchoTop 제품](https://vlab.noaa.gov/web/wdtd/-/xx-dbz-echo-top-et-?selectedFolder=562123), [KMA 레이더 사이트 자료 다운로드](https://apihub.kma.go.kr/apiList.do?apiMov=%EB%A0%88%EC%9D%B4%EB%8D%94+%EC%82%AC%EC%9D%B4%ED%8A%B8+%EC%9E%90%EB%A3%8C+%EC%A1%B0%ED%9A%8C&seqApi=5&seqApiSub=267).

## Open Implementation Choices

- HDF5/CF-Radial 파서 라이브러리와 서버 런타임 적합성
- 공통 출력 격자 해상도, 타일/이미지/격자 API 표현, 저장·만료 정책
- 1차 운영 레이더 사이트의 정확한 목록 및 사이트별 품질/차폐 메타데이터
- 기존 지도 오른쪽 고도 컨트롤과 Echo Top 범례·높이 필터를 어떤 방식으로 공유할지
- 표시 단위의 최종 조합(FL 중심, ft MSL 병기 등)과 범례 구간
