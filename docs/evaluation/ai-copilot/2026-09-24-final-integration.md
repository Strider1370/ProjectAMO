# 기상이 최종 통합 인수 기록

2026-09-24 KST. 전체 목표를 줄이지 않고 단계별 증거를 종합한다. 이 기록 작성 당시 공개 방식은 결정 전이었다. **이후 개인키 기본OFF/운영자키 대체금지 및 로컬 Luna high/3200이 승인됐으며 [후속 변경 인수](2026-09-24-personal-key.md)를 최신 상태로 따른다.** 아래 low/1600·결정 대기는 당시의 기록이다. 운영 배포나 공개 MCP 설정 변경을 수행하지 않았다.

## 최신 회귀

`npm run check` 최초 성공 후 상세 페이지 보완까지 재실행 성공(`artifacts/ai-copilot/final-integration-revised-check.log`, exit 0):

- backend **1,401 pass / 1 skip / 0 fail**. skip은 기존 실측 radar QCD HDF5 fixture 부재.
- frontend **1,732 pass**, shared **24 pass**, launcher **7 pass**, nginx **4 pass**.
- 셸 검사 및 Vite production build 성공(11.80초). 기존 chunk 크기 경고 유지.
- `git diff --check`, `AGENTS.md`/`CLAUDE.md` 동일성 통과.

관련 개인 경로·publication 브라우저 **64 pass**, 세부 범위는 [연속 인수](2026-09-24-legacy-publication.md)를 따른다. `copilot-chat.spec.mjs` 전체 **76 pass / 재시도0 / 8.7분** (`final-chat-failures.log`). 기능 OFF·공급자 HTTP 오류/명시적 같은 요청 재확인·취소·미설정과 기존 경로/맥락/보관 결과를 네 화면/엔진에서 검증했다. 파일명도 grep 대상이므로 `--grep copilot-chat`은 chat describe20개뿐 아니라 해당 파일의 route56개도 실행했다. 이 전체 결과를 그대로 기록한다. 영향 AI Node 회귀는 **131 pass** (`final-ai-regression.log`).

## 실제 Codex MCP 신규 경로 인수

기존 3101 프로세스는 건드리지 않고 새 읽기 전용 서버를 **127.0.0.1:3102**에 실행했다. 수집기·개인 DB·앱 API key를 사용하지 않는다. 빈 임시 작업 디렉터리에서 실제 Codex CLI `exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only`와 실행별 MCP URL override를 사용했다. shell/multi-agent/apps 및 web search는 비활성화했다. CLI를 구현 위임 에이전트가 아닌 실제 MCP 클라이언트로 사용했다.

**네 호출 모두 성공, 재시도 0:**

1. `plan_route`: RKSS→RKPC, IFR, 2026-09-10 12:00 UTC, FL280, TAS450kt. 거리 311.32NM, 계산 ETA 12:32:28.400 UTC.
2. `get_route_briefing`: 같은 `contextRef`, partial 및 자료 누락 유지.
3. `compare_route_altitudes`: 같은 `briefingRef`, FL280/FL300, 부모 결과 hash·source 목록 보존.
4. `get_briefing_detail`: 비교 결과의 `altitudes`, 동일 hash/기준시각 및 고도별 행 일치.

보관 KIM run `2026091006`, hf6, 유효 2026-09-10 12:00 UTC를 조회했다. 다른 자료는 실행 시점의 현재 snapshot이므로 **과거 전체 기상 복원이 아니다**. 실제 한국어 답변은 METAR/TAF/KTG의 다른 날짜와 시간 미포함, 공항경보 unknown, 공역 미적재, NOTAM 경고를 표시했다. valid를 가용 AIP 일치로 설명하고 안전 추천을 하지 않았다. 경로 거리 차이는 frozen 공항 바람을 쓰는 별도 Luna 평가와 동일 조건이라고 취급하지 않는다.

