# 천리안 2A호 신규 API 전환 (2026-11-10)

기존 typ05 GK2A 다운로드 대신 `/api/typ01/url/sat_file_nc_down.php`를 사용한다.
기준 명세는 [기상청 API허브 위성자료 안내](https://apihub.kma.go.kr/apiList.do?seqApi=6)다.

| 자료 | 호출 인자 | 처리 |
| --- | --- | --- |
| 적외 IR105 | `lvl=l1b&chn=ir105&area=ko` | 기존 파서·합성영상 사용 |
| 가시 VI006 | `lvl=l1b&chn=vi006&area=ko` | 기존 파서·주야간 판정 사용 |
| 안개 FOG | `lvl=l2&data=fog&area=ko` | 기존 파서·적외 합성 사용 |
| 운정고도 CTPS | `lvl=l2&data=ctps&area=ela&map=GE` | GEOS 확장영역을 기존 KO 격자로 최근접 변환 |

공통 인자는 `tm=YYYYMMDDHHmm`(UTC), `authKey`다. 저장 파일의 KST 시각과 요청 UTC 시각을 구분한다.
L1B는 다운로드 명세 표에 `data`만 있어도 실제 서비스에서 **`chn`을 사용해야** 정상 NC가 내려온다.

`SATELLITE_NC_API_URL`이 네 자료의 공통 다운로드 주소를 설정한다. 기존
`SATELLITE_API_URL`, `SATELLITE_FOG_API_URL`, `CTPS_URL`은 더 이상 읽지 않는다.
기존 인증키와 수집 주기·보존 개수·단일 워커·용량 집계 경로는 유지한다.
관리자/사용량 계측은 같은 PHP 경로에서 `lvl`과 `chn`/`data`를 구분해 기존 operation ID로 집계한다.
CI(대류 가능성)는 제거했으며 신규 API로 수집하지 않는다. KIM ACI는 별개다.

## CTPS 영역과 투영

2026-11-10 03:00 UTC 표본에서 신규 `area=ko`는 파일이 없었다. ELA는 정상 제공됐으나
`map=LC`를 주어도 `ela020ge` 파일이 반환됐다. 따라서 GEOS 파일을 명시적으로 요청하고,
NC의 CFAC/LFAC·COFF/LOFF·타원체·위성 고도 정보를 검증해 기존 900×900,
2 km Lambert 격자로 변환한다. 원본 값·결측값·품질 플래그에는 최근접 표본을 적용하고,
기존 고도 단위 변환·고도별 영상·바이너리·운고 마스크·지점 조회 경로를 재사용한다.
필수 투영 인자가 없거나 KO 영역과 겹치지 않으면 게시하지 않는다.

공식 [ELA 위경도 기준 NC](https://nmsc.kma.go.kr/upload/resource/data/gk2a/gk2a_ami_ela020ge_latlon.nc)의
독립 표본 4점과 순방향 좌표가 0.002픽셀 이내로 일치함을 검사했다. 파일의
`sweep_angle_axis`만으로 투영하면 이 기준과 일치하지 않으므로 CFAC/LFAC 항법을 사용한다.
공식 기준 파일은 검증 자료로만 내려받고 실행 시 외부 의존성을 추가하지 않는다.

기존 KO 산출물과 신규 ELA의 재표본 값이 완전히 같지는 않다. 같은 시각의 구 API KO와 비교하면,
양쪽 품질 정상·유효인 175,494점 중 높이 원시값이 같은 점은 78,537점이고
평균 절대 높이 차이는 약 0.362 km였다. 이는 동일 파일을 받는 단순 주소 치환이 아니며,
좌표 검증과 기존 산출물 대조는 별도의 검사다.

표본 CTPS 다운로드 크기는 구 KO 약 2.69 MB, 신규 ELA 약 11.42 MB다.
10분마다 한 장, 하루 144장으로 계산하면 CTPS 원본만 약 1.64 GB/일이며 실제 크기는
관측에 따라 달라진다. 기존 키 전체의 일일 사용량 집계·차단은 계속 적용된다.

## 검증

- 실제 신규 API 네 자료(2026-11-10 03:00 UTC)를 받아 운영 파서/가공기로 적외·안개 합성영상,
  가시영상, CTPS 영상 12종과 지점 조회 바이너리를 생성했다.
- CTPS 바이너리의 유효 고도·온도를 읽었고 같은 시각 재호출 시 추가 다운로드 0회를 확인했다.
- HTTP 200이어도 파일 없음 텍스트가 올 수 있다. 성공 표본은 실제 HDF5 magic을 확인했다.
  기존 수집기의 불완전 응답 거부·마지막 정상 자료 보존 동작을 유지한다.
- 관련 테스트 68건 통과. 최종 테스트 fixture 정리 후 수집 예산·워커 계측 테스트 27건도 통과.
- `npm run check` 통과. 위성 assets 브라우저 계약 desktop/iPad/mobile 3건 통과.
- 테스트 다운로드와 출력은 `artifacts/satellite-api-probe/`에 격리했다.
  `live-migration/result.json`, `migration-check.log`, `migration-browser.log`에 실행 결과가 있다.

이 기록은 로컬 구현·검증 결과다. 운영 서버 배포는 별도로 수행한다.
