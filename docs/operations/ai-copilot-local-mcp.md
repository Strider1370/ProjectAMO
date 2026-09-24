# 로컬 기상 챗봇: Codex CLI + MCP

2026-09-23 KST 구현. 앱의 채팅 UI가 아니라 **Codex CLI가 대화를 맡고 ProjectAMO의 조회 도구를 호출**하는 단계다. LLM 추론은 Codex의 기존 인증으로 실행되며 로컬에서 돌아간다는 뜻이 아니다. 앱용 OpenAI API 키를 추가하거나 기상 API를 수집하지 않는다.

## 바로 실행

같은 WSL에서 터미널 두 개를 사용한다. 프로젝트 루트에서:

```bash
# 터미널 A: 저장된 날씨 + 준비된 김포–제주 경로
npm run ai:mcp:fixture
```

```bash
# 터미널 B: 이번 Codex 세션에만 연결. 전역 설정 파일을 수정하지 않는다.
codex -c 'mcp_servers.projectamo.url="http://127.0.0.1:3101/mcp"'
```

Codex에서 `/mcp`로 연결 상태를 확인하고 질문한다:

> ProjectAMO MCP로 2026년 9월 20일 17:00~17:32 UTC 김포와 제주 기상을 알려줘. 과거 검증 자료라는 점과 관측·예보 시각을 표시해줘.

> 준비된 김포–제주 경로를 브리핑해줘.

> 방금 결과의 warnings와 provenance 상세를 보여줘.

> 서울 공항은 어느 공항을 뜻하는지 확인해줘. 제주 9월 25일 예보가 없으면 추측하지 마.

기존 3101 포트가 사용 중이면 터미널 A에서 `AMO_AI_MCP_PORT=3102 npm run ai:mcp:fixture`로 시작하고 B의 URL도 3102로 바꾼다. 서버는 `127.0.0.1`에만 바인딩하며 Ctrl+C로 종료한다. 기존 앱 서버를 종료하거나 nginx를 수정하지 않는다.

Codex 로그인은 기존 `codex login` 상태를 사용한다. [공식 MCP 문서](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)와 설치된 CLI 0.155.1의 `-c`, `mcp`, `exec` 도움말로 연결 방법을 확인했다.

## 자료와 고정 조건

- 기본 자료 위치: `backend/data/<종류>/latest.json`. 별도 저장 자료는 **서버 운영자만** `AMO_AI_DATA_ROOT`로 지정한다. 모델 입력에는 파일 경로가 없다.
- fixture ID: `gimpo-jeju-20260920`. 기상 기준 시각은 **2026-09-20 16:30 UTC**, ETD **17:00**, ETA **17:32:28.400**, 순항고도 **31,000 ft**, 거리 **325.62 NM**.
- 입력은 기존 ProjectAMO 저장 경로에서 가져온 38개 좌표, Y711 항로 8개 구간, SID/STAR/IAP다. 2026-06-25 navdata와 구간 ID·출발/도착 FIX를 대조했다. 원래 경로의 소요시간을 유지한 채 검증 자료 날짜로 옮겼으며 원본 해시·시각을 fixture provenance에 보존한다.
- fixture 모드는 worker 시작 때 읽은 기상 snapshot을 메모리에 고정한다. 상세 질문은 최초 계산 결과와 source hash를 재사용한다. 원본 수집 상태를 입증할 메타데이터가 없는 빈 목록은 ‘위험 없음’의 근거가 아니다.
- 이 단계의 fixture 브리핑은 **NWP 단면·AIP 검증·상시 공역 자료가 미제공**이다. 공항·SIGMET/AIRMET·NOTAM 등 읽을 수 있는 자료로 계산하고 누락을 명시한다. 앞서 별도로 생성한 KIM 직선 단면을 이 실제 경로 결과에 끼워 넣지 않았다.
- `npm run ai:mcp`는 fixture 없는 저장 자료 조회 모드다. 공항 조회 때 파일을 다시 읽고 실제 시계를 사용하지만 수집하지 않으므로 오래된 파일을 현재 날씨로 취급하면 안 된다. 앱과 독립 MCP의 worker/세션/참조 저장소는 공유하지 않는다. 최신 코드에는 국내 IFR 신규 경로를 만드는 `plan_route`가 추가됐다. 아래 일반 경로 항목을 참고한다.
- fixture 모드에서는 다른 공항·고도·날짜의 경로 자동 생성을 지원하지 않는다. 고정 fixture 조건을 임의로 바꿔 답하지 않는다.

## 실행 경계

