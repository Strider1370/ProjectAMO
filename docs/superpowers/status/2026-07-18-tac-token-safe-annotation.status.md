# TAC 토큰 안전 강조 — handoff

Updated: 2026-07-19 KST · 상태: 구현 완료, 전체 검증 대기

Plan: `docs/superpowers/plans/2026-07-18-tac-token-safe-annotation.md`

## 확인된 문제

- `metarViewModel.js`의 `splitSegmentsOn()`이 원문 전체에서 부분 문자열을 찾는다.
- `28003KT 800`에서 시정 `800`이 바람 토큰의 `2800` 일부에 먼저 붙는다.
- `tafViewModel.js`가 같은 함수를 재사용한다. 동일 TAF fixture로 같은 오작동을 재현했다.

## 구현 진행 (2026-07-19)

- 국내 IWXXM METAR·TAF serializer가 TAC 문자열과 `header.tac.display_lines[].tokens[]` 역할 토큰을 함께 생성한다.
- 국내 processor가 새 presentation을 snapshot에 저장하고, 서버 cache hydrate가 이전 snapshot에도 같은 토큰을 메모리에서 보강한다. 파일 원본은 바꾸지 않는다.
- NOAA METAR·TAF parser는 provider raw TAC를 보존하면서 역할 토큰을 생성한다.
- 공항 패널은 원문 부분 문자열 탐색을 제거하고 token role만 기존 위험 class로 투영한다. 시정·운고·바람과 `weather-special`·`weather-precip`·`cloud-cb`가 서로 독립적으로 강조된다.
- `NULL` 같은 비기상 placeholder는 파싱·표시·재구성 TAC에서 제거했고, `+TSRA BR`은 카드에서 “강한 뇌우”로 표시하며 `+TSRA`만 특수기상 강조한다.
- focused backend·frontend tests 26개, `git diff --check`, API 실제 snapshot(RKJJ/RKJB/RPVM), Playwright RKJJ desktop 확인을 통과했다. 전체 test/build/depcruise/knip/graphify와 iPad·mobile 검증은 남아 있다.

## 결정

- 프런트의 정확 문자열 비교도 정본으로 삼지 않는다. 구조화된 항공기상 파싱 결과가 정본이다.
- 국내 IWXXM은 TAC serializer가 원문과 역할 토큰을 동시에 만들고, NOAA raw TAC는 NOAA parser가 읽을 때 역할 토큰을 만든다.
- 새 `header.tac.text` + `header.tac.display_lines[].tokens[]` 계약을 weather snapshot에 추가한다. 프런트는 역할을 기존 위험 색으로만 투영한다.
- 리뷰 반영: `raw_text`는 NOAA provider 원문 그대로 보존하고, 변화 그룹별 UI 행은 별도 `display_lines[]`로 둔다. 각 행은 `slot_time`으로 timeline slot을 직접 가리킨다.
- 리뷰 반영: 국내 IWXXM processor와 NOAA의 별도 `overseas-weather-processor.js` 저장 경로를 분리해 테스트한다.
- METAR와 TAF를 한 변경으로 함께 전환하고, 숫자 충돌 회귀 테스트를 backend와 frontend 모두에 둔다.
- 기존 캐시에 새 토큰 계약이 없으면 서버 cache hydrate가 구조화 토큰을 보강한다. 프런트 문자열 추측 fallback은 금지한다.
- SIGWX·레거시 경보의 문자열 분류는 실제 오분류 fixture가 확인될 때 별도 작업으로 다룬다.

## 주의

- 현재 작업트리에는 사용자 또는 다른 작업의 `.claude/settings.local.json`, `frontend/src/features/weather-overlays/lib/sigwxData.js` 변경이 있다. 이 작업에서 건드리지 않는다.
- UTF-8 문서/소스 수동 편집은 `apply_patch`만 사용한다.
