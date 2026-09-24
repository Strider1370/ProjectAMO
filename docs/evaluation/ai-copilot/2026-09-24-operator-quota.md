# 서버 키·로그인 사용자 일일 5질문 전환

2026-09-24. 사용자가 개인 키 입력의 번거로움을 없애기 위해 승인한 후속 변경이다. 이전 [개인키 인수](2026-09-24-personal-key.md)의 비용 소유/키 등록 계약을 대체한다. 운영 배포는 하지 않는다.

## 동작 계약

- 서버 `OPENAI_API_KEY`로만 OpenAI 호출. 기존 `gpt-6-luna / high / max_output_tokens=3200` 유지. 키는 브라우저·API 응답·MCP에 전달하지 않는다. 키 미설정 시 기능 사용 불가이며 개인 키 fallback 없음.
- 로그인 → 설정 → 실험실 → 기상이 ON. 계정별 기본 OFF. 기존 개인 키 동의는 운영자 모드에 자동 이전하지 않는다.
- 계정당 한국 달력 날짜 기준 5질문. KST 자정(UTC 15:00)에 새 날짜 allowance를 사용하며 cron 불필요. UTC 표시를 선택해도 한도 날짜는 KST다.
- 입력/소유권/revision 검증과 완료 receipt 재생 후, 새 질문에 한해 동기 SQLite 트랜잭션으로 사용량·요청 ID를 함께 기록한다. 내부 LLM 최대 3회·도구 최대 4회는 질문 1회로 센다.
- 호출 시작 이후 오류·중지·연결 중단도 차감, 유료 자동 재시도 없음. 동일 완료 요청 재조회는 추가 차감/호출 없음. 메모리 대화가 사라지거나 receipt가 유실돼도 영속 요청 ID가 같은 질문 재실행을 차단한다.
- 한 서버 프로세스에서 계정당 동시 질문 하나. 한도 UPDATE는 DB 트랜잭션으로 처리해 여러 DB 연결에서도 5회 상한을 넘지 않는다. 다중 서버 인스턴스의 분산 동시실행 잠금은 추가하지 않았다.
- 사용량은 DB에 남아 새 대화·새 탭·OFF/ON·로그아웃·재시작으로 초기화되지 않는다. 질문 한도가 0이어도 기존 대화·근거 카드는 볼 수 있다. 화면은 응답/오류 후, 창 열기·포커스 복귀·자정에 사용량을 갱신한다.
- 개인키 신규 등록 API/UI를 운영자 모드에서 제거했다. 기존 `ai_credentials` 암호문과 암호화 환경변수는 사용자 자료 보존을 위해 자동 삭제하지 않으며 앱이 읽지 않는다. 기존 자격증명 모듈은 레거시 회귀 테스트용으로 남아 있다.
- 신규 `ai_settings`, `ai_daily_usage`, `ai_question_requests`에는 키/질문 원문이 없다. 날짜/계정별 횟수와 중복 방지 ID를 기록한다. 장기 보존/청소 작업은 이번 시연 변경에 포함하지 않는다.
- 계정별 제한이지 사람별 제한은 아니다. 여러 계정 또는 서비스 전체 예산을 제한하지 않는다. **500질문은 계산 예시이지 전역 상한 설정이 아니다.**

## 하루 500질문 비용 추정

