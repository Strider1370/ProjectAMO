# 상태 — ADS-B 항적 패널 (2026-07-30)

## 지금 어디까지

- 스펙 승인 완료: `docs/superpowers/specs/2026-07-30-adsb-traffic-panel-design.md` (커밋 `01175c3`)
- 계획 작성 완료: `docs/superpowers/plans/2026-07-30-adsb-traffic-panel.md` (커밋 `dc0b394`) — 7개 작업, 실제 코드까지 적혀 있음
- 구현: **아직 시작 안 함.** 새 세션에서 `subagent-driven-development`로 실행 예정
- 그 전 작업(TAF 표·모바일 글자크기·NOAA 시정 손실)은 `d02d8b6`, `da6d810`, `edde9ac`로 커밋 완료. `main`은 깨끗함(테스트 backend 59 / frontend 726 통과)

## 새 세션에서 실행할 때 정해진 것

- **브랜치**: `main`에서 새 브랜치(또는 worktree)를 만들어 작업한다. `main`에 직접 커밋하지 않는다
- **Task 3 화면 테스트**: 계획대로 소스 문자열 검사 방식을 유지한다(이 저장소 관행, 렌더 테스트 도구 없음). 실제 동작은 Task 7 Playwright로 검증한다. 리뷰어가 "약한 테스트"로 지적하면 이 결정을 근거로 park한다
- **판정 단일화**: 지도 조건식과 JS 판정을 이중으로 만들지 않는다. 판정은 `trafficFilter.js`에서 한 번, 지도에는 `icao24` 목록만 넘긴다

## 실행 시 주의

- ADS-B는 `/api/adsb` 요청이 올 때만 데이터를 받는다(의도된 설계). 켜지 않으면 항공기 0대가 정상이다. Task 7 검증 때 반드시 켠 뒤 수신될 때까지 기다린다
- 개발 백엔드는 파서를 메모리에 들고 있다. 파서를 건드리는 작업이 아니므로 이번엔 재시작이 필요 없지만, 데이터가 이상하면 백엔드 재시작을 먼저 의심한다
- `prototypes/`(166MB)는 커밋하지 않은 채 남겨 뒀다. 필요하면 `.gitignore`에 넣을지 결정해야 한다

## 새 세션 프롬프트 (그대로 붙여넣기)

```
docs/superpowers/plans/2026-07-30-adsb-traffic-panel.md 를 subagent-driven-development로 실행해줘.

- 스펙: docs/superpowers/specs/2026-07-30-adsb-traffic-panel-design.md
- 인계 메모: docs/superpowers/status/2026-07-30-adsb-traffic-panel.md (먼저 읽어)
- main에서 새 브랜치를 만들어 작업하고, main에 직접 커밋하지 마
- Task 3의 화면 테스트는 계획대로 소스 문자열 검사 방식을 유지해 (이 저장소 관행)
- Task 7 브라우저 검증은 ADS-B를 켠 뒤 데이터가 수신될 때까지 기다려서 확인해
```
