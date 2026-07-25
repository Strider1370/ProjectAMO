# Phase 2 — 데드 코드 / 낡은 문서 청소 (Cleanup Design)

> 작성일: 2026-06-28
> 상태: 설계 확정, 실행 대기
> **선행 조건**: Phase 1(워크플로우 헌법 재설계, `2026-06-28-workflow-constitution-redesign-design.md`) 완료 후 실행.
> graphify 설치 이후 실행하면 전수 스캔이 저렴해져 시너지.

---

## 1. 무엇을 / 왜 (What / Why)

Phase 1 워크플로우 리팩터 후, 프로젝트에 쌓인 **미사용 코드와 낡은 지침/문서를 일괄 정리**한다. 2026-06-28 병렬 서브에이전트 전수 탐색(Sonnet × 2, knip 실측)으로 확보한 인벤토리가 근거.

목표: 저장소를 "초 단위로 스캔 가능"하게 유지(헌법 §5 정신), 데드 코드로 인한 인지 부하·오해 제거.

## 2. 설계 원칙

- **knip이 정본**: 미사용 export/파일/의존성 목록은 **실행 시점에 `npx knip` 재실행**한 출력을 권위로 삼는다. 이 스펙은 정책과 고가치 구조 항목만 고정한다(목록 하드코딩 금지 — 낡음 방지).
- **수술적 삭제**: 각 삭제는 증거(knip 라인 또는 grep 0건)에 1:1 대응. 추측 삭제 금지.
- **export 제거 우선**: 내부에서만 쓰는데 `export`만 붙은 심볼은 함수 삭제가 아니라 **`export` 키워드만 제거**(동작 무변경).
- **삭제 후 검증**: 각 묶음 삭제 후 `vite build` + `npm run test:layout`(및 관련 테스트) 통과 확인.

## 3. 범위 (In Scope)

### 3.1 데드 코드 (frontend, knip 기준)
**고아 파일 삭제 (고신뢰·낮은 위험):**
- `frontend/src/features/monitoring/legacy/components/TafForecastView.jsx` (import 0)
- `frontend/scripts/airport-panel-current-weather-capture.mjs`
- `frontend/scripts/airport-station-plot-capture.mjs`
- `frontend/scripts/briefing-smoke.mjs`
- `frontend/scripts/mobile-audit.mjs`
- (위 4개 스크립트는 어떤 `package.json` script에도 안 걸림. 단, 삭제 전 ad-hoc 운영 도구로 보존 가치 1회 확인)

**미사용 export 정리:** 실행 시 `npx knip` 재실행 → 플래그된 내부 전용 export에서 `export` 키워드 제거. (2026-06-28 시점 ~30개: amosViewModel·formatters·imageOverlay·crossSectionGrid·routePlanner·useRouteBriefing·windOverlaySync·ktgTurbulenceOverlaySync·weatherTimeline·fluentTheme·route-mode·visual-mapper·legacy/helpers·sigwxData·addAdsbLayer 등 — **정본은 실행 시 knip**)

**구조적 큰 덩어리 (별도 검증 후):**
- `frontend/src/features/monitoring/legacy/` 서브트리 **통째 은퇴 검토**: TafForecastView 고아 + legacy/utils 다수 미사용 + `weather-icon-registry.js` 중복(shared 버전 존재). 은퇴 시 `legacy/WeatherIcon.jsx` 연쇄 정리 필요. 실행 전 이 서브트리가 런타임에 진짜 안 쓰이는지 grep + 빌드로 확정.

### 3.2 낡은 문서 정리
**archive로 이동 (완료된 기록, long-context-handoff §10 수명 규칙):**
- `docs/superpowers/status/kim-cloud-potential.status.md`
- `docs/superpowers/status/kim-icing-potential.status.md`
- `docs/superpowers/status/airport-weather-display-unification.status.md`
- `docs/superpowers/plans/2026-05-20-kim-nwp-server-ops-optimization.md`
- `docs/superpowers/specs/2026-05-18-kim-nwp-weather-layers-outline.md`
- `docs/superpowers/specs/2026-05-19-kim-temp-layer-design.md`

**삭제:**
- `docs/optimization-review-2026-05-20.md` (제안 항목 전부 shipped, 참조 0)

