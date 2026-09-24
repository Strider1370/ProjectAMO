# 구형 저장 경로·항법자료 갱신 연속 인수

2026-09-24 KST. 실제 경로 편집기·서버 planner/context/briefing을 사용한 브라우저 검증이다. 로그인·채팅 HTTP는 모의 응답이며 실제 LLM 품질 검증과 구분한다. 원본 사용자 DB와 항법자료는 변경하지 않았다.

## 구형 저장 경로

`copilot-personal`에 기하 없는 저장 입력의 확인 불러오기 → 사용자의 자동 생성 → 경로 비교 화면 → 현재 화면 연결 질문 → 실제 서버 context 검증/브리핑 → 같은 보관 결과 열기를 추가했다.

- 생성 전에는 적용 기하·서버 context·기상 요청이 없다.
- 생성 후 실제 지도 geometry, 공항, ETD/ETA, 고도, 경유점 ID가 서버 입력과 일치한다.
- 기상 자료가 없는 runtime에서 누락 상태를 보존한다. 결과 hash가 화면과 일치한다.
- 메모리 DB의 원본 행은 실행 전후 동일하며 개인 저장 API 쓰기는 0회다.

첫 모바일 시험은 이미 열린 편집기에 존재하지 않는 확장 버튼을 누르는 테스트 오류로 실패했다. 해당 불필요한 동작만 제거했으며 제품 코드를 바꾸지 않았다. 최종 표적 검증은 네 화면/엔진 **4 pass** (`legacy-continuous-final.log`).

## 항법자료 publication 교체

`copilot-route-create`에서 저장소 항법자료를 소유한 임시 디렉터리에 복사하고 publication 식별자만 바꿨다. 실제 운영 파일 교체 시험은 아니다.

1. provider A로 생성한 결과 및 이미 로드한 브라우저는 A snapshot을 유지한다.
2. 복사본 교체 후 새 provider B는 다른 publication/snapshot을 읽는다.
3. 브라우저 갱신 후 A 결과는 열어 볼 수 있지만 편집기 가져오기는 `NAVDATA_PLAN_MISMATCH`로 거부한다. 기존 보기와 hash는 보존한다.
4. B에서 생성한 새 결과는 확인 후 가져올 수 있고 실제 지도 기하가 일치한다. 가져오기 자체는 기상을 다시 계산하지 않는다.

첫 시험은 provider의 publication 값을 잘못된 위치에서 읽은 테스트 오류로 실패했다. `loadNavdata().publicationId`로 교정했으며 제품 변경은 없었다. 최종 표적 검증은 네 화면/엔진 **4 pass** (`publication-continuous-final.log`). 원본 항법자료 byte 동일성을 검사하고 소유한 임시 복사본만 정리했다.

## 합동 회귀

```bash
cd frontend
CONTRACT_REUSE_SERVER=1 CONTRACT_DATA_PATH=/home/john_doe/ProjectAMO/backend/data \
  npx playwright test copilot-personal.spec.mjs copilot-route-create.spec.mjs \
  --retries=0 --reporter=list \
  --output=../artifacts/ai-copilot/personal-publication-regression
```

**64 pass / 0 fail / 재시도 0, 6.9분.** `copilot-personal` 44개 + `copilot-route-create` 20개. desktop/iPad landscape/mobile/iPad Safari(WebKit) 각 16개다. 로그와 스크린샷은 `artifacts/ai-copilot/personal-publication-regression*`에 보관한다. 사용자 서버는 재사용했고 수집/계정 설정·KIM 자료에는 쓰지 않았다.

이 증거는 구형 경로의 수동 생성 연속 흐름과 항법자료 세대 교체 인수를 마친다. 실제 공급자의 `current_briefing` 설명 정확도 및 공개 설정 결정은 별도 평가를 따른다. 이전 개인 경로 기록의 ‘6B 미구현’ 등은 당시 상태이며, 후속 [알람 구현](2026-09-24-personal-alerts.md)과 [실제 인증/OpenAI 8턴](2026-09-24-live-browser.md) 기록으로 대체됐다.
