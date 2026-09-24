# 공항 패널·기상 레이어 화면 연결

기준: 2026-09-24 KST. 구현 계획 3B의 미구현 action 연결. 운영 배포/전체 제품 완료 기록은 아니다.

## 구현 경계

- 앱 채팅 전용 `request_ui_action`: 공항명을 기존 resolver로 확인한 `open_airport` 또는 허용 목록의 `enable_weather_layer` 변경안을 반환한다. 서울처럼 모호한 명칭은 후보만 주고 버튼을 만들지 않는다. 외부 MCP에는 등록하지 않는다.
- `shared/copilot-ui-actions.js`의 버전/종류/대상 계약을 서버·화면에서 검증한다. 임의 URL, JavaScript, map 표현식, DOM selector, 추가 필드는 허용하지 않는다. 저장/경로/알람 변경과 별개다.
- 사용자 클릭 시 기존 App 공항 선택 및 MapView `setLayerOn`을 재사용한다. 레이어 이름은 기존 `layerActions` 레지스트리가 소유한다. 이미 켜진 레이어를 다시 끄지 않으며, 기존 상호 배타 규칙을 유지한다.
- 실행 시 로그인 사용자, 지도 편집 모드, 기관 맥락, 공항 목록, 지도 준비/실제 사용 가능 레이어를 확인한다. 기능 플래그/비활성 레이어를 우회하지 않는다. 실제 React 선택 상태를 다시 읽은 뒤에만 실행 결과를 표시한다. 소유자 변경·중복 실행·미확인은 성공이 아니다.
- 모델 응답은 ‘버튼 준비’이며 완료 영수증은 앱의 결정적 문구다. 기상자료가 그려졌는지/최신인지/위험이 없는지까지 선택 상태로 추정하지 않는다. 실행 후 챗봇을 접어 대상 화면을 보여주고, 재열면 실행 결과를 유지한다. 모바일 시트를 숨겼다가 다시 만들어도 결과는 패널 상위 상태에 남는다.
- NOTAM·항적 등 별도 화면, arbitrary 레이어 끄기/삭제/지도 이동을 새로 노출하지 않는다. 첫 계약은 공항 패널 열기와 기존 기상 토글 켜기다.

## 검증

- 단위: 허용 도구·입력 검증·준비만 수행·권한/화면 가용성·커밋 상태 확인·중복/타임아웃·소유자 전환. `ui-actions-unit.log` **22 pass**. 첫 실행에서 가변 객체의 ownerId를 비교해 전환을 놓치는 문제를 발견해 최초 스칼라 ID를 고정하도록 수정했다.
- 브라우저 `copilot-ui-actions.spec.mjs`: 클릭 전 무변경, 김포 패널 실제 열림, AIRMET 토글 켜짐/재실행 유지, 접기 후 영수증, 모호하거나 위조한 action 버튼 없음. 데스크톱 선행 **3 pass**, 전체 4개 화면/엔진 결과는 아래에 기록한다.
- 실제 인증/OpenAI/브라우저: `node frontend/scripts/copilot-live-eval.mjs --live --suite=ui-actions`. `live-browser-yhmAAS/`, `ui-actions-live.log` **2턴 통과**. Luna high/3200이 정확한 공항/레이어 도구 인자를 반환하고, 실제 클릭/화면 상태/완료 문구까지 검증했다. 로그인 우회나 채팅/API fixture 없이 격리된 합성 계정으로 수행했다. KIM 포함 모든 수집은 껐다.
- 실제 답변은 두 번 모두 버튼 준비만 설명했고 완료를 앞서 주장하지 않았다. 입력 **17,368**·출력 **158**(추론 포함), 대기 합계 **7.92초**. [Luna 표준 단가](https://developers.openai.com/api/docs/models/gpt-6-luna) 기준 추정 **$0.001816**, 실제 청구액은 아니다.
- OpenAI Docs에서 Luna의 기존 추론/Responses 설정과 GPT-6 공통 prompting 지침을 확인했다. 모델·기본 환경 설정은 바꾸지 않고 좁은 도구 설명과 실제 두 표본으로 검증했다. 전체 자유 발화 품질 보장으로 해석하지 않는다.

## 남은 범위

별도 MCP 프로세스 갱신, 실제 보관 KIM 단면 및 여러 경로/시각 동등성, 운영 항법자료 갱신 인수, 최종 운영 공개 범위·예산·자료 정책은 별도다. 기존 기본 모델 설정을 자동으로 바꾸거나 운영에 공개하지 않았다.

## 최종 회귀·일반 로컬 서버 적용

- 전체 브라우저: **12 pass**, 4개 화면/엔진, retries=0, 기존 서버 재사용. `ui-actions-browser-final.log`, 프로세스 exit 0. 선행 실행은 12개 테스트 성공 로그 뒤 종료 코드 143이 관측돼 별도 최종 실행으로 확인했다. 모바일 공항 패널 및 실제 AIRMET 선택 캡처를 직접 확인했다.
- 기존 창 크기/지도 영역·접기/작성 중 초안/대화 보존·취소·미설정 회귀 **12 pass**. `ui-chat-regression.log`, exit 0.
- `npm run check`: backend **1,398 pass / 1 skip**, frontend **1,732 pass**, shared24/launcher7/nginx4 및 shell 검사, build 성공. `ui-actions-root-check-final.log`. 최초 전체 실행은 새 도구를 추가하지 않은 OpenAI adapter 기대 도구 목록 1건이 실패해 명시 목록과 enum 검사를 갱신했다. 단순히 목록 검사를 제거하지 않았다. 기존 QCD fixture 부재 skip과 번들 크기 경고는 유지된다.
- 일반 개발 서버의 이전 launcher/자식 PID를 확인하고 정상 종료한 뒤 동일 `DATA_PATH=backend/data`, `npm run dev:no-nwp`로 새 코드 적용. backend **689647**, frontend **689648**, 실행 로그 `local-ui-actions-server.log`. `/api/health`: ok, testMode=false, testMutations=false. `/api/ai/status`: enabled/ready 모두 true. frontend HTTP200. `KIM_NWP_DISABLED=1`; 다른 수집 설정은 유지했다.
- 메모리 대화/보관 참조는 재시작으로 초기화되며 사용자 저장 경로를 삭제/수정하지 않았다. `.env` 모델/추론 기본값 및 별도 MCP 3101은 변경하지 않았다. 운영 배포가 아니다.