2026-09-24 확인한 [OpenAI 공식 Luna 요금](https://developers.openai.com/api/docs/models/gpt-6-luna): Standard, 요청당 입력 272K 이하 기준 100만 토큰당 일반 입력 **$0.10**, 캐시 읽기 **$0.01**, 캐시 쓰기 **$0.125**, 출력(추론 포함) **$0.50**. Batch/Flex 50% 요금은 대화식 Standard 계산에 쓰지 않는다. 지역/우선 처리 가산·세금·환전·서버 비용은 제외한다.

계산식: `(일반입력×0.10 + 캐시읽기×0.01 + 캐시쓰기×0.125 + 출력×0.50) / 1,000,000`.

[기존 실제 평가](2026-09-24-luna-final.md)의 usage를 재사용한다. 추가 유료 500질문을 실행한 값이 아니다. 이전 기록은 캐시 쓰기 토큰을 별도 수집하지 않았으므로, 아래 범위는 비캐시 입력이 전부 일반 입력인 경우부터 전부 캐시 쓰기인 경우까지다. 입력 합계에서 읽기/쓰기 부분을 빼고 일반 입력에 넣어야 하며, 캐시 쓰기 단가를 일반 입력 단가에 다시 더하지 않는다.

| 실제 표본 | 표본 질문 수 | 입력 / 캐시 읽기 / 출력 토큰 | 같은 질문 구성 500회, 관측 캐시 유지 | 캐시 읽기 0 가정 |
| --- | ---: | --- | ---: | ---: |
| high-5 | 10 | 115,929 / 30,416 / 8,149 | $0.6465–0.7534 | $0.7834–0.9283 |
| high-6 | 10 | 116,285 / 54,819 / 8,565 | $0.5489–0.6257 | $0.7956–0.9409 |
| 최종 시각 보정 clock-1 | 5 | 63,233 / 4,115 / 6,605 | $0.9255–1.0733 | $0.9626–1.1207 |
| 최종 시각 보정 clock-2 | 5 | 62,865 / 33,159 / 5,520 | $0.6062–0.6805 | $0.9047–1.0618 |

계정당 5회인 현재 정책에는 최신 5턴 표본이 더 가까운 비교다. 동일한 질문 구성이 반복되면 **하루 약 $0.6–1.2, 매일 500회인 30일은 약 $18–36**을 참고값으로 볼 수 있다. 신규 계정들의 다양한 입력은 위 캐시 적중률을 보장하지 않는다. 두 5턴 표본은 저장 경로/기상 조회를 포함하지만 자연어 신규 경로 생성은 포함하지 않는다.

이는 지출 상한이 아니다. 최대 3번의 모델 호출 모두 3,200 출력 토큰을 쓰면 질문당 출력 9,600, 500질문의 **출력 비용만 $2.40**이다. 여기에 실제 입력/캐시 비용이 더해진다. 짧은 표본 평균을 복잡한 모든 질문의 최대 비용이라고 안내하지 않는다.

## 검증

- `npm run check`: 통과. backend 1,412 pass / 1 skip, frontend 1,732 pass, shared 24 pass, launcher 7 pass, nginx 4 pass, 배포 스크립트 offline checks 통과, frontend build 11.20초(기존 chunk-size 경고). 로그 `artifacts/ai-copilot/operator-root-check.log`.
- 후속 경계 사례 2개 추가 후 `node --test backend/test/ai-access.test.js backend/test/ai-router.test.js backend/test/ai-credentials.test.js backend/test/ai-chat-runner.test.js`: **32 pass**. 일일 소진→KST 자정→동일 대화 재사용, OFF 중 취소, 잘못된 입력·다른 소유자·revision 미차감, 5회 후 무료 receipt 조회, 새 대화/재시작/다른 DB 연결/토글 우회 방지, native provider의 서버 키와 high/3200 전달·401 무재시도 포함. 로그 `operator-final-node.log`.
- `npm run dev:contract -- copilot-chat.spec.mjs copilot-labs.spec.mjs --grep 'copilot-chat( |\-labs)'`: **40 pass / retries 0**. 데스크톱·iPad Chromium·모바일·iPad Safari 각각 대화 5 + 실험실/사용량 5. 키 입력란 제거·기본 OFF·탭 토글 동기화·설정 저장 실패·익명·서버 키 미설정·다섯 번째 질문 후 0/5/답변 보존/재로드 후 차단을 확인. 로그 `operator-browser-final.log`.
- 데스크톱 실험실·소진 대화, 모바일 소진 대화 screenshot을 직접 확인했다. 산출물 `artifacts/verification/test-results/copilot-labs-*/copilot-{labs-operator,quota-exhausted}.png`.
- 로컬 `.env` 값은 키 존재 여부만 확인했다. `AMO_AI_ENABLED=1`, `gpt-6-luna/high/3200`, 권한 0600. 실제 키 문자열이 frontend JS/CSS bundle에 없는 것을 값 비출력 검사로 확인했다.
- `git diff --check`, `cmp AGENTS.md CLAUDE.md` 통과. 기존 다른 작업은 보존했다.
- 변경된 로컬 앱을 `DATA_PATH=/home/john_doe/ProjectAMO/backend/data npm run dev:no-nwp`로 재기동해 유지한다. backend health 200/testMode false, frontend 200, 익명 AI status는 LOGIN_REQUIRED/OFF, settings 401 확인. `operator-local-server.log`에 KIM NWP disabled/서버 준비 완료 기록. KIM `index.json`/`latest.json` hash는 재기동 전후 동일하다. 다른 수집기는 기존 승인대로 동작한다.

테스트 공급자는 synthetic key와 mock HTTP만 사용하며 실제 API 비용을 발생시키지 않는다. 실제 OpenAI 품질/토큰 평가를 이번 코드로 다시 실행했다는 뜻은 아니다. 위 비용은 이전 실측의 재계산이다. 운영 배포 없음.