최신 코드의 조회 도구는 `get_airport_weather`, `get_weather_advisories`, `get_route_briefing`, `get_briefing_detail`, `compare_route_altitudes` 다섯 개다. 기존 실행 중 서버와 Codex 세션에는 재시작 전 새 도구가 보이지 않을 수 있다. `compare_route_altitudes`는 같은 세션의 유효한 `briefing_ref`와 `altitudes_ft` 2~5개가 필요하며 fixture의 NWP 미제공을 최신 격자로 채우지 않는다. MCP 세션별 참조 범위를 사용하지만 **MCP 세션 ID는 사용자 인증이 아니다**. 개인 저장 경로·로그인 세션·알람·쓰기 기능을 이 서버에 연결하지 않는다.

사이트 안 채팅에는 별도로 `prepare_route_settings`가 있어 국내 IFR 입력안을 검증하고 사용자 클릭으로 설정 화면에 연결한다. 이 앱 전용 도구는 독립 MCP 서버에 노출하지 않는다. 입력안 준비는 경로 생성·적용이 아니다. [입력 흐름 검증](../evaluation/ai-copilot/2026-09-23-route-settings.md).

6A에서 사이트 로그인 세션 전용 `search_my_routes` / `get_my_saved_route`도 추가했다. 외부 MCP에는 개인 DB 읽기를 붙이지 않는다. 사이트 도구는 저장 입력 조회, 저장 당시 기상 결과 없음, 현재 수집 자료로 재브리핑을 구분한다. 전체 입력은 소유자 UI의 별도 인증 조회만 반환한다. 저장 후보 카드와 확인 후 편집기 불러오기를 연결했으며 원본 hash·소유권·TTL·화면 revision을 재검사한다. 실제 공급자 연속 인수는 남아 있다. 기존 실행 중 backend에는 재시작 전 새 도구가 반영되지 않는다. [개인 경로 진행 기록](../evaluation/ai-copilot/2026-09-23-personal-routes.md).

### 일반 국내 IFR 경로 생성 (5B, 인수 진행 중)

2026-09-24 후속: 실제 Codex CLI에서 신규 경로 → 브리핑 → 고도 비교/상세를 검증했다. `enroute` 상세는 요약·항로 구간·절차 구간별 페이지를 반환하며 `nextCursor`가 있으면 나머지를 요청한다. 34개 항목의 두 페이지 조회까지 실제 MCP로 통과했다. [최종 통합 기록](../evaluation/ai-copilot/2026-09-24-final-integration.md). 기존3101은 유지하고 새3102로 검증했으므로, 원래 세션은 최신 코드를 쓰려면 재시작/재연결이 필요하다.

최신 live MCP는 위 다섯 도구에 `plan_route`를 더해 여섯 도구를 제공한다. 실행 중인 이전 서버는 코드를 재시작하고 Codex를 재연결해야 반영된다. `ai:mcp:fixture`의 목록은 바뀌지 않는다.

> 김포에서 제주로 IFR, 2026년 9월 23일 21시03분 KST 출발, FL310, TAS450kt로 경로를 계산해 줘. 반환된 contextRef로 경로 브리핑도 확인해 줘.

날짜는 실제 의도한 날짜로 지정한다. 누락한 비행규칙·고도·출발 일시·TAS를 모아서 확인하며 임의 기본값으로 만들지 않는다. ETA 생략 시 기존 거리/TAS 추정, 항로 종류 생략 시 ALL 사용을 명시한다. 절차·활주로는 보관 METAR와 기존 자동 생성 규칙에 따른 초안으로 운항 허가·안전 추천이 아니다. VFR/해외/경유점 등 미지원 조건을 몰래 빼지 않는다.

`plan_route`의 `contextRef`를 같은 세션의 `get_route_briefing({context_ref: ...})`에 전달한다. 다른 MCP 세션이나 사이트 계정으로 참조를 옮길 수 없다. 기상 예보 범위 밖이면 누락 상태를 표시한다. [계산·연결 검증](../evaluation/ai-copilot/2026-09-23-route-create.md). 실제 Codex CLI의 신규 도구 연속 대화 인수는 기존 공항 도구 인수와 구분한다.

worker는 기동 때 항공로/절차 파일을 하나의 snapshot으로 고정한다. production에서는 배포된 frontend/dist와 source snapshot의 전체 파일 해시가 다르면 새 계획을 거부한다. publication 교체 시 source와 build를 함께 갱신하고 서버/worker를 재시작한다. 기존 인메모리 참조는 사라지며 새로 생성해야 한다. [브라우저 publication 교체·갱신 연속 검증](../evaluation/ai-copilot/2026-09-24-legacy-publication.md)은 격리 복사본으로 통과했다. 운영 배포를 실행했다는 뜻은 아니다.

### 실시간 SIGMET/AIRMET (2026-09-23 추가)