근거: `mcp-route-final-events.jsonl`, `mcp-route-final-answer.txt`, `mcp-route-final-evidence.json`, `verify-mcp-route-final.mjs`. 검증 스크립트가 실제 MCP 이벤트, 입력 연결, 결과 행·해시, 셸/웹/에이전트 미사용을 확인했다. Codex 자체 누적 usage는 입력 **133,793**, 그중 cache **99,840**, 출력 **1,004**. 앱 질문당 API usage나 구독 청구액이 아니다.

이 MCP 실행은 후속 `plannedAltitudeWeather` digest 보완 직전 코드다. 경로 생성·비교·상세 기능의 실제 MCP 증거이며, 그 뒤의 앱 모델용 digest 변경은 아래 Luna 평가와 Node 회귀로 별도 검증한다.

### 상세 페이지 보완 후 실제 MCP 재검증

같은 검증 서버3102만 종료·재기동해 최신 코드를 사용했다. `mcp-route-revised-*` 실행은 **6개 도구 호출 전부 성공, 재시도0**: 신규 경로 → 브리핑 → enroute 상세20개 → 다음14개 → 두 고도 비교 → altitudes2개. enroute34개를 빠짐없이 읽고 geometry가 모델 출력에 포함되지 않았음을 검사했다. 각 페이지/비교의 hash·source 및 계획고도 요약 행도 실제 비교와 일치했다. 한국어 답변을 직접 대조해 날짜 불일치와 전체 경로/개별 구간 자료 범위 구분을 확인했다.

`node artifacts/ai-copilot/verify-mcp-route-final.mjs --revised` 통과. Codex 누적 usage 입력228,620/cache184,064/출력1,256. 이 사용량도 앱 API 비용과 구분한다. 기존3101 서버는 여전히 손대지 않았다.

## Luna 최종 평가

[고정 10턴 반복·수치/시각·개인 도구·비용 기록](2026-09-24-luna-final.md)을 따른다. 반복표본20턴은 모두 응답 완료했지만, 계산시각을 수집시각으로 호칭한 오류가 발견돼 후속 보정·해당5턴 반복 인수를 분리했다. 완전 무오류나 일반 품질 보증으로 해석하지 않는다.

최종 지침으로 해당1~5턴을 두 번 반복해10/10 completed 및 수집/계산시각·수치 대조 통과. 후속 Node31개도 통과했다. 이 지침 한 줄 보완은 위 root check 뒤이므로 전체 root를 반복 실행한 것으로 표시하지 않는다.

## 최신 일반 로컬 서버 반영

브라우저76개가 종료된 뒤, 이 작업이 시작한 기존 launcher689636만 정상 종료했다. 기존 MCP3101/PID122057은 유지했다. 같은 `DATA_PATH=/home/john_doe/ProjectAMO/backend/data npm run dev:no-nwp`로 앱을 다시 기동했고 최종 지침·digest·상세 페이지·읽기 전용 단면 수정이 반영됐다.

- backend3001/PID761091, frontend5173/PID761092, 로그 `final-local-server.log`.
- `/api/health`200/testMode=false, `/api/ai/status`200/enabled=true/ready=true, frontend200.
- 익명 결과 조회는401로 거절됨. 자동 관리자 로그인·테스트 mutation 설정을 추가하지 않았다.
- KIM NWP disabled, 다른 수집 job은 기존대로 enabled. 재기동 전후 KIM index/latest SHA-256 동일.
- API key·모델 `.env`는 그대로다. 현재 앱은 Luna low, max output 기본1600이며 평가용high/3200을 자동 적용하지 않았다.
- 최신 MCP 검증 서버는3102/PID751477로 남겨 두었다. 새 기능을 쓸 세션은 `codex -c 'mcp_servers.projectamo.url="http://127.0.0.1:3102/mcp"'`로 연결한다. 기존3101의 구버전 프로세스를 최신 서버라고 표시하지 않는다.

## 요구별 증거 대조

