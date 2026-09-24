# 자연어 경로 입력안 → 기존 설정 화면 (4C)

## 구현 범위

- 자체 대화 도구 `prepare_route_settings`: 공항명을 공용 공항 목록으로 해석하고, FL→ft 및 선택 시간대의 명시적 날짜/시각→UTC를 코드로 변환한다. strict 스키마와 실행 시 재검증을 적용했다. 현재 앱 대화 도구는 6개, 별도 읽기 전용 MCP 도구는 기존 5개다.
- 새 경로의 국내 IFR 입력 채움을 지원한다. 출발·도착은 확정돼야 카드에 적용 버튼이 생긴다. 명시한 규칙·고도·ETD/ETA만 제안하며 좌표·절차·예상 ETA는 모델이 만들지 않는다. VFR·경유점/절차 등 지원하지 않는 조건은 생략한 부분 입력안을 제공하지 않고 `blocked`/`action:null`과 이유를 돌려준다. 이는 자동 입력 도구의 제한이지 기존 편집기의 VFR 지원/운항 가능성 판정이 아니다.
- 시간 순서·48시간 범위·500~60,000ft·알 수 없는 필드·동일 출도착·모호한 공항명 등을 검증한다. 미지정 규칙·고도·출발시각은 화면 값을 유지한다고 명시한다. ETA 미지정은 기존 편집기의 거리/TAS 기반 계산 흐름을 사용하며 모델이 대체하지 않는다.
- `shared/route-settings.js`는 서버/프런트엔드의 입력 경계만 공유한다. 프런트엔드 `copilotRouteSettings.js`가 실제 편집 상태로 미리보기/확인 필요 여부를 만들고, `useRouteBriefing`의 명시적 적용 action이 기존 토큰 편집기·폼을 함께 갱신한다. 모델 호출은 화면을 변경하지 않는다.
- 기존 초안·적용 경로·조건 편집이 있으면 사용자 확인이 필요하다. 기존 절차/경유점/대체공항/NWP 선택과 적용·대체 경로를 초기화한다는 사실을 표시한다. 확정 버튼 시점에 편집 상태 revision을 재검사하므로 확인 도중의 수정은 덮어쓰지 않는다. 기관 경로/내 지도 편집 중/비로그인/미준비 상태는 명시적으로 거부한다.
- 입력 적용 성공 후 기존 경로 설정 패널을 연다. 도구는 경로 계산·적용·기상 브리핑을 실행하지 않는다. 지도에는 기존 토큰 편집기의 출도착 미리보기 선이 보일 수 있지만 적용 경로 source와 계산 API는 별개다. 사용자가 기존 화면에서 경로를 만든 후 실제 geometry/마커/고도/ETD/ETA를 4A로 등록한다.
- UI 입력 성공 문구는 실제 action 반환 뒤에만 표시한다. 질문/카드/계정별 상태를 분리하고, 채팅 접기/모바일 시트 전환에도 확인·실패 상태를 보존한다. 입력 시각 카드에는 연도·시간대까지 표시한다.

