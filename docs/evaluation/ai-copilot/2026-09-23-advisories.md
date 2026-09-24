# 실시간 SIGMET/AIRMET MCP 보완

2026-09-23 KST. 사용자가 공항 조회 기본 동작을 확인한 뒤 다음 단계 진행을 요청했다. 실사용에서 확인한 **SIGMET/AIRMET 전용 조회 부재**를 먼저 보완했다. 자체 UI/대화 API나 실제 경로 기상 비교까지 완료했다는 뜻은 아니다.

## 변경

- `get_weather_advisories` 일반 함수 + 입력 계약을 추가하고 MCP/local-runtime에 연결. MCP 버전 0.3.0, 조회 도구 총 4개.
- 빈 입력은 서버의 기상 시계를 사용한다. 지정 `at` 또는 최대 48시간 `window`도 지원하며 UTC로 정규화한다. 시각 판정은 `validFrom <= at < validTo`, 기간 교차는 `[start,end)`다.
- 국내 KMA `sigmet/latest.json`, `airmet/latest.json`만 읽는다. 새 수집·KIM 요청·해외 자료·공항별 필터·경로 계산은 추가하지 않았다.
- 현상·원래 source ID·발표/발효시각·고도 값/단위/기준면·기관·FIR·bbox·이동·지상시정/바람을 보존. 큰 geometry와 임의의 미사용 필드는 모델에 전달하지 않는다. bbox만으로 경로 교차를 판단하지 않는다.
- source별 실패/누락/형식 오류를 격리하고, 정상 항목은 유지한다. 유효시각 불명/역전·미래 발표시각은 `unknown` 항목으로 남긴다. 명시적으로 취소된 레코드는 활성 목록에서 제외한다.
- 20분 초과 수집 자료는 stale로 표시한다(기존 국내 advisory data-health의 late 기준 참조). 빈 목록은 `no_matching_reports`, 자료 상태가 불확실한 빈 목록은 `unknown`이다. 수집 완전성·취소 이력 미검증은 모든 응답에 명시한다.
- 기존 snapshot 수집기는 만료 항목을 제거하며 전체 취소 이력을 보존하지 않는다. 따라서 과거 이력 조회나 공식 위험기상 부재 증명으로 쓰지 않는다. 향후 발행될 경보도 예측하지 않는다.
- 기본 10/최대 20항목, 항목 합계 24KiB 페이지. `resultRef`와 `nextCursor`로 같은 보관 결과를 조회하며 실제 시계 TTL·소유 범위·hash를 유지한다. 새 페이지에서 snapshot을 다시 읽지 않는다.
- MCP 안내에서 SIGMET/AIRMET 질문은 공항 기상 도구가 아니라 새 도구를 사용하도록 구분했다. ‘지금’은 서버 시계를 사용하고, advisory 목록과 실제 경로/고도 평가를 구분한다.

## 검증

| 검사 | 결과 |
| --- | --- |
| 신규 advisory 테스트 | 8 pass: 서버 now·UTC/KST·발효 경계·엄격한 입력·자료 상태·단위/ID·오류 격리·참조/TTL·byte pagination |
| 전체 AI 테스트 | **45 pass / 0 fail** |
| 전체 backend | **1,310 pass / 1 skip / 0 fail**, 총 1,311개 |
| 부작용 검사 | 공항과 새 advisory tool의 import가 network/listen/timer/spawn/write를 발생시키지 않으며 app I/O 모듈을 import하지 않음 |
| MCP SDK 클라이언트 | 4개 도구 목록·입력 schema·자료 없음 오류·갱신된 3101에서 실제 빈 목록 조회 확인 |
| 실제 Codex CLI 0.156.1 | 도구명을 지정하지 않은 한국어 질문에서 `get_weather_advisories({})`를 1회 호출, 공항 도구 호출 0회 |
| 형식 | `git diff --check` 통과 |

backend skip은 기존 radar QCD fixture 부재다. 프런트/API 응답 계약·수집기·dependency를 변경하지 않았으므로 새 UI/빌드 검증은 이 보완 작업에서 수행하지 않았다.

실제 질문:

> ProjectAMO MCP로 지금 유효한 국내 SIGMET과 AIRMET을 알려줘. 있으면 현상·유효시간·고도 범위를, 없으면 자료 수집시각과 확인 범위를 설명해줘. 이 목록만으로 김포–제주 경로에 착빙이나 난류가 없다고 판단할 수 있는지도 알려줘.

2026-09-23 **20:10:46 KST**에 Codex가 새 도구를 호출했고, 두 snapshot은 **20:10:01 KST** 수집 자료였다. 해당 시각 실자료 목록은 두 종류 모두 비어 있었다. Codex는 **저장 자료 기준 0건**과 수집 범위 한계를 설명했고, 이 목록으로 김포–제주 경로의 착빙·난류 부재를 판단할 수 없다고 답했다. 실제 발표 항목이 존재하는 사례·고도 단위·시각 경계는 재현 fixture 테스트로 검증했다. 실자료 양성 사례까지 모델로 반복 평가했다는 뜻은 아니다.

이 실행은 셸/multi-agent/web 기능을 끈 독립 Codex 검증이다. OpenAI Docs 스킬에 따라 설치 CLI 도움말과 실제 실행 결과로 확인했다. 출력 이벤트에서 MCP 호출과 최종 문장을 확인했으며 제품 자체 runner 평가와 구분한다.

CLI 보고 사용량: 누적 입력 **43,771**, 그중 캐시 입력 **36,096**, 출력 **316**토큰. 실제 도구 결과는 **1,975 bytes**였다. 이는 Codex의 시스템 문맥/반복 입력을 포함하므로 앱 질문당 비용으로 환산하지 않는다.

증거는 ignored `artifacts/ai-copilot/`의 `advisory-tests.log`, `advisory-all-ai-tests.log`, `advisory-backend-final.log`, `advisory-cli-events.jsonl`, `advisory-cli-answer.txt`에 남겼다.

## 현재 실행 상태

검증용 임시 MCP는 종료했다. 사용자용 **3101 MCP만 재시작하여 새 도구를 반영**했고, 기존 **3001/5173 앱 서버와 KIM 비활성 수집 설정은 유지**했다. 기존 Codex 세션의 연결/도구 목록은 새로 시작해야 한다. 접속 명령은 [실행 안내](../../operations/ai-copilot-local-mcp.md)와 같다.

다음 남은 경계: 실제 적용 경로/고도·비행시간 context 연결 → 기존 hazard intersection 재사용 → 같은 결과의 근거 설명. 이 작업만으로 경로 착빙/난류 계산이나 신규 경로 생성 기능을 완료 처리하지 않는다.
