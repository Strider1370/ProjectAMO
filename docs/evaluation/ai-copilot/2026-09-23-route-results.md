# 고도 비교·같은 결과 화면 연결

기준: 2026-09-23 KST. 4B/4C의 구현 진행 기록이며 전체 단계 완료 선언이 아니다.

## 구현

- `backend/src/briefing/altitude-service.js`: 기존 REST 후보/제약/프로파일/기상 계산을 공유한다. 챗봇/MCP는 원래 브리핑의 고정 자료로 요청한 고도 2~5개를 비교한다. AIP `valid`/`input_only`/`input_invalid`, 프로파일 적용/순항 fallback, 자료 누락을 유지하고 안전 순위는 만들지 않는다.
- 브리핑 생성 시 AIP·NWP·지형을 한 번 포착한다. 이후 원자료가 바뀌어도 비교는 같은 자료를 사용한다. 기상 비교는 기존 계산과 같이 절차 구간을 포함한 전체 경로이며 AIP 조건의 항로 구간 범위와 구분해 표시한다.
- 실자료에서 발견한 수정: 큰 단면을 비교 결과마다 복제하면 32MiB 저장 한도로 원래 브리핑이 축출됐다. `stored-briefing.js`로 원본은 한 번 보관하고 고도 비교는 차이만 저장한다. 반복 비교의 참조를 최초 원본으로 평탄화하며 같은 owner/원본 hash/TTL을 검사한다. 원본 만료·축출 시 최신 자료로 대체하지 않는다.
- `model-time-coverage.js`: 보관된 KIM run·유효시각·제공 프레임 범위와 요청 시각/마커 오프셋을 비교한다. KIM 범위 안이라는 것이 KTG·수평·연직 coverage를 증명하지 않음을 명시한다. 로컬 KIM을 수집하지 않아 오래된 run이 있을 때 이를 현재 시각 예보로 취급하지 않는다.
- 프런트엔드 `useCopilotResult`/provider/adapter와 `CopilotResultView`: 카드의 ‘같은 결과 전체 보기’가 소유권 확인 결과 API를 읽고 기존 `BriefingView`·지도 경로·단면에 설치한다. 모델이 다시 계산하거나 단면을 읽지 않는다. 적용 경로·초안은 보존하고 닫으면 원래 보기를 복원한다.
- 결과 ID/hash/만료 검증, 계정·경로·화면 변경 중의 지연 응답 취소, 지도 미준비/편집 중 명시적 오류. 만료 시 ‘현재 경로로 다시 질문 작성’은 입력만 채우며 유료 요청을 자동 전송하지 않는다.
- 보관 결과 보기에서 최신 알림/샘플 일기도를 섞지 않는다. 0건을 ‘위험기상 없음’으로 표시하던 기존 UI 문구도 보관 결과에서는 완전성 미확인으로 표시한다. 지도 배경의 별도 기상 레이어는 같은 시각을 보장하지 않는다고 안내한다.

## 실자료 측정

수집 없이 `backend/data`의 기존 파일을 worker에서 읽었다. fixture 경로 입력은 김포–제주 절차/항로, ETD/ETA는 검증 시각 기준 별도 입력이다. 기본 모델/추론 설정 변경이나 LLM 유료 호출은 이 검증에 없다.

- 첫 시도: 두 고도 비교 3회 중 세 번째에 `REFERENCE_NOT_FOUND`. 비교 결과 조회 payload 약 18.7MB. 이 실패를 숨기지 않고 저장 구조를 수정했다.
- 수정 후 반복 3회 모두 성공. 두 번의 측정에서 비교+전체 결과 조회 0.13~0.38초. 도구 projection 약 10.6KB, 전체 화면 payload 약 9.6MB. 후자는 LLM 토큰 입력이 아니며 버튼 클릭 시 브라우저로 전달된다.
- 로컬 run `2026091006`, KIM 유효 `2026-09-10T15:00:00Z`가 선택돼 요청 범위 밖을 명시했다. 해당 경로의 요청 FL310/FL330은 현재 AIP 조건상 `input_invalid`; 이를 임의 정상 고도로 바꾸지 않았다. 정상/미확정 프로파일 비교는 합성 단위 fixture에서도 별도로 검증했다.
- worker 계산 경계를 사용하지만 큰 전체 payload 복사/직렬화 부담은 남는다. 동시 자동 검증을 실행한 표본에서 메인 루프 최대 지연 약 128~317ms. 운영 성능 통과/고부하 지표로 해석하지 않는다. 단면의 별도 지연 조회 및 전송량 최적화는 후속 인수에서 확인한다.
- 근거: ignored `artifacts/ai-copilot/route-worker-metrics{,-fixed,-final}.jsonl` 및 `verify-route-worker.mjs`.

## 검증 및 남은 인수