실제 현재 자료로 질문하려면 `npm run ai:mcp`로 시작한다. 별도의 앱 수집 서버는 `npm run dev:no-nwp`로 실행할 수 있다(KIM 격자/지상 일기도 제외; KTG와 해외 NWP는 기존 설정 유지). 양쪽이 같은 `backend/data`를 사용하는지 확인한다. fixture 모드에서는 ‘지금’도 고정 기준 시각이다.

> 지금 유효한 국내 SIGMET과 AIRMET을 알려줘. 현상·유효시간·고도와 자료 수집시각을 구분해줘.

`get_weather_advisories` 입력:

- `{}`: 서버 기준 현재 시각에 유효한 국내 KMA SIGMET/AIRMET.
- `{"types":["sigmet"],"at":"2026-09-23T21:03:00+09:00"}`: 지정 시각과 비교. 미래에 발행될 경보까지 예측하는 기능은 아니다.
- `{"window":{"start":"2026-09-23T12:03:00Z","end":"2026-09-23T13:30:00Z"}}`: `[start,end)`와 겹치는 항목, 최대 48시간.
- `{"result_ref":"반환된 resultRef","cursor":10}`: `nextCursor`를 사용해 동일 snapshot의 다음 페이지. 새 필터와 함께 사용할 수 없으며 실제 시계 TTL·소유 범위가 적용된다.

현상·원래 식별자·발표/유효시각·고도 값/단위/기준면·FIR/기관·bounding box·이동·지상시정/바람을 보존하고 좌표 배열은 모델에 보내지 않는다. 유효시각 불명 항목은 별도 표시하며 잘못된 항목은 개수와 이슈를 남긴다. 20분 초과 snapshot은 stale, 파일 없음/읽기 실패는 미상이다.

빈 목록은 **저장 자료의 해당 시간 일치 항목 0건**이며 위험기상 부재의 증거가 아니다. 기존 수집 결과는 전체 수집 완전성·취소 처리 이력을 입증하지 못하므로 `SOURCE_COVERAGE_UNVERIFIED`/partial을 유지한다. 과거 이력 복원·해외 SIGMET·실제 경로/고도 교차 판정·NWP 격자는 제공하지 않는다. [검증 기록](../evaluation/ai-copilot/2026-09-23-advisories.md).

| 제한 | 현재 값 |
| --- | --- |
| HTTP 본문 / 도구 출력 | 16 KiB / 64 KiB |
| 동시 계산 / 대기 | worker 1개 / 최대 3개 |
| 실행 제한 | 대기·worker 시작을 포함해 20초, 초과 시 worker 종료 |
| 전체 요청 빈도 | 분당 120개 |
| MCP 세션 | 최대 8개, 유휴 15분 |
| 결과 참조 | 실제 시계 기준 15분, 최대 64개 / 32 MiB |
| 상세 페이지 | 기본 10개 / 최대 20개, 항목 합계 24 KiB |

Host/Origin은 로컬 서버 주소만 허용한다. 임의 도구·잘못된 인자·다른 세션의 참조는 거절한다. worker가 재시작되면 메모리 참조는 사라지므로 재조회가 필요하며 이전 결과처럼 대체하지 않는다. 평상시 로그에는 도구명·시간·상태·바이트 수만 기록한다.

## 검증과 배포

### 개인 앱의 알람 확인 (외부 MCP와 별개)

로그인 앱에는 알람 목록/변경안 준비 도구를 연결했다. 실행은 카드 클릭의 `POST /api/ai/confirm`만 담당하며 모델과 MCP에 노출하지 않는다. `backend/src/db/schema.sql`의 `ai_confirmations` 테이블은 다음 DB 연결 시 생성된다. 실행 기록과 알람 변경은 같은 SQLite transaction에 기록된다. 확인은 5분 내에 해야 하며, 실행된 요청의 재전송은 기존 결과를 돌려준다. 원본 경로 및 FK 알림 이력은 보존한다.

확인 journal은 사용자당 256개로 제한하고, 다음 변경안 준비 때 만료 pending/생성 후 7일 경과 기록을 정리한다. 주기적인 7일 즉시 삭제 보장은 아니며 운영 보관 정책 확정은 별도다. 토큰 원문은 DB나 모델 입력에 보관하지 않는다. 이 검증에서는 메모리/임시 DB를 사용했으며 실행 중 앱 서버와 사용자 DB는 재시작/변경하지 않았다. [구현·검증과 남은 인수](../evaluation/ai-copilot/2026-09-24-personal-alerts.md).

### 앱 LLM 출력 예산 (MCP 서버와 별개)

앱 서버의 `AMO_AI_MAX_OUTPUT_TOKENS`는 모델 호출당 추론+출력 상한이다. 기본 1600, 허용 정수 256..8192이며 부적절한 설정은 시작 시 오류로 반환한다. 값 변경은 서버 재시작 후 적용되며 브라우저/LLM 요청으로 바꿀 수 없다. `AMO_AI_REASONING_EFFORT=high` 평가에서 1600 한도 중단을 관측했고 3200 표본을 비교 중이다. 현재 사용자 `.env`의 모델·추론 설정을 자동 변경하지 않는다.

