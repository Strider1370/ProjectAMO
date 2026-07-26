# NOTAM Integration Status

Updated: 2026-07-03 16:30 KST
Spec: docs/superpowers/specs/2026-07-03-notam-integration-design.md
Plan (Phase A): docs/superpowers/archive/plans/2026-07-03-notam-phase-a-backend.md
Mockup: docs/superpowers/specs/refs/2026-07-03-notam-ui-mockup.html
Branch: **feat/notam-backend** (do NOT work on main)

## What this feature is (one-paragraph context)

대한민국 유효 NOTAM(항공고시보)을 백엔드가 주기적으로 크롤링(KOCA `aim.koca.go.kr` KML 다운로드) →
파싱 → 카테고리 분류 → `GET /api/notam`으로 서빙하고, 프론트에서 (A) 사이드바 전역 NOTAM 패널,
(B) 공항 패널 NOTAM 탭, 지도 레이어로 표시하고, (C) 비행 전 브리핑에 경로상 NOTAM을 연동한다.
3 Phase로 분할: **A=백엔드 파이프라인(현재 진행 중)**, B=프론트 UI, C=브리핑 연동. A만으로도 동작하는 API가 나온다.

## 핵심 결정(맥락 — 새 세션이 반드시 알아야 할 것)

- **색 = 시간 상태(발효중 red / 곧발효 amber / 예정 gray), 카테고리 무관 균일.** 우리는 위험도(심각도)를
  판단하지 않는다(안전/책임). 색은 B)/C) 필드에서 나온 객관적 사실. 카테고리는 아이콘+라벨로만 구분.
- **단, Go/No-go에 영향주는 NOTAM(공역 제한 계열 RP/RR/RT/RA/RD/WM이 발효중+경로통과=경로 저촉)은
  브리핑 배너에 사실 반영**(binary 플래그, 등급 아님). 이건 Phase C.
- **크롤 창 = 사이트 강제 24h**(7일 창 시도 실패 — validateAndSearch가 to-date를 from+1day로 clamp함을
  실측 확인). 대신 **6시간 주기 크롤**로 전방 가시성 ≥18h 확보. 크롤러는 날짜 조작 없이 기본 다운로드만.
- **고도 표시는 AGL/AMSL 기준면 보존 필수**(안전 — 500FT AGL≠AMSL). 파서가 F)/G)에서 ref 분리 저장.
- **FIR 스코프**: A)RKRR = 인천 FIR(전역). scope='fir'는 모든 공항 탭에 "전역 공지"로 노출, 지도 폴리곤은 제외.
- **파서는 실제 KOCA KML fixture로 검증**(`backend/test/fixtures/notam-sample.kml`, 실제 4건).
  실측으로 발견한 버그: KML MultiGeometry가 항상 Point(라벨 앵커)+Polygon이라 **지오메트리 추출은
  Polygon→LineString→Point 순서**여야 함(Point-first면 모든 폴리곤이 점으로 렌더됨).

## Resume Point

- Last completed: **Task 6** (cron+API route wiring) — 코드 반영 완료, 로컬 검증 완료. **아직 커밋 안 함**(사용자 커밋 승인 대기).
  - 수정: `backend/server.js`(`GET /api/notam` 라우트), `backend/src/index.js`(import·`locks.notam`·초기수집 job·`cron.schedule(notam_interval)`).
  - 로컬 검증: 서버 부팅 → `/api/notam` 응답 **376건 / horizon_hours 24 / spec item 계약 일치**, `node --test` **205 pass/0 fail**.
  - 참고: 검증 중 로컬 `node_modules`에 playwright 미설치가 드러나 `npm install`로 복구함(lockfile엔 이미 있었음).
- **Next: Task 7** — Architecture.md "Backend" File Roles에 notam 파일 4줄 추가(plan Task 7에 정확한 문구). 단 plan 문구는
  "(7-day window)"라 되어 있는데 실제는 24h이므로 **"(site-default 24h window)"로 고쳐서** 넣을 것.
- **그다음**: superpowers:finishing-a-development-branch 로 마무리(테스트 확인 → 머지/PR 옵션 제시).

