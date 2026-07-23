# Satellite Convective Layers Status

Updated: 2026-07-23 KST  
Spec: `docs/superpowers/specs/2026-07-23-satellite-convective-layers.md`  
Plan: `docs/superpowers/plans/2026-07-23-satellite-convective-layers-rev2.md`

## Resume Point

- Last completed: Task 1~5 코드 연결 — 공용 GK2A 파서/격자, 독립 CI·CTPS 자산 수집·원자 저장, 메타·점 API, 정확한 시각 모델, 지도 레이어·토글·고도 레일·선택 카드를 작성했다.
- Next: Vite/Playwright가 필요한 브라우저 계약과 구조 검사만 Windows 하위 프로세스 허용 환경에서 실행한다.

## Verified

- 사용자가 2026-07-23에 rev2 구현을 명시적으로 승인했다.
- 파서·수집기·서버·프런트 JavaScript 문법 검사와 `git diff --check`가 통과했다.
- Node 단일 프로세스 모드로 backend Task 1 테스트 18개, 수집/저장 테스트 3개, CTPS point API 테스트 1개, frontend 관련 테스트 45개가 통과했다.
- 독립 검토에서 확인된 CI-only 관측시각, classic basemap의 layer order, OFF 뒤 stale 선택점 문제를 수정하고 관련 테스트를 재통과시켰다. 같은 시각의 CI→CTPS 부분 갱신 snapshot과 독립 메타 새로고침 테스트도 추가했다.
- CI·CTPS는 별도 `satellite/convective/convective_meta.json`과 immutable 자산을 사용하며, 원시 CTPS binary는 정적 제공에서 차단했다.
- CI/CTPS 토글은 독립 기본 OFF이고, CTPS 아래·CI 위 순서, FL050~550 필터, 단일 선택 카드·stale 응답 차단을 구현했다.

## Unverified / Skipped

- 일반 `node --test`와 Vite build는 Windows 샌드박스가 하위 프로세스를 `spawn EPERM`으로 차단한다. Node의 단일 프로세스 test isolation은 통과했다.
- `map-base`에 CI·CTPS 고정 fixture, 독립 토글, CTPS 레일, 두 번의 베이스맵 전환을 위한 계약을 추가했지만 Playwright 실행 증거는 없다. Vite build는 기본·runner configLoader 모두 Windows `spawn EPERM`으로 실패했다. madge/knip, 색상 lint, graphify 갱신도 아직 실행 증거가 없다.
- 백엔드 전체 407개를 단일 프로세스 모드로 실행하면 401개 통과·6개 실패다. 실패는 기존 compression/KIM/snapshot 테스트와 새 API 테스트가 같은 프로세스에서 전역 `DATA_PATH`·서버 import cache를 공유하면서 발생한 충돌이며, 새 API 테스트 단독 실행은 통과했다. `depcruise`는 저장소 설정 파일이 없고 no-config 전체 스캔이 의존성 폴더까지 진행돼 중단했다.

## Failed Attempts

- Windows `apply_patch`가 split writable-root sandbox 오류로 거절됐다. 승인된 Node UTF-8 기계적 치환으로 제한된 파일만 수정했다.
- 테스트/빌드 권한 승인은 자동 승인 서비스가 `unsupported model` 오류를 반환해 실행되지 않았다.
