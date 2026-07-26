# 작업 상태 (STATUS)

> **새 세션 안내:** 이 파일을 읽으면 **먼저 아래 "▶ 다음 할 일 — Task 11 체크리스트"를 사용자에게 그대로 제안**하라. 바로 코드에 들어가지 말고 체크리스트 확인부터.

최종 갱신: 2026-07-07 · 대상: 경로 예보변화 알림(#13) Phase 1

---

## 지금까지 (완료)

**#13 Phase 1 코드 완료 (Task 1~10).** 저장→등록→감시→diff→알림→조회→딥링크가 end-to-end로 이어짐. 순수/유닛 테스트 통과, `vite build` 그린.

- 계획: `docs/superpowers/plans/2026-07-07-route-forecast-alert-phase1.md` (상단 "진행 현황")
- 스펙: `docs/superpowers/specs/2026-07-07-route-forecast-alert-design.md`

| Task | 내용 | 커밋 |
|---|---|---|
| 1~3 | DB 스키마 · 개인 미니마 API(`/api/me/minima`) · 알림 등록 API(`/api/me/alerts`) | (이전) |
| 4·5 | 재브리핑 스케줄러 + diff 엔진 `backend/src/alerts/` | `56fe9dc`·`e642acd` |
| 6·7 | 텔레그램 발송 seam `sender.js` + 알림센터 피드 `/api/me/notifications` | `e876c25`·`649eb7a` |
| 8 | 인앱 알림센터(벨+Popover) `frontend/src/features/notifications/` | `19c71f3` |
| 9 | 개인설정 패널 2탭 `frontend/src/features/personal/` | `997667b` |
| 10 | 딥링크 `?flight=` 착지 `FlightAlertDetail.jsx` | `32d5675` |
| 부가 | 공항 미니마 코드상수화(편집 UI 제거) · 저장경로 IFR 로드 자동검색 | `f20f673`·`17f1a27` |

핵심 구조: diff는 순수 함수(`diff.js`), 스케줄러가 저장 `routeGeometry`로 재브리핑→스냅샷 추출→diff→`triggered_alerts` 적재→sender(인앱+텔레그램). 미니마=`users` 단일값, 공항별 미니마=코드 상수(`DEFAULT_AIRPORT_MINIMA_RULES`).

---

## ▶ 다음 할 일 — Task 11 체크리스트 (통합·검증, **사용자 환경 필요**)

실서버·봇 토큰·로그인이 필요해 이 환경에선 못 함. 사용자가 직접:

1. **텔레그램 e2e**
   - `backend/.env`에 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`(@BotFather) 설정.
   - 개인설정 [비행 알림]에서 비행 등록(ETD 2h 이내) → 강제 diff 유발 → 텔레그램 수신 + inline 버튼(`?flight=`) 탭 확인.
2. **Playwright 시각 확인** (`docs/dev-server-and-capture.md` 절차)
   - 사이드바 벨(안읽음 배지) · 알림센터 Popover · 개인설정 2탭 · `?flight=<id>` 착지 모달 스크린샷.
3. **저장경로 로드 검증** (`17f1a27`, 커밋됐으나 UI 미검증)
   - 국내(RKSS→RKPC) 불러오기 → SID/STAR 자동 매칭되나?
   - 해외(RKSI→RJOA) 불러오기 → "No RNAV route path" 오류 없이 브리핑 활성되나?
   - 이상하면: `useRouteBriefing.js` `loadSavedRoute`의 IFR 자동추천 발화 재검토(effect 체인 재추적).
4. **마무리**: `npm --prefix backend test` 전체 · `graphify update .` · `Architecture.md`/`EntryPoints.md`에 `backend/src/alerts/*`·`features/notifications`·`features/personal` 반영.

---

## 후속 백로그 (Phase 1 범위 밖)

- 딥링크 [전체 브리핑 보기] → **Option A**(저장 `routeGeometry`로 `/api/route-briefing` 재호출해 실제 브리핑 렌더). 현재는 경로 패널 열기까지만.
- 경로 창 [이 비행 알림 등록] 지름길 · `PATCH /api/me/alerts/:id` ETD 조정 UI.
- **Phase 2**: Web Push(서비스워커·manifest·VAPID·`push_subscriptions` 구독 UI). sender seam에 push 채널만 추가.
- 정리: `presets` DB 테이블(미사용, 물리 방치 중) 드롭 여부.