## Verified

- `cd backend && node --test` → **205 pass / 0 fail** (Task 6 완료 시점, notam-crawler/parser/processor/store 포함).
- **Task 6 라이브(로컬 Windows)**: 서버 부팅 후 `GET /api/notam` → 376건, `horizon_hours:24`, item 형태가 spec 계약(id/series/location/qcode/category/scope/valid_from/valid_to/altitude/summary/geometry)과 일치. 크롤→파싱→분류→save→route 전 체인 동작 확인.
- 크롤러 로직(goto + click KML다운로드)은 세션 중 스파이크로 라이브 다운로드 성공 검증(로컬 Windows).
- 파서: 실제 fixture 4건(QGAXX Point+Polygon, QRDCA danger Poly FIR, QOBCE obstacle, QRDCA LineString)에
  대해 5 test 통과 — 지오메트리/AGL/카테고리/스코프 정확.

## Deploy Gate (검증 완료 — 2026-07-03)

- **AWS EC2(3.34.113.37, Amazon Linux 2023)에서 라이브 크롤 검증 성공** — 격리 폴더(`~/notam-test`, feat/notam-backend clone)에서
  `crawlNotamKml()` 단독 실행: **382 Placemark / 855KB KML / 14.5초**, 정상 KML(`A0593/26 ...`) 확인. 임시 폴더는 삭제, 운영 폴더 무손상.
  - **AWS IP 차단 없음**: `curl https://aim.koca.go.kr/` → 200 / 0.09s.
  - **Chromium 설치 주의**: `--with-deps`는 Ubuntu(apt-get) 전용이라 Amazon Linux에서 **실패**. 대신
    `npx playwright install chromium`(바이너리만) + `sudo dnf install -y nss nspr atk at-spi2-atk at-spi2-core cups-libs
    libdrm libXcomposite libXdamage libXext libXfixes libXrandr mesa-libgbm libxcb libxkbcommon pango cairo alsa-lib`.
  - **타임아웃 여유**: 14.5초 → `config.notam.timeout_ms`(기본 30000) 안에 충분히 들어옴.
  - **서버에 남긴 것(실배포 재사용)**: `~/.cache/ms-playwright`(646MB) + 위 dnf 라이브러리. 배포 시 재다운로드 불필요.
- 새 playwright 의존성이라 실배포는 `deploy-vm-full.sh` 필요(fast deploy 아님).

## Deviations from Plan

- **7일 창 → 24h+6h로 변경**(실측 발견). plan/spec/mockup 전부 동기화 완료. 크롤러에서 날짜 필드 조작 제거(더 단순).
- **categorize 폴백 수정**: 당초 plan은 "unlisted→facility"였으나 spec 정합 위해 facility-family 코드를 명시 매핑,
  미매핑→'other'로 변경(실측 414건 subject는 전부 매핑됨, 'other'는 희귀). plan 문서도 수정 반영.
- Task 5 config를 Task 4보다 먼저 부분 적용(processor가 config.notam.fir_codes를 모듈 로드 시 읽어서 — 잠재 순서 의존성).

## 이 브랜치의 무관한 미커밋 변경(주의 — NOTAM 아님)

세션 초반 사용자 요청으로 만든 두 변경이 아직 커밋 안 됨(working tree에 있음, feat/notam-backend 위):
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` — 카테고리 순서 항공로→항행시설→공역으로 재배열
- `frontend/src/features/map/MapView.jsx` — 레이더 기본 ON(`visibility.radar = true`)
→ 이건 NOTAM과 무관. 새 세션에서 별도 커밋하거나 별도 브랜치로 옮길지 사용자에게 확인. NOTAM 커밋에 섞지 말 것.

## Phase B / C (아직 계획 미작성)

- Phase A(`/api/notam`) 완료 후 작성 예정. B=프론트 UI(전역패널·공항탭·지도레이어·시간상태 색/형태·감사반영 접근성),
  C=브리핑 연동(matchItems 매칭코어·routeConflicts·배너). A의 item shape 계약은 plan "Global Constraints"에 고정됨.
