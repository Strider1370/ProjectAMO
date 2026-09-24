# 실험실 개인 키 및 Luna high 적용

> 과거 인수 기록: 이후 사용자 승인으로 서버 운영자 키 + 로그인 계정당 KST 하루 5질문으로 변경했다. 현재 동작·검증은 [운영자 키 인수](2026-09-24-operator-quota.md)를 따른다.

2026-09-24 KST. 사용자가 개인키 방식(기본 OFF, 운영자키 자동 대체 금지)과 로컬 Luna high/3,200을 승인했다. 이전 통합 기록의 “결정 대기”를 대체한다. 공개·배포는 하지 않는다.

## 확정 동작

- 설정 → 실험실 → 로그인 → 개인 OpenAI API 키 저장 → 기상이 켜기. 저장/교체만으로는 켜지지 않는다. 켜진 계정만 우측 하단 기상이 버튼을 본다.
- 키는 인증된 같은 출처 API로 전달해 별도 `ai_credentials` 테이블에 AES-256-GCM 암호문으로 저장한다. 계정 ID를 AAD에 묶어 암호문을 다른 계정에 복사해도 사용할 수 없다. API 응답/브라우저 저장소/채팅·모델 문맥에 키를 넣지 않는다.
- `AMO_AI_KEY_ENCRYPTION_KEY`: 별도 32-byte hex 마스터 비밀. 로컬의 gitignored `.env`(0600)에 생성했다. 운영에서는 별도 비밀 관리와 DB 외부 백업이 필요하다. 없거나 복호화에 실패하면 닫힌 상태로 실패하며 삭제는 허용한다. 임의 키 교체는 기존 개인키를 복구 불가로 만들므로 회전은 별도 절차가 필요하다.
- 끄기는 키를 유지한다. 삭제는 암호문을 NULL로 바꾸고 OFF로 만든다. 모두 진행 중 요청을 취소하고 대화를 초기화한다. 탭 간 상태는 비밀 없는 BroadcastChannel 알림과 창 focus 재조회로 동기화하며, 서버가 매 요청마다 다시 검사한다.
- DB/WAL/백업의 과거 암호문까지 보안 삭제하는 기능은 아니다. 공급자에서 API 키를 폐기하는 작업도 대신하지 않는다. 필요하면 사용자가 OpenAI에서 직접 철회한다.
- 운영자 `OPENAI_API_KEY`는 독립 평가 CLI에만 남는다. 앱 서버는 이 값을 공급자 생성에 사용하지 않는다. 개인 키 없음/비활성/인증 실패/한도 초과 때 운영자 키나 다른 모델로 대체하거나 자동 재시도하지 않는다.
- 로컬 `.env`: `AMO_AI_MODEL=gpt-6-luna`, `AMO_AI_REASONING_EFFORT=high`, `AMO_AI_MAX_OUTPUT_TOKENS=3200`. 3,200은 **모델 호출당 추론+출력 상한**이며 사용자 1턴 전체 상한과 다르다. 기존 최대 모델 호출3회/도구4회/타임아웃은 유지한다.
- 현재 OpenAI만 지원한다. Claude는 별도 공급자 어댑터·검증 전까지 미지원이라고 화면에 표시한다. 키 저장에는 과금 호출을 하지 않으며 유효성은 첫 질문에서 확인한다. ChatGPT 구독과 별도 API 과금임을 화면에 알린다.
- 기존 대화는 메모리 보관(30분 TTL)이며 재시작/설정 변경으로 초기화된다. 개인키는 삭제할 때까지 암호화 보관한다. 별도 일일 금액 차단은 구현하지 않았다. 현재 요청/모델/출력 한도를 유지하며 비용은 각 개인 API 계정에 귀속된다.

## 검증

- Node: 개인키 기본OFF·명시 opt-in·암호화·계정 간 암호문 교체 거부·재시작 복호화·삭제·마스터키 부재/변경·입력검사·인증/출처/본문 상한·진행중 취소·대화 무효화·운영자키 대체금지·high/3200 전달.
- 루트 `npm run check`: backend 1,405 pass / 1 skip(기존 radar 실측 fixture 없음), frontend 1,732 pass, shared24, launcher7, nginx4, build 성공. `artifacts/ai-copilot/byok-root-check.log`.
- 마지막 Node 회귀 29 pass: 개인 키의 실제 Responses 요청 형식(`Authorization`, Luna/high/3200), 401 거부 시 재시도/대체 금지 및 인증 오류 안내 포함. `artifacts/ai-copilot/byok-final-node.log`. 이 후속 변경은 위 root 실행 이후이며 전체 root를 다시 실행했다고 표시하지 않는다.
- 브라우저 30 pass / 재시도0 / 2.6분: 실험실12개(데스크톱·iPad Chromium·모바일·iPad Safari), 기존 대화12개, 표시 설정6개. `artifacts/ai-copilot/byok-browser-final.log`. 최초 4개 실패는 서버 응답 후 반영되는 토글에 즉시 checked를 요구한 테스트 때문이었다. click 후 결과를 기다리는 검증으로 수정했고 최초 실패 기록도 남겼다.
- 최종 frontend build 성공(`byok-final-build.log`). 기존 chunk 크기 경고 유지. 이번 변경의 실제 유료 API 호출은 반복하지 않았다. 이전 Luna high 실측과 이번 개인키 전달/설정 계약 검증을 구분한다.
- KIM NWP 수집을 제외한 일반 로컬 서버에 최신 코드를 재기동했다(`byok-local-server.log`). backend health/프론트200, 익명 AI status는 enabled=false/ready=false, 개인키 settings401, 공개 DB 경로404 확인. KIM index/latest hash는 이전과 동일하다. 모든 계정은 기본 OFF이며 기존 운영자 키를 자동 등록하지 않는다. 실제 개인키 등록/켜기는 사용자가 실험실에서 수행한다.

OpenAI Docs의 [추론/출력 한도](https://developers.openai.com/api/docs/guides/reasoning) 및 [서버 비밀 관리](https://developers.openai.com/api/docs/guides/production-best-practices)를 확인했다. 암호화 방식과 개인키 UX는 프로젝트 구현 결정이다.