호출 한도는 질문당 모델 3회/도구 4회/45초다. 출력 상한 3200은 항상 3200토큰을 사용한다는 뜻은 아니며, 최대 3회 생성분과 각 호출의 입력 사용량은 별도로 합산한다. 추론 토큰을 보고된 출력 토큰에 다시 더하지 않는다. 한도 중단 시 `PROVIDER_OUTPUT_LIMIT`와 확인된 카드만 반환하며 자동으로 상한을 높여 재시도하지 않는다.

2026-09-24: 세 번째 모델 호출은 확보한 근거로 답변하는 단계로 예약하며 새 도구는 제공/실행하지 않는다. 앞선 도구 실패로 필요한 조회를 끝내지 못했다면 미확인 상태를 설명해야 한다. high/3200의 경로 3턴 및 UTC 경계 1턴이 답변 완료됐으나, UTC 응답은 40.1초로 45초 제한에 근접했다. 기본값 자동 변경이나 전체 품질 통과 근거로 쓰지 않는다. [실측 기록](../evaluation/ai-copilot/2026-09-24-luna-response-budget.md).

평가 전용 명령 예시(기존 고정 snapshot이 있을 때):

```bash
AMO_AI_REASONING_EFFORT=high node backend/ai-chat-eval.js --live --suite=route-create --count=4 --max-output-tokens=3200 --frozen=artifacts/ai-copilot/luna-eval-etKEJU
```

`--live`는 유료 API 평가다. `--start=N`은 새 대화에서 해당 질문 번호부터 시작하므로 앞선 턴에 의존하는 질문에는 단독 사용하지 않는다. 평가 기록의 completed는 답변 내용 정확성 통과와 구분한다. [품질·실패 기록](../evaluation/ai-copilot/2026-09-23-route-create.md).

```bash
node --test backend/test/ai-*.test.js
npm run test:backend
npm run build
```

[실제 Codex 실행·검증 기록](../evaluation/ai-copilot/2026-09-23-local-mcp.md)을 참고한다. SDK 클라이언트 테스트만이 아니라 실제 Codex의 MCP 호출과 한국어 답변을 검증했다. 앱 자체 채팅창·공급자 API 비용·브라우저 UI 인수는 별도 후속 단계다.

MCP 프로토콜은 직접 작성하지 않고 공식 `@modelcontextprotocol/sdk` **1.30.0**으로 고정했다. [공식 저장소](https://github.com/modelcontextprotocol/typescript-sdk)의 지원되는 v1 계열과 설치 패키지의 Streamable HTTP 예제를 확인했다. backend dependency/lockfile이 변경됐으므로 나중에 배포할 때는 **full deploy**가 필요하다. 이 작업에서는 배포하지 않았다.
# 사이트 챗봇의 서버 키 설정 (2026-09-24 후속 변경)

사이트 내 기상이는 MCP 클라이언트 로그인과 별개다. `AMO_AI_ENABLED=1`은 서버 기능 허용일 뿐 사용자를 자동 활성화하지 않는다. 로그인 → 설정 → 실험실 → 기상이 켜기로 사용한다. 개인 키 입력은 없으며 서버의 `OPENAI_API_KEY`로 호출한다. 로그인 계정당 한국 시간 하루 5질문이며 자정 초기화, 새 대화·로그아웃·기능 OFF·서버 재시작으로 사용량이 초기화되지 않는다.

서버 환경변수에 `OPENAI_API_KEY`, `AMO_AI_MODEL=gpt-6-luna`, `AMO_AI_REASONING_EFFORT=high`, `AMO_AI_MAX_OUTPUT_TOKENS=3200`을 설정한다. 키를 `VITE_` 변수나 프런트엔드 빌드·로그에 넣지 않는다. DB에는 ON/OFF와 사용량·요청 ID만 새로 저장한다. 기존 개인 키 암호문/암호화 환경변수는 자동 삭제하지 않지만 앱에서 읽거나 사용하지 않는다. 서버 키 미설정 시 다른 키로 대체하지 않는다.

LLM 시작 전 입력/소유권/대화 revision 오류는 미차감, 호출 시작 이후 공급자 오류·취소는 차감한다. 완료된 동일 요청의 메모리 receipt 재조회는 무료이며, receipt 소실 시 영속 요청 ID로 재실행을 거절한다. 하루 500질문은 비용 계산 예시이지 서비스 전체의 구현된 상한이 아니다. [동작·비용·검증 기록](../evaluation/ai-copilot/2026-09-24-operator-quota.md). 이번 변경은 운영 배포를 포함하지 않는다.
