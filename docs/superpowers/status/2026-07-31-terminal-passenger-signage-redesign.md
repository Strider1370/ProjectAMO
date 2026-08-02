# 상태 — 터미널 승객용 사이니지 재설계 (2026-07-31)

## 지금 어디까지

- 승인 스펙: `docs/superpowers/specs/2026-07-31-terminal-passenger-signage-redesign.md`
- 승인 구현 계획: `docs/superpowers/plans/2026-07-31-terminal-passenger-signage-redesign.md`
- Task 0 완료·최종 검토 승인: 관리형 1920×1080 기준 캡처 도구와 증거 (`f2d1e97`)
- Task 1 완료·적합성/품질 검토 승인: 1안·3안 공유 정규화 display model과 fixture (`e29f800`)
- Task 2 완료·적합성/품질 검토 승인: 터미널 shell, header, controls, paging 분리 (`9140626`)
- Task 3 완료·적합성/품질 검토 승인: 50–65인치 사이니지 토큰과 route-scoped CSS 기반 (`f7a91b0`)
- Task 4 완료·적합성/품질 검토 승인: 1안 보드를 도착 날씨 중심으로 재구성 (`aeb6b75`)
- Task 5 완료·적합성/품질 검토 승인: 3안 도착 예보 rail 재구성 (`857e29d`)
- Task 6 완료·적합성/품질 검토 승인: changing value만 애니메이션하도록 motion boundary 분리 (`d26a053`)
- Task 7 완료·적합성/품질 검토 승인: 관리형 1920×1080 terminal signage Playwright contract (`016e0d0`)
- 다음 작업: Task 8 — prototype/compatibility component 삭제와 정식 feature ownership 확정

## Task 0 검증 기록

- 집중 테스트: `node --test scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.test.mjs` — 7/7 통과
- root 테스트: `npm test` 통과
- 관리형 기준 증거: `artifacts/responsive-screenshots/terminal-signage/2026-07-31_125731578_before/`
- 두 화면은 1920×1080 PNG로 생성됐고 manifest는 완료 상태·두 정확한 경로·Git revision을 기록한다.
- SIGTERM은 서버 시작 전·캡처 중 모두 관리형 정리를 거치며, 최종 포트 3001/5173이 비어 있음을 확인했다.

## Task 1 검증 기록

- 정규화 model·renderer 경계 테스트: 14/14 통과
- `npm run build --prefix frontend` 통과 (기존 chunk-size 경고만 있음)
- UTF-8/FFFD와 diff 검사를 통과했고, `graphify update .`를 실행했다.
- 지연 상태, 맑음/눈 자산, 부분 현재 기상 fallback이 1안·3안에서 일관되게 표시된다.

## Task 2 검증 기록

- pager, replay, TerminalPage structure, presentation 테스트: 28/28 통과
- production build, UTF-8/FFFD, diff 검사와 `graphify update .`를 통과했다.
- URL motion mode는 allow-list로 정규화되고, page-count 변경과 view-switch rAF 취소를 안전하게 처리한다.

## Task 3 검증 기록

- shared signage token/font/style test: 14/14 통과
- `/terminal`은 remote stored-font 주입을 건너뛰지만, `/terminal/`과 일반 route는 기존 font preference 동작을 유지한다.
- passenger typography는 live selector에서 직접 `--signage-*` token을 사용하며 route scope와 safe edge를 적용한다.

## Task 4 검증 기록

- board 구조·model·style·presentation terminal suite: 48/48 통과
- production build, UTF-8/FFFD, diff 검사와 `graphify update .`를 통과했다.
- 1안은 arrival-first 정보 순서, 5-cell forecast, full-column data states, article heading/label과 기존 page transition compatibility를 가진다.

## Task 5 검증 기록

- rail structure/model/style/presentation terminal suite: 33/33 통과
- production build, UTF-8/FFFD, diff 검사와 `graphify update .`를 통과했다.
- 3안은 shared fixture/page state를 유지하며 32/68 rail, arrival-first forecast, stable local/Korea clocks 및 fallback-row transition contract를 가진다.

## Task 6 검증 기록

- full terminal suite: 66/66 통과
- production build, UTF-8/FFFD, diff 검사와 `graphify update .`를 통과했다.
- changing values만 `AnimatedValue` boundary를 가지며 fixed labels는 stable grid track에 남는다. 모든 mode는 transition lifecycle 안에서 끝나고 reduced-motion ARIA handoff를 제공한다.

## Task 7 검증 기록

- root `npm test` 통과 (frontend 832/832)
- managed terminal contract: desktop 11 통과, viewport skip 22 예상대로 발생
- real managed capture는 1안·3안 1920×1080 PNG와 completed manifest를 기록하고 exit 0로 끝났으며 ports 3001/5173이 비어 있다.
- 정확히 두 Linux baseline을 추적하고 직접 검토했다. bounded launcher cleanup은 TERM 후 1초 내 종료하지 않는 task-owned detached group만 SIGKILL한다.

## Task 8 구현 기록 (적합성/품질 검토 승인)

- `5b7d7fa`에서 `prototypes/destination-weather-comparison/` 41개 파일과 `DestinationWeatherPage.jsx`를 삭제하고, `/terminal` ownership을 `TerminalPage`·BoardView·RailView로 확정했다.
- 삭제 뒤 독립 managed capture: `artifacts/responsive-screenshots/terminal-signage/2026-08-01_100902539_after/` — manifest는 `5b7d7fa`를 기록하며 exit 0과 ports 3001/5173 clean을 확인했다.
- 계획 Task 8 Step 1의 예상 red는 Task 4·5에서 compatibility import가 이미 제거되어 재현 불가능했다. ownership test는 현재 production boundary를 보호하는 regression guard로 추가했으며, 과거 red를 주장하지 않는다.
- prototype의 ignored `artifacts/`, `dist/`, `node_modules/`까지 포함해 정확한 `prototypes/destination-weather-comparison/` 경로를 physical removal했다.
- post-deletion focused suite 78/78, frontend suite 833/833, production build, managed terminal contract 11/11, independent capture 및 graph update를 통과했다.

## 최종 인계

- 구현 계획 Task 0–8은 완료·검토 승인됐다. push·배포는 요청되지 않아 수행하지 않았다.
- 화면·계약 증거는 1920×1080 Linux desktop까지다. 50/65인치 실물 화면에서 3m/5m 판독성 확인은 **현장 수용 조건으로 남아 있으며 완료로 주장하지 않는다.**

## 보존 사항

- 승인 스펙·계획과 `docs/research/2026-07-31-vfr-readiness-research.md`는 기존 untracked 사용자 파일이므로 삭제·덮어쓰지 않는다.
- 실제 운항·기상 API 연결은 이번 범위 밖이다.
