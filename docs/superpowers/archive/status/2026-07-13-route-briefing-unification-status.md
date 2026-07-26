# STATUS — 경로·브리핑 생성 통일 (핸드오프)

> **새 세션 안내:** 먼저 **spec → plan**을 읽어라. 그다음 아래 "다음 할 일"부터.
> - 설계(what/why): [`specs/2026-07-13-route-briefing-unification-design.md`](../specs/2026-07-13-route-briefing-unification-design.md)
> - 플랜(how·체크박스): [`plans/2026-07-13-route-briefing-unification-plan.md`](../plans/2026-07-13-route-briefing-unification-plan.md)

최종 갱신: 2026-07-13

## 한 줄
저장 경로를 **재검색 없이** 브리핑으로 조립하도록 통일 중. 경로를 **중간(항로 스켈레톤=저장분 그대로) + 양 끝(SID/STAR=예보 바람으로 재도출)**로 나눔. 해외 IFR `No RNAV route path` 해소가 핵심 목표.

## 지금까지 (완료·검증)
- **설계·플랜 확정**: 3각도 spec 리뷰 + 2각도 plan 리뷰 반영. 구멍 메움.
- **Phase 0.1 (payload 실측)**: `backend/scripts/measure-route-payload.js`. 실측 결과 → **판정: dual-save는 IFR만**. VFR은 `routeGeometry`가 곧 스켈레톤이라 `enrouteGeometry` 중복 저장 안 함(극단 VFR 120경유점=26.7KB 초과 문제 원천 제거).
- **Phase 0.2 (백엔드 안전망)**: `scheduler.js` `buildBriefingRequest`가 `p.routeGeometry ?? p.enrouteGeometry`로 방어적 읽기. 유닛 테스트 추가. **backend 325 그린.**
- **Phase 1.1 (저장 포맷)**: `RouteBriefingPanel.jsx` 저장부 — IFR일 때 절차 증강 전 스켈레톤(`route-preview-line`)을 `enrouteGeometry`로 추가 저장. VFR은 안 함. **프론트 빌드 그린.** (payload 실검증은 Phase 3 브라우저 세션에 배치)

## ▶ 다음 할 일 — Phase 2 (TAF 바람)
1. **순수 헬퍼**: TAF timeline에서 특정 시각 바람 뽑기. TAF 구조 = `taf.timeline[] = { time, wind:{ direction, speed, gust, calm }, ... }`(백엔드 `selectTafAtEta` 패턴 참조). + "ETD가 TAF 유효기간 안이면 예보 바람, 밖이면 METAR" 규칙. 프론트 유닛 러너 없음 → node assert 자체검증.
2. **⚠️ 배선(핵심)**: 절차 재도출이 도는 `useRouteBriefing`은 현재 `{ activePanel, airports, metarData }`만 받음 — **TAF를 안 받는다.** `tafData`를 prop으로 배선해야 함(App.jsx → MapView → useRouteBriefing). 지금 활주로/SID 선택은 `getWindDirection(metarData, ...)`(현재 바람)만 씀 → 이걸 TAF 바람으로 교체.
그다음 **Phase 3(핵심 수술)**: 재검색 없는 로드 + 최소 routeResult + 절차 재도출(데이터 로드 **명시적 await** 게이트) + 딥링크/로드 버튼 배선. Playwright(로그인+저장데이터)로 검증. 플랜 Phase 3 참조.

## 핵심 결정·주의 (까먹지 말 것)
- **dual-save는 IFR만.** 로드 시 IFR=`enrouteGeometry ?? routeGeometry`, VFR=`routeGeometry`, 구버전=`routeGeometry` 폴백(절차 색 생략).
- **배포 순서**: 0.2(스케줄러 폴백)는 프론트 저장 변경보다 먼저 운영 반영. 스켈레톤 저장분 생기면 **0.2는 영구 유지**.
- **알림 감시 = 저장 경로 그대로**(절차 무관, 스펙 §7). 절차 재도출은 화면 표시 전용.
- **Phase 3.2 타이밍**: 절차 데이터(sidOptions/star/iap)를 effect에 맡기지 말고 **직접 await** 후 재도출(예전 effect-사슬 footgun 재발 방지).
- **Phase 4.1**: 재저장 시 `snapshotCache.delete(routeId)`(헛발화 방지, TDD).

## 별개(이미 완료, 배포 가능)
같은 브랜치의 **직전 커밋**에 #13 알림 UX 작업(문구 개편·묶음발송·관리자 텔레그램 게이트·인앱 동기화)이 **완료·테스트됨**. 원래 목표 "배포해서 알림 직접 테스트"는 이 부분으로 준비돼 있음(경로 통일과 독립).

## 이번 세션 변경 파일
- 알림 UX: `alerts/sender.js`, `alerts/scheduler.js`, `me/alerts.js`, `test/alert-sender.test.js`, `test/alert-scheduler.test.js`, `test/overseas-config.test.js`, `notifications/{notificationFormat.js,NotificationCenter.jsx,FlightAlertDetail.jsx}`
- 경로 통일: `docs/superpowers/{specs,plans,status}/2026-07-13-*`, `backend/scripts/measure-route-payload.js`, `route-briefing/RouteBriefingPanel.jsx`
- ⚠️ 커밋 안 함(다른 세션 작업): `config.js`, `index.js`, `processors/*`, `WeatherOverlayPanel.jsx`, 스크래치 파일.