[OpenAI Docs 도구 호출 지침](https://developers.openai.com/api/docs/guides/function-calling)의 strict 입력과 애플리케이션 실행 분리 원칙을 적용했다. 형식 준수는 의미 정확도의 보장이 아니므로 아래 실제 설명 오류를 별도로 검증했다.

## 발견·수정

1. 첫 데스크톱 브라우저 실행 **2 pass / 2 fail**. 기존 화면의 UTC 시각은 `.000`을 생략하지만 새 경계는 canonical ISO만 허용해 미지정 ETD를 유지하는 입력안이 거부됐다. 프런트엔드 경계에서 기존 UTC 형식을 정규화하고, 날짜 없는 시각/잘못된 달력 날짜를 임의 보정하지 않는 규칙은 유지했다. 단위 회귀 추가.
2. 실제 Luna high 첫 4턴에서 정상 입력·FL330 후속·공항 미정 확인은 맞았지만 VFR+BULTI 조건에 ‘경유점을 제외하고 준비했다’고 잘못 설명했다. 화면 action은 null이라 잘못 적용되지는 않았다.
3. 미지원 조건이 여러 개이면 모두 보고하고 `preparationState=blocked`와 ‘입력안 없음’을 명시했다. 두 번째 4턴에서는 이를 정확히 설명했으나 도구에 맞추려 IFR/경유점 제거를 제안했다. 프롬프트/도구 결과에 운항 조건 변경을 유도하지 말고 기존 편집기의 직접 입력을 안내하도록 추가했다.
4. 세 번째 동일 4턴 표본에서는 정상 입력·고도만 변경·미정 공항 확인·VFR/BULTI 직접 입력 안내를 모두 확인했다. 추론 상향만으로 계약/설명 오류가 사라지지 않는 실제 사례다. 각 실행 1회 표본이며 일반적 정확도 통과율로 해석하지 않는다.
5. 이전 수동 경로의 exposure 응답을 지연시킨 브라우저 재현에서 새 입력안 적용 뒤 옛 geometry가 되살아났다(수정 전 desktop 1 fail, `route-settings-late-before.log`). `applyRouteDraft`의 planner/exposure 비동기 경계와 오류/로딩 갱신을 기존 요청 revision으로 보호했다. reset/새 입력 이후의 옛 응답은 폐기하며, 수정 후 네 브라우저 표면에서 재현 사례가 모두 통과했다.

## 실제 Luna high 표본

앱 기본 설정은 Luna low 그대로이며 평가 프로세스만 high로 실행했다. `backend/ai-chat-eval.js --suite=route-settings --count=4 --live --frozen=...`를 사용했다. 고정 시각 `2026-09-23T11:46:06Z`; 기상 조회/수집이나 KIM 호출은 실행되지 않았다. 새 입력안은 worker 계산 없이 작은 검증 함수로 처리한다.

- 최종 4턴: 입력 **15,471**, 캐시 입력 **12,238**(입력의 일부), 출력 **1,175**토큰. 평균 **5.23초**. 모든 호출 usage 보고됨.
- [Luna 표준 단가](https://developers.openai.com/api/docs/models/gpt-6-luna)를 사용한 추정: `(비캐시 입력×$0.10 + 캐시 입력×$0.01 + 출력×$0.50)/1M` = **약 $0.00103 / 4턴**. 실제 청구액이 아니며 cache write·처리 tier/지역 가산 등 별도 비용은 제외한다. 네트워크/캐시 상태가 달라 비용·응답시간의 일반 우열을 주장하지 않는다.
- 원시 기록: ignored `artifacts/ai-copilot/luna-route-settings-high{,-fixed,-final}.jsonl`. 모델 호출 인자는 `modelToolCalls`, 실행된 worker 도구는 `toolCalls`로 구분한다.
- 현재 앱 기본값도 검증하기 위해 같은 최종 코드·질문으로 **Luna low 4턴**을 추가 실행했다. 입력 17,631 / 캐시 14,382 / 출력 629토큰, 평균 4.59초, 같은 산식 약 $0.000783 / 4턴. low는 모호한 서울에 도구를 한 번 더 호출해 후보를 확인했고, 네 질문의 의미/적용 제한은 이 표본에서 맞았다. 이 작업의 개선은 high 설정만이 아니라 도구의 명시적 상태·검증 경계에도 달려 있다. `luna-route-settings-low-final.jsonl`.

## 자동·브라우저 검증

- 공항/고도/시각/미지원 조건·strict 스키마·호출 무변경·기존 값 유지·편집 충돌 단위 테스트 추가. 입력안이 weather reference를 만들거나 경로 도구를 활성화하지 않는 것도 검사한다.
- 수정 후 새 브라우저 사례 **16/16 pass**, desktop/iPad Chromium/mobile/iPad WebKit, retries=0: 입력 버튼 전 변경/계산 없음, 사용자 생성 후 실제 경로와 명시한 UTC ETD/ETA/고도 등록, 기존 적용 경로 삭제 확인, 초안 확인 취소·재확인 중 변경 거부, 모호한 공항 후보와 버튼 없음. `route-settings-browser.log`.
- 차단 문구·연도 표시 보완 후 `copilot-chat|copilot-route` 전체 **64/64 pass**, retries=0; 해당 실행 console 64개에서 pageerror 0. `route-settings-browser-verified.log`. 아래 지연 응답 회귀를 추가하기 전 실행이다.
- 지연 응답 수정 후 영향 범위 재검증 **35 pass / 2 skip**(37개 선택), retries=0: 입력안/지연 응답 20개, 토큰 입력 8개, 기존 IFR/VFR 흐름 6개, desktop 중복 exposure 1개 통과. 기존 중복 exposure 사례의 iPad/mobile 2개는 명시된 skip이며 성공으로 계산하지 않는다. 해당 실행에서 생성된 입력안 console 20개 pageerror 0. `route-settings-late-and-regression.log`. 새 68개 전체를 동일 실행에서 통과했다고 주장하지 않는다.
- 최종 `npm run check`: backend **1,352 pass / 1 skip**, frontend **1,706 pass**, shared14/launcher7/nginx4 및 build 성공(기존 large chunk 경고). `route-settings-final-check.log`.
- 개발 서버를 변경 코드로 재시작했다. `/api/health` 정상, `/api/ai/status` enabled/ready 확인. `dev:no-nwp` 로그에서 KIM NWP 비활성·나머지 수집 활성 확인; 별도 MCP 3101 프로세스와 기본 모델 환경변수는 변경하지 않았다. `dev-no-nwp-route-settings.log`.

## 남은 전체 인수

이 입력 흐름은 4C의 한 부분이다. 실제 인증 브라우저→공급자→기존 화면의 연속 통합 인수는 아직이며, 위 실제 API 평가와 browser fixture 검증을 합쳐 통과로 주장하지 않는다. 실자료 단면 보기/경로·시간 동등성, 4B 모델 고도 비교 설명, 5A/5B 서버 신규 경로 생성, 6A/6B 개인 기능, 7 전체 품질·비용·운영 인수는 남아 있다. KIM 새 수집·운영 배포·기본 모델 설정 변경은 하지 않았다.
