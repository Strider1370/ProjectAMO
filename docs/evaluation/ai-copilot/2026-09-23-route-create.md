# 5B 신규 경로 생성 · 검증 진행 기록

기준일: 2026-09-23. 구현과 인수를 구분하며 전체 목표는 진행 중이다. 사용자에게 안내한 전체 진행률 약 70%는 작업량 추정이며 완료한 테스트 비율이 아니다.

## 구현

- 앱과 live MCP에 `plan_route` 추가. 출발·도착은 기존 공항 resolver, FL/ft와 날짜가 포함된 KST/UTC는 서버 코드로 정규화한다. 비행규칙·고도·출발시각·TAS 누락을 한 번에 반환하며 비행 조건 기본값을 임의 적용하지 않는다. 도착시각 생략 시 기존 거리/TAS ETA 계산, 항로 종류 생략 시 ALL 사용을 명시한다.
- 미지원 VFR/해외/경유점·절차 지정은 부분 삭제하여 생성하지 않는다. 모호한 공항·잘못된 날짜·시간창·고도는 차단하고 경로 없음/절차 없음/자료 불일치는 실패로 반환한다.
- worker 기동 시 파일 provider를 고정한다. 공항 도구는 NAVDATA 캡처 실패와 독립적으로 작동하며 실패한 캡처만 재시도한다. 성공한 provider는 재사용한다. 계획 계산과 context 검증은 같은 파일 snapshot의 항공로·절차를 사용한다.
- 계산 결과의 전체 편집기·geometry는 소유권/15분 TTL이 있는 context에 보관한다. 모델에는 조건·경로 문자열·자료 출처·가정·contextRef만 보낸다. `get_route_briefing` 결과에 같은 계획을 보관하여 조회/화면 연결 시 다시 경로를 찾지 않는다.
- fixture MCP는 기존 5개 도구와 고정 조건을 유지한다. live MCP만 `plan_route`를 추가하며 개인 저장 경로·알람·계정 쓰기는 노출하지 않는다.
- 생성 카드에서 날짜·고도·TAS·ETA 근거·항로 종류 기본값·풍향 누락을 보여준다. 보관 브리핑 → 가져오기 확인 → 기존 편집기로 연결한다. 전환 전에 publication·선택 절차·geometry 일치, 소유 사용자, 결과 hash/만료, 편집 revision을 확인한다. 기존 경로 대체는 사용자 확인이 있어야 하며 저장 목록에는 쓰지 않는다. 보관 기상 평가는 편집 화면에 현재 평가처럼 옮기지 않는다.
- [OpenAI Docs 도구 호출 지침](https://developers.openai.com/api/docs/guides/function-calling)의 명확한 도구 인자/엄격한 스키마와 코드 계산 원칙을 유지했다. 모델 변경이나 `.env` 기본 추론 강도 변경은 하지 않았다.

## 확인된 검증

- 서버 신규 경로 테스트 9개 + MCP 테스트 6개 = **15 pass**. 실제 항법자료로 김포→제주(풍향 있음/없음), 제주→김포, 인천→김해 네 조건의 추출 전 편집기·geometry·ETA를 대조했다. 타 사용자/타 MCP 세션 접근, 만료, 누락 입력, fixture 차단, worker→계획→브리핑 포함. `artifacts/ai-copilot/route-create-backend.log`.
- AI 관련 서버 회귀 + provider: **100 pass**. 신규 도구 추가에 맞춰 OpenAI 어댑터의 고정 도구 목록 검사도 수정했다. `route-create-ai-regression.log`.
- frontend 가져오기 순수 모듈 **3 pass**: 네 실제 경로의 데이터 유지, publication/절차/geometry 불일치, 만료 및 자료 읽기 중 만료 차단. `route-create-frontend-unit.log`.
- `copilot-route-create` desktop **3 pass**: 누락 입력, 보관 결과→취소→확인 후 편집 및 서버 geometry 일치, 다른 publication 가져오기 거부. UI/인증/API 전송은 contract fixture이며 계획/브리핑 결과는 실제 서버 runtime 계산이다. 실제 공급자와 연속 연결한 E2E를 뜻하지 않는다. `route-create-desktop.log`.
- 전체 `npm run check`: backend **1365 pass/1 skip**, frontend **1709 pass**, shared **24 pass**, launcher **7 pass**, nginx **4 pass**, build 성공. 기존 large chunk 경고 유지. `route-create-full-check.log`. 아래 호출 순서 제한 전 실행이며 제한 변경 뒤 관련 서버 테스트 **22 pass**(`route-create-runner-sequence.log`).
- 이전 광역 copilot 회귀 **79 pass/1 fail**(`route-create-browser.log`). 실패는 모바일 가져오기 후 이미 펼쳐진 편집 화면에서 존재하지 않는 ‘더보기’를 찾던 테스트 오류였다. 해당 클릭만 제거하고 geometry·공항·비교 버튼·재조회 없음 검증은 유지했다.
- 후속 **16 pass**, 재시도 없음: desktop/iPad Chromium/mobile/iPad Safari 각각 4개 생성·가져오기 계약. 같은 publication 내 항로 제한 변경 차단도 추가했다. `route-create-source-guard-browser.log`. 모바일·desktop 실제 캡처를 직접 확인했다. 인증/대화 API는 여전히 fixture다.
- 후속 단위 테스트 **33 pass**(`route-create-source-guard-unit.log`): 사용한 항로 원본의 좌표·제한·삭제/누락 검사, 타 경로 context 또는 공항 도구로 호출 순서를 우회하지 못하는 회귀 포함. 후속 AI 서버 전체 **102 pass**(`route-create-budget-ai-regression.log`), 출력 상한의 서버 설정/범위 및 클라이언트 변경 거부 포함.
- 생성 시 실제 사용한 항로 구간 원본을 소유권이 있는 결과에만 보관한다. 가져오기 때 같은 publication이라도 현재 화면 provider의 해당 구간과 다르면 거부한다. 사용하지 않은 다른 구간의 변경은 해당 경로 가져오기를 막지 않는다. 모델에 원본 구간 배열을 추가 전송하지 않는다.
- 콘솔 기록에 pageerror는 없었다. fixture 인증 밖 요청의 401, service-worker 차단, 기존 지도 line-join 및 일부 WebGL 경고는 남아 있다. **모바일 캡처에서 기상이 launcher가 경로비교 CTA 오른쪽 일부를 덮는 것도 발견했다.** 기능 테스트 통과를 가림 문제 해결로 간주하지 않으며 UI 잔여 인수에 포함한다.

## 실제 Luna 평가에서 발견한 문제

- 공개 기상 고정 snapshot `luna-eval-etKEJU`와 `--suite=route-create`를 사용한다. 외부 수집은 실행하지 않는다. `AMO_AI_REASONING_EFFORT=high`는 평가 프로세스에만 적용한다.
- 최초 8턴 실행에서 첫 턴은 누락한 비행규칙/고도/시각/TAS를 함께 질문했다. 둘째 턴은 계획 계산은 성공했지만 `get_route_briefing` 대신 공항·경보를 따로 호출하여 `MODEL_CALL_LIMIT`에 걸렸다. **high라도 도구 경로를 정확히 선택한다고 보장할 수 없다.** 원시 기록 `route-create-luna-high.jsonl`.
- 이를 숨기거나 호출 상한을 늘리지 않고 새 계획 직후 사용 가능한 날씨 도구를 `get_route_briefing`으로 좁혔다. 다른 contextRef를 쓰려 하면 `PLANNED_CONTEXT_REQUIRED`로 거부한다. 브리핑 호출 뒤에는 일반 도구를 다시 허용한다. 별도 공항/경보 질문과 다음 대화 턴의 기능은 유지한다.
- 변경 뒤 별도 4턴 실 API 재평가 `route-create-luna-high-sequenced.jsonl`에서 생성 후 `plan_route→get_route_briefing` 순서는 정상화됐다. 다만 2·4턴은 `PROVIDER_INCOMPLETE`, 1·3턴은 completed였다.
- 진단을 추가한 high/1600 2턴 평가(`route-create-luna-high-1600-diagnostic.jsonl`)에서 둘째 턴의 최종 응답이 `incomplete_details.reason=max_output_tokens`였음을 확인했다. 출력 1600 중 추론 1361토큰. 이 표본의 중단 원인은 출력 상한이며 공급자 응답에서 `PROVIDER_OUTPUT_LIMIT`로 구분한다. 중간 JSON/문장을 완료 답변으로 노출하거나 자동 재시도하지 않는다. 출력 상한에는 추론·가시 출력·비가시 형식 토큰이 포함된다([공식 문서](https://developers.openai.com/api/docs/guides/reasoning)).
- high/3200 최초 4턴(`route-create-luna-high-3200.jsonl`)은 **4 completed**, 토큰 한도 중단 없음. 김포→제주·제주→김포의 ETD/ETA, METAR/TAF 날짜와 BECMG 구간은 도구 결과와 대조했다. 고도 비교의 ‘TAF 타임라인이 비어 있다’ 설명을 의미 검토 대상으로 남겼다. **2026-09-24 재검토:** 비교 도구의 `issues`에 `TIMELINE_EMPTY/NO_TIMELINE_ENTRIES_IN_WINDOW`가 실제 존재하므로 근거 없는 생성으로 분류한 최초 판단을 정정한다. 이는 요청 구간 내 parser sample 부재이지 TAF 예보 자체 부재가 아니다. completed를 정확성 통과로 집계하지 않는다.
- 다음 4질문은 새 대화에서 `--start=5 --count=4`로 실행(`route-create-luna-high-3200-boundaries.jsonl`). 인천→김해 KST 자정 출발, 미지원 VFR/경유점 차단, 모호한 출발 공항 재질문은 완료했다. UTC 질문은 `FL310`을 `31000 FL`, 절대시각을 `2026-09-24T00:03`으로 작성한 입력 오류 때문에 수정에 3호출을 소모하여 **MODEL_CALL_LIMIT**이었다. 잘못된 조건은 서버에서 실행되지 않았으며 마지막의 올바른 계획만 카드에 남았다. 상한 확대가 이 오류를 해결하지는 않는다.
- [OpenAI Docs의 도구 항목 설명 원칙](https://developers.openai.com/api/docs/guides/function-calling)에 따라 FL 숫자/단위 및 Local/UTC 형식을 항목별 예시로 보완했다. 유효성 검사·시각 정규화·모델 호출 상한은 유지했다. 동일 KST→UTC 두 질문을 `route-create-luna-high-3200-schema.jsonl`로 재평가했다. KST 질문 완료, UTC 질문은 첫 계획 호출부터 `310 FL`, `2026-09-24T00:03:00Z`로 정확했고 브리핑도 호출했다. 모델이 잘못 넣은 displayTimezone은 서버의 UTC 설정으로 덮어썼다. 그러나 최종 응답에서 **3200토큰 전부 추론에 사용하고 PROVIDER_OUTPUT_LIMIT**로 중단됐다. 따라서 3200도 충분한 예산이라고 확정할 수 없고 추가 상향/반복 호출은 하지 않았다. 다음 개선은 요청 구간 밖 TAF·반복 출처 등 모델 전송 자료와 답변 범위를 정리하여 추론 부담을 낮추는 것이다. 원본 카드/출처/누락 상태는 보존한다.
- 앱 서버도 `AMO_AI_MAX_OUTPUT_TOKENS`(256..8192, 기본 1600)를 지원한다. 모델 호출당 상한이며 최대 3호출/4도구/45초 제한과 자동 재시도 없음은 유지한다. 운영자만 변경할 수 있고 chat payload의 같은 필드는 거부한다. 현재 사용자 `.env`의 모델/추론/출력 설정은 변경하지 않았다.
- 위 high/3200 세 파일의 총 10질문(각각 새 대화, 4+4+2)은 입력 126,077토큰(캐시 27,692 포함), 출력 13,024토큰, 합계 응답 대기 약 187.9초였다. [Luna 공식 표준 단가](https://developers.openai.com/api/docs/models/gpt-6-luna)의 입력 $0.10/캐시 입력 $0.01/출력 $0.50 per 1M을 적용한 추정은 **$0.01663**이다. 실제 청구액이 아니며 이전 1600 평가 비용·앱 운영 전체 비용은 포함하지 않는다. 추론은 출력 합계에 이미 포함되어 있다. 응답 완료는 8/10이고 의미 정확성은 별도 미인수다.
- 최종 도구 항목 설명 보완 후에도 AI 회귀 **102 pass**, frontend build 성공(기존 large chunk 경고), `git diff --check` 통과. 전체 `npm run check` 재실행은 하지 않았으며 앞선 전체 검사와 이번 영향 범위 검사를 구분한다. `route-create-source-guard-build.log`.

## 남은 인수

실제 Luna의 UTC 입력·고도 비교 설명 검토, 모바일 launcher의 주 액션 가림 개선, 실제 로그인 브라우저→API 공급자→UI 연속 인수, publication 배포 교체 후 provider/브라우저 갱신 연속 검증이 남는다. 사용 구간의 동일 label 변경 차단과 네 화면/엔진 생성·편집 계약은 검증했지만 실제 배포 갱신을 검증한 것은 아니다. 실행 중 세션은 완료 로그로 확인한 뒤 반영한다. 아직 5B 전체 완료가 아니며 6A/6B와 7의 범위를 줄이지 않는다.

KIM NWP 수집, API 키 출력, 전역 Codex 설정 변경, 운영 배포는 하지 않았다.

후속: 모바일 launcher가 주 액션을 덮는 문제는 footer 영역 예약으로 수정하고 모바일4 pass/직접 캡처 확인했다. [6A 시작 및 모바일 수정 기록](2026-09-23-personal-routes.md). 다른 모바일 시트와 비활성 상태 회귀는 남는다.
