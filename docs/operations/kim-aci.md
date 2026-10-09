# KIM 대류 영역(ACI)

확대영역 KIM의 지상 CAPE·강수강도·OLR를 결합한 실험 점수다. 발생 확률이나 운정고도는 아니다. 시간축은 다른 KIM 레이어와 공유하며 고도 변경에는 반응하지 않는다.

## 실행과 배포

- `KIM_ACI_ENABLED=1`: 기존 확대영역 00/06UTC 수집 작업에 ACI를 함께 연결한다. 초기 설정은 비활성이다.
- `KIM_ACI_PYTHON`: 기본 `.venvs/kim-gktg/bin/python`. NumPy/Numba와 MetPy1.7.1을 사용한다.
- `KIM_ACI_TIMEOUT_MS`: Python 계산 제한, 기본120000ms. 기존 heavy child 순번·메모리 보호·취소를 공유한다.
- `KIM_STORE_FORMAT`: 기존 JSON/NC/both 설정을 따른다. 운영은 기존 NC 설정을 유지한다.
- MetPy 의존성이 추가됐으므로 `deploy/deploy-vm-full.sh`로 환경을 준비해야 한다. fast deploy만으로는 의존성을 설치하지 않는다.
- ACI를 위한 중복 EA cron은 없다. 추가3변수는 대용량 키 사용시간에 다운로드하고 계산은 캐시만 사용한다.

입력은 같은domain/tmfc/hf의21개기압면T·q,10m문서T,기존GKTG ps 캐시와신규q2m·pr·ulwrtoa다. 임계값은공유`shared/aci.js`에서CAPE0~2500J/kg,강수0.2~5mm/h,OLR230→180W/m²,가중치0.2:0.4:0.4로정의한다. 적분은20hPa이며수평격자를줄이지않는다. 색상은노랑·주황·빨강, 경계0.25/0.50/0.75다.

## 저장·조회

`kim_nwp_ea/runs/KIMG_NE57_<tmfc>/derived/aci/`의 시각별 불변 NC와manifest,`kim_nwp_ea/derived/aci/latest.json`을 사용한다. CAPE와최종score revision을분리한다. 점수설정만바뀌면CAPE는재사용한다. 보조입력은`raw/aci`, ps는기존`raw/gktg`를공유한다.

`/api/kim/aci/index?domain=auto`와`/api/kim/aci/field`,`/api/kim/aci/point`로조회한다. field/point에는domain/tmfc/hf/revision을명시하며level은없다. 지도는기존KMB1 압축정적파일의score i16배열을먼저읽는다. 색·클릭점수는동일저장결과를쓴다. 일반사용자에게가중치변경은제공하지않는다.

ACI 입력/계산/게시실패는기본KIM 게시와분리된다. 이전사용가능latest를보존하고실패시각만누락으로표시한다. 새기본회차와ACI회차가다르면다른회차의ACI를대신표시하지않는다. ACI latest·진행중/부분실패회차는기존정리에서보호한다.

관리콘솔에대류영역ACI 자료행과계산실패상태를추가했다. 확대영역진행에는입력·계산·게시시각수,실패시각,작업순번대기/계산중시각,추가호출/수신량/계산시간을표시한다.

## 로컬 수동 재생

기본 격자와보조입력캐시가이미있는DATA_PATH에서:

```bash
DATA_PATH=/path/to/local/data KIM_STORE_FORMAT=nc node scripts/collect-kim-aci.mjs --tmfc 2026100900 --hours 12
```

이CLI는API로추가입력을받지않는다. `--no-publish`는불변필드만만든다. 실제운영수집은확대collector가입력을먼저받는다.

## 구현 검증과 남은 운영 확인

로컬 실제확대2026100900+12h,444,889개를정식processor로계산해NC·KMB1·API·지도에서확인했다. 기존실험시연파일을조회하지않는다. 저장/색/지점조회,원래회차보존,입력교체시게시차단,ACI실패시기본KIM게시유지,영역/시각선택,공유캐시와고도독립동작을검사한다.

전체운영00/06UTC29/33시각의게시완료시간및Node/Python 합산RSS는정식활성화후추가로측정해야한다. 이전독립시험의약23/26분추가는기존추정으로유지하며완성된운영회차실측이라고하지않는다. 구현이번차수에서운영배포는하지않았다. 한반도독립수집과기관pinned bundle 연동은포함하지않는다.

검증 결과(2026-10-09): npm 전체 테스트 및 프런트 빌드 통과, 운영 Python 환경의 커널 테스트8개 통과. 실제 확대 한 시각의 유효443,071/444,889개, 지도 KMB1 gzip382,632bytes. CAPE Python 계산13.40초(로컬 환경). 바람700→850hPa 전환 시ACI 필드 요청이 추가되지 않음을 브라우저에서 확인했고, 배경지도2회 교체·모바일·지점조회·관리 자료행도 확인했다. 검증 산출물은 `artifacts/aci-expanded-local/`에 보관한다.
