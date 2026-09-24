# 개인 예정 비행 알람: 준비·확인·재시도

기준일: 2026-09-24 KST. 6B 구현과 격리 검증 기록이다. 실제 계정의 알람 생성, 푸시 수신, 실제 공급자와 인증 브라우저를 관통하는 통합 인수는 이 기록의 통과 범위가 아니다.

## 구현

- 개인 앱에만 `list_my_flight_alerts`와 `prepare_flight_alert`를 연결했다. 외부 MCP에는 개인 데이터·쓰기 도구를 추가하지 않았다.
- 모델은 변경안을 준비할 뿐이다. UI의 등록/해제 확인 버튼이 인증·Origin 검사를 거치는 `/api/ai/confirm`을 호출한다. 모델에게 확인 실행 도구나 확인 토큰을 전달하지 않는다. 채팅의 “응”, “등록해” 자체로 실행하지 않는다.
- 원본 `routeId`와 감시 `alertId`를 구분한다. 같은 원본의 여러 ETD는 별도 비행이며, 같은 ETD의 다른 조건을 조용히 덮어쓰지 않는다. 새 등록은 실제 미래 ETD·유효한 저장 기하/고도/공항 조건이 필요하다. 과거 감시 해제는 허용한다.
- 날짜가 있는 현지시각은 서버에서 UTC로 변환한다. ETA 미지정과 기본 감시 시작 ETD 6시간 전을 카드에서 명시한다. 등록은 감시 행 생성이지 푸시 권한 획득·알림 전송 보장이 아니다.
- 소유자·대상 내용·작업·ETD·5분 확인 만료에 묶인 무작위 토큰의 해시를 SQLite에 저장한다. 확인 직전에 계정 상태·소유권·대상 변경·미래 ETD를 다시 검사한다. 스케줄러의 갱신 시각/브리핑 snapshot 갱신만으로 변경안을 무효화하지 않는다.
- 업무 변경과 실행 영수증을 같은 `transaction.immediate()`에 저장한다. 저장 실패는 업무 변경도 되돌린다. 재시도는 이전 영수증을 반환하고 재실행하지 않는다. 알람 해제 뒤 오래된 등록 확인을 재전송해도 다시 등록하지 않는다.
- 응답 유실은 “변경 없음”으로 표시하지 않는다. 같은 토큰·같은 결정을 재전송해 결과를 확인한다. 변경안 취소의 응답이 유실돼도 취소 결과를 재확인할 수 있다.
- 기존 계정 REST와 AI 확인이 `me/alert-service.js`를 공유한다. FK 알림 이력이 있으면 감시만 비활성화하고 이력을 보존한다. 저장 원본은 삭제하지 않는다. 다른 DB 오류를 FK 오류처럼 숨기지 않는다.

## 자동 검증

실행 명령:

```bash
node --test backend/test/ai-*.test.js backend/test/me-*.test.js
npm run check
# frontend 디렉터리, 이미 확인한 3001/5173 개발 서버 재사용
CONTRACT_REUSE_SERVER=1 CONTRACT_DATA_PATH=/home/john_doe/ProjectAMO/backend/data \
  npx playwright test verification/contracts/copilot-personal-alerts.spec.mjs --retries=0
```

- AI·개인 API 회귀: 알람 보완 후 **139 pass**, 후속 TAF 모델용 projection 보완 포함 **140 pass**. 메모리/임시 DB만 사용했다.
- 독립 DB 연결 두 개의 실제 동시 확인에서 같은 감시 행 하나만 생성하고 한 응답은 영수증 재전송임을 확인했다.
- DB를 닫았다 다시 열어도 중복 방지가 유지된다. 이전 스키마에서 새 확인 테이블 생성 시 원본 보존, 실행 기록 저장 실패 시 rollback, 토큰 정리 시 감시 행 보존을 확인했다.
- 잘못된 소유자·비활성 계정·Origin·추가 인자·삭제/변경 원본·확인 만료·경과한 ETD·잘못된 ETA·기관 맥락을 검사했다. 깨진 개인 감시 payload도 목록 조회·해제할 수 있다.
- 브라우저 **28 pass**: desktop/iPad Chromium/mobile/iPad WebKit 각각 7개. 실제 개인 도구와 메모리 DB를 쓰되 인증·채팅 응답·확인 HTTP 전송은 fixture다. 등록 후 응답만 끊기는 경우, 변경안 취소의 응답 유실, 원본 변경, 만료, 알림 이력 보존, 다중 ETD 선택을 검사했다.
- 모바일 캡처를 직접 확인했다. 등록/변경안 취소 버튼은 기상이 버튼이나 입력창에 가리지 않는다. 실제 휴대전화 키보드 검증을 대신하지 않는다.
- 최초 전체 `npm run check`: backend **1,390 pass / 1 skip**, frontend **1,720 pass**, shared **24 pass**, launcher/install **7 pass**, nginx **4 pass**, shell 검증 및 build 성공. skip은 로컬 QCD H5 fixture 부재다. 이후 추가 테스트/TAF projection을 포함한 최종 전체 재검증 결과는 후속 항목에 기록한다.
- 알람 추가 테스트와 TAF projection 포함 재검증(`alerts-final-root-check.log`): backend **1,393 pass / 1 skip**, 나머지 위 그룹과 build 성공. 후속 Luna 마지막 응답 단계 변경은 별도 [평가 기록](2026-09-24-luna-response-budget.md)을 따른다.

근거: `artifacts/ai-copilot/alerts-{boundary-tests,final-regression,projection-regression,all-contract,root-check,final-root-check}.log`, `artifacts/verification/test-results/copilot-personal-alerts-*/copilot-alert-confirmation.png`. 산출물은 ignored다.

## 운영 경계·남은 인수

- `ai_confirmations`는 다음 앱 DB 연결 시 생성된다. 이번 테스트는 사용자의 실행 중 서버/DB를 재시작·변경하지 않았다.
- 만료 pending 및 생성 후 7일이 지난 확인 기록은 **다음 변경안 준비 시 지연 정리**된다. 사용자당 256개 한도다. 정리 후 옛 토큰은 실패하며 알람을 재생성하지 않는다. 7일 즉시 삭제를 보장하는 주기 작업은 아니므로 운영 보관 정책은 7단계에서 확정한다.
- 앱 브라우저→실제 인증→실제 Luna→카드→확인 API의 연속 검증, 앱 재시작 적용, 실제 전송/푸시와 기존 예정 비행 화면 대조는 남아 있다. 실사용 DB에 임의 시험 비행을 만들지 않았다.
- 운영 공개 계정·예산·데이터 외부 전달/로그 보관 정책과 최종 회귀 인수는 전체 계획에 그대로 남는다. 배포는 수행하지 않았다.
