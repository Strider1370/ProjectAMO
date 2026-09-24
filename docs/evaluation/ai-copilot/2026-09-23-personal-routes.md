# 6A 개인 저장 경로 · 서버 조회·재브리핑과 편집기 불러오기

후속 상태(2026-09-24): [실제 인증/OpenAI 8턴](2026-09-24-live-browser.md), [알람 구현](2026-09-24-personal-alerts.md), [구형 초안 생성→재브리핑 및 관련64개 회귀](2026-09-24-legacy-publication.md)를 완료했다. 아래 미완료 목록은 이 문서 작성 당시 기록이며 최신 전체 인수는 [통합 기록](2026-09-24-final-integration.md)을 따른다.

2026-09-23. 전체 목표와 6A 인수는 진행 중이다. 서버 읽기·재브리핑에 이어 확인 후 편집기 불러오기를 구현했다. 실제 공급자까지 연결한 통합 인수를 완료했다는 뜻은 아니다.

## 구현 범위

- `me/route-reader.js`로 세션 사용자 조건을 포함한 읽기를 분리하고 기존 `/api/me/routes` 목록도 재사용한다. payload에 들어 있는 `id/name/savedAt`이 DB의 실제 식별자/이름/저장시각을 덮지 못하도록 했다. 저장/삭제 API 정책은 유지한다.
- 앱 전용 `search_my_routes`: 본인 저장 경로/브리핑 입력을 이름·공항 코드/해석 가능한 공항 이름으로 검색한다. 최대 20개씩 페이지, 동명 후보는 그대로 나열한다. 손상 입력 개수를 알리고 예정비행 감시 복제본(해제된 복제본 포함)과 기관 범위 입력은 제외한다. 사용자 ID는 모델 인자가 아니다.
- 앱 전용 `get_my_saved_route`: 선택한 DB ID를 다시 소유권 확인한다. `inputs`, `historical_result`, `current_briefing`을 구분한다. 저장 항목은 입력 snapshot이며 과거 기상 결과를 보관한 것으로 간주하지 않는다. 알람 변화 비교용 snapshot도 과거 전체 브리핑으로 대체하지 않는다.
- 현재 자료 재브리핑은 저장 기하·고도·ETD/ETA를 서버 context 검증 후 기존 브리핑 도구로 전달한다. 최신 수집 자료를 사용한 새 결과이며 과거 기상 복원이 아니다. ETD를 새로 지정하면 기존 ETA를 자동 재사용하지 않고 확인을 요구한다. 저장 입력에 기하가 없는 구형 항목은 임의 새 경로로 대체하지 않고 `SAVED_GEOMETRY_UNAVAILABLE`로 알린다.
- 전체 입력/geometry는 모델에 보내지 않는다. 소유자/15분 TTL/내용 hash를 가진 선택 참조로 UI가 `/api/ai/saved-routes/:ref`에서만 읽는다. 화면 요청 시 원본 삭제·내용 변경·소유권·만료를 다시 확인한다. `Cache-Control: no-store` 유지.
- 개인 도구는 앱 프로세스의 인증된 executor에만 연결했다. 익명 로컬 MCP 및 DB 없는 평가 runner에는 제공하지 않는다. 기존 MCP 도구 목록은 바꾸지 않았다.
- [OpenAI Docs 함수 도구 지침](https://developers.openai.com/api/docs/guides/function-calling)에 따라 읽기 목적/범위/미실행 동작을 도구 설명에 명시하고 엄격한 인자 스키마를 사용한다. 모델·추론·키 설정은 변경하지 않았다.

## 검증

- `node --test backend/test/ai-*.test.js backend/test/me-routes*.test.js`: **115 pass**, `artifacts/ai-copilot/personal-routes-regression.log`.
- 신규 개인 경로 테스트 5개: 테스트 전용 메모리 DB, 다른 사용자/익명 접근, 소유자 ID 주입 거부, 동명 후보/페이지/한글 공항 검색, 감시 복제본 제외, 손상 입력, DB 식별자 위조 방지, 원본 변경/삭제/TTL, 실제 runtime을 통한 저장 기하의 현재 재브리핑, 조건 누락, 앱 HTTP→runner→선택→소유자 UI 조회 포함.
- 실행 전후 route 테이블이 동일한 것을 검사했다. 모델 호출은 모의 공급자이며 개인 자료를 유료 외부 API로 전송하지 않았다. 현재 사용자 DB/저장 항목/알람은 변경하지 않았다.
- 개인 도구 미설치 runner의 강제 호출도 `UNKNOWN_TOOL`로 거부한다. 인증·동일 출처·응답 크기/호출 예산은 기존 앱 경계를 유지한다.
- frontend build 성공(`personal-routes-initial-build.log`, 기존 large chunk 경고), `node --check backend/server.js`, `git diff --check`, AGENTS/CLAUDE 동일성 확인. 전체 root check는 이번 변경 뒤 재실행하지 않았다. 기존 로컬 backend/MCP 프로세스도 아직 재시작하지 않았으므로 새 개인 도구의 실제 앱 공급자 연결은 미검증이다.

## 별도로 해결한 모바일 가림

모바일 브리핑 footer가 떠 있는 기상이 버튼의 터치 영역을 예약하도록 했다. launcher는 우측 하단 그대로이며 지도/페이지 전체를 밀지 않는다. 챗봇 비활성 상태에는 기존 footer 배치를 유지한다. 공유 layout token으로 버튼 크기를 통일했다.

`copilot-route-create --project=mobile --retries=0`: **4 pass**, `copilot-mobile-launcher-clearance.log`. 주 액션 오른쪽 가장자리 hit-test와 launcher 간격 8px 검증을 추가했다. 실제 수정 후 캡처에서 ‘경로비교로’와 기상이 버튼의 비겹침을 직접 확인했다. 다른 모바일 시트/좁은 화면 및 챗봇 비활성 회귀는 최종 UI 인수에서 추가 확인한다.

## 확인 후 편집기 불러오기 후속 구현 (2026-09-24 KST)

- 저장 후보 카드에 DB ID·이름·저장일·출도착·ETD를 표시한다. 동명 후보를 자동 선택하지 않는다. 후보 버튼은 ID가 포함된 질문만 작성하며 사용자가 전송한다.
- 선택 카드에서 저장 당시 기상 결과가 없음을 명시하고, 현재 재브리핑 카드와 구분한다. 확인 카드에는 교체 대상, 보존/복원할 경로 개수, 출발·고도·TAS와 기존 값 유지 여부를 표시한다.
- `savedRouteHandoff`는 첫 인증 GET 전의 편집기 revision을 고정한다. 항법자료 준비 중/확인 대기 중/마지막 원본 재조회 중의 입력 변경, 로그아웃 후 같은 계정 재로그인을 포함한 인증 세대 변경, 지도 편집 진입을 검사한다. 마지막 GET은 서버의 원본 hash·소유권·TTL 검사를 다시 통과해야 한다.
- 준비는 읽기 전용이고 실제 화면 교체는 확인 후 동기적으로 수행한다. 저장 목록·알람·성능 프로필에 쓰지 않고, 기상 브리핑/노출 조회를 실행하지 않는다. VFR 편집기의 기존 지형 고도 미리보기는 기상 조회와 별개로 유지한다.
- 저장 기하가 있으면 그 선과 구간 모델을 보존한다. VFR은 구형 마커가 부족해도 중간 좌표를 잃지 않게 편집 경유점을 복원한다. 대체 경로는 전체를 함께 복원하거나 명시적으로 실패하며 일부를 조용히 버리지 않는다.
- 기하 없이 문자열만 있으면 현재 항법자료로 복원했다는 안내를 확인 카드에 표시한다. 기하·문자열이 모두 없는 구형 항목은 입력 초안만 넣고 자동 경로 생성/브리핑을 하지 않는다. 구형 VFR 좌표 입력 복원도 단위 테스트에 포함한다.
- 원본 값 및 현재 화면에서 유지할 시각/고도/TAS도 검사한다. 시간대 없는 시각, 달력 넘침, 역전된 ETD/ETA, 잘못된 좌표·마커를 불러오지 않는다.
- 신규 브라우저 계약은 메모리 DB의 실제 개인 도구/원본 변경 검사를 사용하고, 채팅·로그인은 fixture로 대체한다. 유료 모델 호출이나 사용자 DB 변경은 하지 않는다.
- 확인 영역으로 키보드 초점을 옮기고 취소 시 준비 버튼으로 돌려준다. desktop/mobile 실제 캡처에서 확인·취소 버튼과 기상이 launcher의 비겹침을 직접 확인했다.

### 재브리핑 결과의 저장 출처

`current_briefing` 결과에는 별도의 소유자/TTL 참조 `savedRouteOriginRef`를 붙였다. 이 참조는 원본을 읽은 시점의 이름·ID 등 요약을 해당 `briefingRef/resultHash`에 고정한다. `/api/ai/results/:ref?savedOrigin=...`는 동일 소유자·동일 결과인 경우에만 출처를 함께 반환하며, 만료·다른 결과·다른 사용자는 오류로 처리한다. 원본 경로가 나중에 삭제돼도 이미 계산한 결과의 출처는 참조 유효기간 내 보존한다. 기상 계산 결과와 그 hash는 바꾸지 않는다.

전체 브리핑 화면에도 ‘저장 입력 출처’와 ‘질문 당시 수집 자료로 새로 계산했으며 저장 당시 기상이 아님’을 표시한다. 출처 참조가 만료됐을 때 현재 자료나 출처 없는 화면으로 조용히 대체하지 않는다.

### 후속 검증

- `copilot-personal` 7사례 × 네 화면/엔진 **28 pass**. 확인/취소·기하 일치·자동 기상 조회 없음·서버 쓰기 없음·원본 수정/삭제·동명 후보·구형 초안·대체 경로·VFR 중간 좌표 보존.
- 기존 `copilot-route-create`와 함께 최종 불러오기/키보드 초점 회귀 **44 pass** (`personal-routes-ui-final-contract.log`). 결과/캡처는 다음 실행에 덮이지 않게 `artifacts/ai-copilot/personal-routes-ui-final-results/`에 복사했다.
- 저장 출처의 HTTP 소유권/결과 바인딩·원본 삭제 후 보존·TTL 테스트를 추가했다. AI+개인 경로 서버 회귀 **116 pass** (`personal-routes-origin-final-regression.log`). 불러오기/보관 결과/출처 관련 frontend+개인 backend 표적 테스트 **31 pass** (`personal-routes-origin-final-unit.log`).
- 출처 표시·원본 삭제 후 전체 보기·출처 참조 만료의 네 화면/엔진 후속 계약 **8 pass** (`personal-routes-origin-contract.log`). 앞의 44개와 중복 없는 추가 사례다.
- 최종 `npm --prefix frontend test`: **1,720 pass** (`personal-routes-origin-frontend.log`), `npm run build` 성공 (`personal-routes-origin-build.log`, 기존 large chunk 경고). `git diff --check`·AGENTS/CLAUDE 동일성도 확인했다. 전체 root check 및 전체 기존 브라우저 계약은 아직 최종 통합 단계에 남는다.
- 브라우저 로그인·모델 응답은 fixture이며, 실제 로그인→OpenAI→화면 연속 인수와 실제 토큰 측정을 대신하지 않는다. 현재 사용자 DB, `.env`, KIM 수집 설정, 기존 backend/MCP 프로세스에는 변경을 가하지 않았다.

## 다음 작업 / 미완료

1. 화면 불러오기·대체 경로·구형 VFR 복원의 실제 공급자 연속 인수. 브라우저 계약과 단위 테스트 통과를 실제 모델 의미 정확도 통과로 대신하지 않는다.
2. 기하 없는 구형 저장 입력을 편집기에서 생성·적용한 뒤 현재 경로로 재브리핑하는 전체 흐름 인수. 서버의 저장 항목 직접 재브리핑은 저장 기하가 필요하다.
3. 실제 공급자 평가에서 저장 출처·현재 자료 결과·과거 결과 없음·입력 불러오기를 모델도 정확히 구분하는지 대조한다.
4. 실제 로그인 앱→공급자→화면 인수, 개인 도구 추가에 따른 실제 토큰/품질 평가, 최종 전체 회귀.
5. 6B 알람 준비·확인·멱등 실행은 아직 미구현이다. Luna의 high/3200 중단과 고도 비교 의미 오류는 이전 검증 기록의 미해결 항목을 유지한다.
