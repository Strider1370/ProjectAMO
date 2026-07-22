# 모니터링 데이터 수명주기 통합 Status

Updated: 2026-07-23 01:34 KST
Spec: `docs/superpowers/specs/2026-07-23-monitoring-data-lifecycle-unification.md`
Plan: `docs/superpowers/plans/2026-07-23-monitoring-data-lifecycle-unification.md`

## Resume Point

- Last completed: 사용자 승인으로 spec/plan을 보정했고, Opus와 별도 Decision Completeness reviewer의 재검토에서 PASS를 받았다. 코드 변경은 시작하지 않았다.
- Next: Task 1 전, working tree의 사용자 변경을 다시 확인한 뒤 고정 fixture와 변경 전 screenshot baseline을 만든다.

## Verified

- `AGENTS.md`, `Architecture.md`, policy index, spec/plan/status 형식, encoding safety, browser contract와 dev-server 절차를 읽었다.
- 현재 `/monitoring`은 `MainAppShell`과 동시에 마운트되지 않으며, backend collector/store/cron/API는 이미 공통이라는 것을 코드로 확인했다.
- 현재 스펙은 Opus와 독립 reviewer의 재검토에서 PASS를 받았다.
- Decision completeness review: 별도 reviewer PASS. FR-005b/FR-006a가 snapshot 전진과 HTTP 200 JSON `null` 표시 규칙을 확정했고, visual test 12개는 파일 경로 실행으로 무실행 통과를 막는다.
- Opus read-only re-review: PASS. 모니터링의 `changedData → latestSnapshot → saved` snapshot fallback과 12개 screenshot assertion 실행 경로를 확인했다.

## Unverified / Skipped

- Playwright visual fixture와 screenshot baseline은 Task 1에서 구현 전 기준으로 만들 예정이다.

## Failed Attempts

- 기존 repository graph는 monitoring 수명주기 관계를 충분히 표현하지 않아, 관련 source와 contract를 직접 추적했다.
- 첫 구현 계획은 monitoring의 기존 `nextSnapshotState(snapshot, changedData, saved)`의 server snapshot fallback을 공통 hook contract에 넣지 않았다. client data로만 snapshot을 재구성하면 SIGWX fronts/clouds metadata처럼 server와 client가 별도로 key를 만든 자료가 매 주기 변경으로 재감지될 수 있다.
- `--grep monitoring`만으로 visual test 실행을 보장하려 했으나, Playwright grep은 파일명이 아니라 test title을 거른다. visual test의 title 또는 파일 경로 실행을 계획에 명시해야 한다.