- 공유 REST 계산 동등성, AIP 충돌/미확정, 자료 변경 후 동일 비교, owner/TTL/잘못된 입력, 대용량 원본 공유·참조 평탄화, 도구 노출 gate, 화면 provider 무재계산·identity 단위 검증.
- 초기 전체 `npm run check`: backend 1,344 pass/1 skip, frontend 1,701 pass, shared14/launcher7/nginx4 및 build 성공. 이후 저장 중복/시각 coverage/모바일 상태 보완을 추가했으며 최종 실행 결과를 아래에 기록한다.
- 동일 결과 열기·결과 ID/hash·지도 geometry 일치·닫기 복원·최신 API 무호출 4개 뷰포트/엔진 통과. 전체 `copilot-chat`/`copilot-route` 확장 재실행 중이다. 모바일에서 접으면 카드 내부 상태가 사라져 늦은 요청 오류를 못 보여준 문제는 패널 소유 상태로 옮겼다. 코드 수정 중 HMR과 겹친 Safari 실패도 있었으므로 수정 없는 연속 재실행 결과만 최종 근거로 삼는다.
- 재실행에서 참조 없는 카드의 `undefined === undefined` 비교가 참이 되어 null action 상태를 읽는 렌더 오류를 발견·수정했다. 결과 참조 없는 고도 표 fixture가 이 회귀를 실제로 검출한다. 실패 실행은 성공으로 합산하지 않는다.
- 남음: 실제 인증 브라우저→공급자 인수, LLM의 고도 비교 설명/토큰 측정, 실제 보관 단면 브라우저 대조, 다중 경로·시각 선택, 맥락 충돌 확인, 경로 없는 질문의 입력 채움·초안 확인. 5A/5B 서버 경로 생성, 6A/6B 개인 경로/알람, 7 통합 인수는 여전히 미완료다.

후속 4A 맥락 충돌 UI는 [별도 기록](2026-09-23-context-choice.md)에서 이어진다. 위 ‘남음’은 이 결과 연결 검증 당시의 상태다.

모델 기본값은 사용자의 추가 결정 전 기존 Luna low를 유지한다. KIM 새 수집·배포는 하지 않았다.

### 최종 재검증

- `npm run check`: backend **1,347 pass / 1 skip**, frontend **1,701 pass**, shared14/launcher7/nginx4 및 build 성공. 기존 chunk 크기 경고만 남는다. `altitude-result-full-check-verified.log`.
- 최신 로컬 앱 서버를 **KIM 수집 제외**로 재시작했다. `/api/ai/status`는 `enabled:true, ready:true`. 3001/5173 준비 완료. 별도 MCP 3101의 기존 세션은 재시작하지 않았다.
- 코드 변경 없이 최신 서버로 `copilot-chat|copilot-route` **32/32 pass**, desktop/iPad Chromium/mobile/iPad WebKit. 결과/경로 일치, 닫기 복원, 만료의 명시적 재질문, 화면 변경 후 늦은 결과 차단과 모바일 접기 후 오류 표시를 포함한다. 각 테스트의 console에서 `pageerror` 없음. `route-result-browser-verified.log`.
- iPad·모바일 캡처를 직접 확인했다. fixture는 기상자료가 없는 상태로, 보관 결과 시각/누락/위험 확정 불가를 표시한다. 실제 최신 기상 브리핑 정확도 인수를 대신하지 않는다.
- 기존 IFR/VFR 설정 흐름·단면/NAVLOG 동시 예보시간 변경·전체 브리핑/지도 보기 전환: **11 pass / 1 skip**. mobile의 데스크톱 전체/지도 전환 버튼 테스트는 기존 정책대로 skip. `route-result-regression.log`.
- 후속 연결 보완: 보관 결과를 보다가 채팅을 열어도 읽기 전용 경로 맥락을 보존하고, ‘현재 화면 연결’은 뒤에 남겨둔 원래 적용 경로가 아니라 **보고 있는 결과의 request**를 복제해 등록한다. 모바일에서 브리핑 시트를 숨기는 동작과 결과 맥락 해제를 구분한다. 명시적으로 결과를 닫으면 기존 적용 경로로 돌아간다. 이 변경 후 동일 결과→후속 질문/마커·geometry·NWP 선택과 취소의 영향 범위 **8/8 pass**(4개 뷰포트/엔진), 관련 단위 6/6 및 build 성공. `route-result-context-verified.log`, `route-result-context-build-final.log`. 이전 전체 32개 실행과 구분한다.
- 화면 전환 때 fetch abort가 DOMException 숫자 `20`으로 노출되던 것을 `RESULT_OPEN_CANCELLED`로 정규화했다. 취소 자체는 동작했지만 의미 있는 오류 계약도 필요하므로 실패 기록을 남기고 재실행했다.
