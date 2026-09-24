# 보관 KIM 단면·고도·경유점 시각 동등성

2026-09-24 KST. 구현 계획 4A/4B/4C의 저장 실자료 검증. 새 격자 수집·운영 배포·실제 LLM 호출은 하지 않았다.

## 발견과 수정

- 일반 `/api/briefing/cross-section`은 `timeRules`, `nwpTimeAvailability`를 반환하지만 챗봇 `getResult`와 고도 비교 서비스는 이를 누락했다. 고정한 원본에서 두 필드를 함께 반환하도록 수정했다. 새 자료를 다시 읽지 않는다.
- `VerticalProfileChart`는 변경 콜백이 없으면 시간 규칙 표시도 숨겼다. 보관된 `nwpTimeSelection`이 있으면 시간선을 표시하되, 변경 콜백이 없는 읽기 전용 화면에는 클릭 영역·키보드 버튼을 만들지 않는다.
- 일반 편집 화면의 변경 콜백·예보시각 선택 동작은 유지한다.
- 실화면 캡처에서 추가로 확인: 경로 편집기를 먼저 열지 않고 챗봇 보관 결과로 진입하면 지연 로드된 `RouteBriefing.css`가 없어 SVG 기본 검정 채움이 단면을 덮었다. `CopilotResultView`가 해당 스타일을 직접 불러오도록 수정했다. 읽기 전용 시간선의 ‘눌러서 변경’ 안내도 읽기 전용 문구로 바꿨다.

## 실자료와 재현

```sh
node frontend/scripts/copilot-stored-nwp-eval.mjs \
  --data-root=/home/john_doe/ProjectAMO/backend/data \
  --url=http://127.0.0.1:5173
```

명시한 로컬 서버를 그대로 사용한다. 새 서버/수집기를 띄우거나 기존 서버를 종료하지 않는다. 실제 worker, 항법자료, 보관 격자와 DEM을 사용한다. 일반 REST의 읽기 전용 계산 결과와 비교한다. 브라우저 인증/대화/결과 전달만 fixture로 연결하므로 **실제 공급자·인증 통합 시험은 아니다**. API 키와 사용자 DB는 읽거나 변경하지 않는다.

- KIM 공개 포인터: `2026091006`, 예보 `hf006`/`hf009`, 유효 `2026-09-10T12:00:00Z`/`15:00:00Z`. 현재 기상이 아닌 과거 보관 자료다. 당시 항법자료·타 기상자료까지 재구성한 과거 운항 브리핑이라는 뜻도 아니다.
- 김포–제주, 인천–김해를 실제 공통 planner로 각각 생성했다. 첫 경로는 중간 경유점부터 +3시간, 두 번째는 출발 +3시간에서 중간 경유점 이후 기준시각으로 복귀한다.
- 두 경로 모두 단면에 `sourceHf=6,9`가 실제로 존재하고 유한한 바람 값이 있는지 확인했다. 단순히 같은 run 이름이나 비어 있는 결과만 비교하지 않았다.
- 일반 단면 API 전체 응답과 보관 결과의 SHA-256 일치, 일반 연직 프로파일 API와 보관 지형/고도 프로파일 전체 일치, 일반 고도 비교와 요청한 각 행의 모든 기상/제약 필드 일치를 확인했다.
- 김포–제주 FL310은 이 경로의 AIP 조건상 `input_invalid/not_assessed`로 그대로 보존된다. 같은 화면 후보 FL280은 `valid/applied`다. 인천–김해 FL250/210은 `valid/applied`다. `valid`는 자료상 조건 일치이며 안전 판정이 아니다.
- 고도 비교 참조를 다시 열어도 원본 경로·시각 선택·단면·프로파일이 일치한다. 시험 전후 KIM index/latest 해시가 동일하다.

## 검증 결과

- `backend/test/ai-stored-nwp.test.js`: 임시 소형 두 프레임을 실제 저장 형식으로 만들고, 원본 공개 포인터를 없앤 뒤에도 연쇄 비교/보관 결과가 값과 시간 규칙을 보존하는지 검사한다. 타 사용자 접근도 거부한다. 고도 비교 관련 테스트와 합계 **6 pass**.
- 최종 `stored-nwp-eval-styled.log`, `stored-nwp-fcBGMY/evidence.json`: 두 경로 REST 동등성 및 desktop / iPad Chromium / mobile / iPad WebKit × KST/UTC **8건 통과**, exit 0. 지도 geometry·결과 hash·표시 시각·읽기 전용 시간선·프로파일 CSS 실제 계산값·재계산 0건·pageerror 0건을 검사했다. 시간선을 실제 viewport로 스크롤한 캡처도 저장했다. 모바일/KST와 iPad WebKit/UTC 캡처에서 바람·기온·구름·지형·계획선·시간선의 실제 표시를 직접 확인했다.
- 앞선 `stored-nwp-eval-final.log`/`stored-nwp-Z8XbAB` 및 `stored-nwp-eval-capture.log`/`stored-nwp-cRaGRZ`는 기존 DOM/데이터 검사 8건이 통과했지만, 뒤의 캡처 검토에서 스타일 누락을 발견했다. 이 실행들을 최종 시각 검증 성공으로 사용하지 않는다.
- 정규 `copilot-route` 보관 결과 계약에도 합성 프로파일·읽기 전용 시간선·cold-entry 스타일 검사를 추가했다. `stored-nwp-contract.log`: **4 pass**, 네 화면/엔진, retries=0, exit 0. 실행 명령은 frontend에서 `CONTRACT_REUSE_SERVER=1 CONTRACT_DATA_PATH=/home/john_doe/ProjectAMO/backend/data npx playwright test --grep 'opens the identical stored briefing' --retries=0 --reporter=list --output=../artifacts/ai-copilot/stored-nwp-contract`이며 기존 서버를 재사용했다.
- 최종 `npm run check`, `stored-nwp-root-check-final.log`: backend **1,399 pass / 1 skip**, frontend **1,732 pass**, shared24 / launcher7 / nginx4, shell 검사 및 production build 성공, exit 0. 기존 QCD fixture 부재 skip 및 번들 크기 경고는 그대로다.
- 최초 실자료 시험은 입력 FL310도 유효할 것으로 가정해 실패했다. 제품의 기존 제한 판정을 유지하고 실제 일반 화면 행과 동일해야 한다는 기대값으로 바로잡았다. 두 번째 실행은 UTC를 `UTC` 문자열로 기대해 실패했으며, 프로젝트 표준 `Z`와 실제 변환 시각을 검증하도록 수정했다. 실패 산출물 `stored-nwp-XIu3yC`, `stored-nwp-Mc99fn`은 보존했다.

## 적용 및 남은 경계

- 소스 수정과 신규 worker 검증 완료. 일반 로컬 backend 3001은 이 변경 이후 재시작하지 않았다. 메모리 대화/참조를 반복 초기화하지 않도록 최종 로컬 적용 때 함께 갱신한다. frontend는 Vite 소스를 사용한다. 별도 MCP 3101도 이번에는 변경하지 않았다.
- 실제 LLM이 격자 요약을 정확히 설명하는지는 이 시험으로 증명하지 않는다. 7단계 의미 평가에 남는다. 읽기 전용 브라우저 검증은 일반 편집기의 모든 입력/시각 변경 흐름이나 실제 인증 시험을 대체하지 않는다.
- 개인 API 키·실험실·Claude 지원은 사용자 제안과 권고안 단계이며 이번 구현에 포함하거나 완료로 표시하지 않는다.