**위치 오류 정정:**
- `frontend/docs/superpowers/plans/2026-06-09-weather-layer-timestamp-bar.md` (frontend 안에 잘못 들어간 사본 — 삭제 또는 정규 위치로 이동)

**검증 후 결정 (참조 살아있음 / 불명확):**
- `docs/briefing-architecture.md` — 구현 전 초안, README 참조 중. 현재 `backend/src/briefing/`와 대조 후 갱신·통합·보존 결정
- `docs/specs/flight-category-overlay.md` — 비표준 위치. §8 open items 코드 해결 여부 확인 후 `docs/superpowers/specs/`로 이동 or archive
- `docs/superpowers/plans/2026-06-06-vertical-cross-section-overlay.md` — 6월 말 브리핑 개편에 밀렸는지 확인(`cross-section` 엔드포인트 존재 여부)
- `docs/research/*` 3건 — 디자인 헌법 흡수 여부 확인 후 archive/삭제

### 3.3 사람 판단 필요 (실행 전 확인)
- `backend/ctps.nc` — 미추적 바이너리(NetCDF 추정). **런타임 데이터 파일일 수 있음** → 소유자(사용자) 확인 후: 삭제 / `.gitignore` 추가 / 보존 중 택1
- `project-kma` (`frontend/package.json` `file:..` 자기참조) — 워크스페이스 호이스팅/빌드 의존일 수 있음 → 빌드 의존 확인 후 미사용 확정 시 제거

## 4. 범위 밖 (Anti-Scope)
- Phase 1이 처리하는 항목 중복 금지: `.codex/`, `docs/policies/code-review-graph.md`(삭제), `docs/dev-server-and-capture.md`(재작성)
- `docs/design/design-language.md` — 불가침
- `docs/superpowers/archive/**` — 이미 보관처
- 동작 변경·리팩터·기능 추가 — 이번엔 순수 삭제/이동만. export 제거도 동작 불변 범위로 한정

## 5. 성공 기준
1. `npx knip`(frontend) 재실행 시 고아 파일 0, 미사용 내부 export 0(또는 사유와 함께 화이트리스트)
2. 위 고아 파일 5개 부재, `vite build` + 관련 테스트 통과
3. `monitoring/legacy/` 서브트리: 은퇴(또는 "현역" 판정 후 보존 사유 기록) 결정 완료
4. archive 이동 6건 완료, `docs/superpowers/status/`에 완료된 status 잔존 0
5. `docs/optimization-review-2026-05-20.md` 부재
6. 잘못 위치한 `frontend/docs/...timestamp-bar.md` 정리
7. 검증 후 결정 4건 각각 처리 결과 기록(삭제/이동/보존+사유)
8. `backend/ctps.nc`·`project-kma` 각각 사용자 확인 결과대로 처리
9. design-language.md 무변경, 모든 파일 UTF-8 보존
10. 전체 삭제 후 `vite build` + 백엔드 기동 + 핵심 테스트 그린

## 6. 리스크 / 통제
| 리스크 | 통제 |
|---|---|
| 동적 import/문자열 참조를 데드로 오판 | knip + grep 병행, 라우트/lazy load 수동 확인, 의심 시 export 제거(파일 삭제 아님) |
| legacy 서브트리 연쇄 삭제 누락 | 서브트리 단위로 빌드·테스트 그린 확인 후 묶음 커밋 |
| `ctps.nc` 런타임 데이터 오삭제 | 사용자 확인 전 삭제 금지 |
| `project-kma` 제거가 빌드 깨뜨림 | 제거 후 즉시 `vite build`로 확인, 깨지면 롤백 |
| 인코딩 손상(한글 문서 다수) | Write/Node fs UTF-8, PowerShell Set-Content 금지 |

## 7. 실행 메모
- 정본 목록은 실행 시 `npx knip --reporter json`(frontend)로 재생성.
- 삭제는 영역별 묶음 → 묶음마다 빌드/테스트 → 커밋(되돌리기 쉽게).
- 2026-06-28 원본 탐색 근거: 병렬 Sonnet 스카우트 2건(문서/데드코드), knip exit 0.