| 요구 | 증거 및 판정 |
| --- | --- |
| 기존 계산 재사용, 자료 상태·시간·누락 구분 | 공통 briefing/altitude 서비스, root 회귀, [실격자 REST 동등성](2026-09-24-stored-nwp.md). 모델 원문 설명은 Luna 평가로 별도 대조 |
| 실제 외부 MCP 클라이언트 | 기존 공항/경보 검증 + 위 신규 경로/고도/상세 네 호출. 공개 MCP/OAuth는 초기 범위 밖 |
| 실제 공급자와 앱 API/기상이 플로팅 UI | [실제 인증/OpenAI/화면 8턴](2026-09-24-live-browser.md), [화면 action 2턴](2026-09-24-ui-actions.md), 브라우저 계약. 공급자는 OpenAI이며 Claude는 미구현 |
| 적용 경로·마커·NWP 선택·맥락 충돌 | 서버 정규화·owner/TTL 테스트, [맥락 선택](2026-09-23-context-choice.md), 두 실제 경로 및 서로 다른 시각의 REST/화면 대조 |
| 고도 비교·원본 결과 그대로 보기 | 같은 captured 자료/프로파일 비교, 결과 hash·기하·시각 고정, invalid 유지, KST/UTC×네 화면 8건 및 실제 공급자 비교 |
| 국내 IFR 새 경로·입력 부족·미지원 처리 | 공용 planner/provider, 실제 OpenAI 새 경로 8턴 흐름, 위 MCP 네 호출, [항법자료 교체/브라우저 갱신](2026-09-24-legacy-publication.md) |
| 개인 저장 경로·구형 입력·현재/과거 결과 구분 | 실제 인증 8턴, 저장 경로 44개 브라우저 사례, 구형 수동 생성→실제 context 브리핑 인수. 저장 도구 직접 current_briefing은 최종 Luna 표본에서 확인 |
| 알람 명시 확인·소유권·멱등성 | [알람 테스트·네 화면 28건](2026-09-24-personal-alerts.md), 실제 인증/OpenAI/확인 API 등록1건→해제0건. 기기 푸시 전달은 별도 |
| 장애·취소·플래그 OFF | router/runner Node 회귀 및 추가 브라우저 계약. 실제 공급자 장애를 일부러 유발하는 대신 제어 가능한 HTTP 실패 fixture 사용 |
| 비용·지연·긴 대화 | 현재 코드의 동일 10턴 반복, 첫/10번째 및 누적 usage, 수치/시간/권한 의미 수동 대조. 최종 Luna 기록으로 연결 |
| 운영 설정·공개 준비 | **미확정:** 실험실 개인 키 방식의 구현 승인 또는 현재 운영자 키 공개 범위, 모델/추론 기본값, 사용량·보관 정책. 공개 배포는 별도 승인 |

## 공개 전 결정과 현재 제한

- 앱은 현재 OpenAI 서버 키 + 전역 기능 플래그 + 로그인 사용자 구조다. **사용자별 BYOK 실험실, Claude adapter, 사용자별 유료 예산 제한이 이미 구현됐다고 표시하지 않는다.**
- 사용자 제안의 권고안은 실험실 기본 OFF, 로그인 사용자별 키, 서버 암호화 보관, 브라우저 localStorage 보관 금지, 운영자 키 fallback 금지다. 제안만으로 기존 공급자/키 소유 구조 변경을 승인받았다고 간주하지 않는다. 2026-09-24 선택 질문을 전달했다.
- 실행당 상한은 모델 3회/도구 4회/45초, API rate limit은 사용자당 분당 30요청이다. 일일/월간 비용 예산을 대체하지 않는다. 기존 실제 새 경로 표본 44초는 운영 지연 위험으로 유지한다.
- 대화/결과는 제한된 인메모리 저장소, 알람 확인 journal은 최대 개수 및 lazy 만료 정리 구조다. 운영 보관 정책 확정과 동일하지 않다.
- 현재 사용자의 `.env`, 실제 저장 경로/알림, KIM NWP 수집, 운영 자료 및 배포는 변경하지 않았다. 최신 수정은 위 일반 로컬 서버 재시작으로 반영했다.
