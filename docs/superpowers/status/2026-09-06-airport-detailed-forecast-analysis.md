# 공항 상세 예보 분석 — 구현 상태

승인 스펙: `docs/superpowers/specs/2026-09-06-airport-multi-model-comparison-design.md`
승인 계획: `docs/superpowers/plans/2026-09-06-airport-detailed-forecast-analysis.md`

## 작업 기록

- 2026-09-06: 구현 시작. 기존 미커밋 스펙·계획·research 문서와 collector observability 보고서를 보존한다.
- 작업 위치는 사용자 지정 `/home/john_doe/ProjectAMO`, 브랜치는 `feat/airport-detailed-forecast-analysis`. 커밋·푸시·배포 금지.
- Graphify로 KIM 수집·저장소·활성 뷰 연결을 확인했다. Graphify skill/package 버전 차이 경고는 있으나 query는 정상 실행됐다.
- Task 1/2: 메인 구현·검증 완료. 모델 세 담당 병렬 구현 시작.

## 소유권

| 범위 | 담당 | 상태 |
| --- | --- | --- |
| Task 1/2 공통 계약·저장소 | 메인 | 집중 테스트 통과 |
| Task 3 KIM | kim 에이전트 → 메인 확인 | 구현 완료, KIM 집중 67/67 통과 |
| Task 4 EC·ICON | open_meteo 에이전트 | 구현·리뷰 수정·실자료 확인 완료 |
| Task 4 GFS | gfs 에이전트 → 메인 확인 | 구현·중복 APCP 실자료 수정·독립 판독 대조 완료 |
| Task 5 API·관측 / Task 6 공통 일정 | 메인 | 실제 Express API 포함 집중 테스트 통과 |
| Task 6 관리자·snapshot | operations 에이전트 | 관리자 계약 및 실제 HTTP live/demo 전환 통과 |
| Task 7/8 화면 | frontend 에이전트 | 구현·목업 대조·세 viewport 검증 통과 |
| Task 9 통합·실자료·브라우저 | 메인 (실자료 script·manifest·운영문서 operations 소유) | 완료 — 실자료·HTTP 전환·브라우저·캡처 메인 확인 |

## 검증 증거

- Task 1/2: `node --test backend/test/airport-model-comparison-model.test.js backend/test/airport-model-comparison-store.test.js` — 11/11 통과. 최초 구현 부재 RED 확인 후 GREEN. EC 구간 이동·운고 경계·정확한 13시각·부분 발행 실패·다중 공항 포인터·재읽기·보호 보존·손상 격리 검증.
- 테스트 fixture helper는 `backend/test/fixtures/airport-model-comparison/records.js`이며 synthetic으로 명시했다.

## 인계 계약

- 공통 레코드·구간·발행 인터페이스는 계획 Task 1/2를 따른다.
- API는 Task 5.8 wrapper: `{ airport, effective_now, revision, models, observations: { metar: [], taf: null, amos: [] }, status, issues }`.
- 공유 파일 변경은 메인만 수행한다. 같은 파일 동시 편집 금지.

- 메인 목업 브라우저 확인: `artifacts/airport-comparison-mockup-desktop-{all,wind,temp-rh}.png`. 화면 담당도 직접 HTML/브라우저 확인했다.
- 기반 리뷰 6건 확인: 손상 payload 동일 revision 재발행, pointer 시각 검증, 손상만 있는 상태의 partial 표시, 결측 사유 enum, Open-Meteo 공항 연결·ICON 보완 검증. 메인/모델 담당으로 파일을 나눠 수정 완료했다. 저장소 복구 RED 재현 후 저장소/API 12/12 GREEN.

## 메인 통합 검증

- 기반 리뷰 6건과 통합 리뷰 후속 결함 수정: 최초 Open-Meteo 수집, 보고서/저장 후조건, KIM sentinel, GFS 도메인 경계·APCP 중복, 저장소 동일 revision 복구·불변자료 재선택을 회귀 시험했다.
- 백엔드 집중·관련 회귀 185/185 통과: `artifacts/airport-comparison-backend-final.log`. KIM 부분 실패 통계·보존과 실제 HTTP snapshot 활성화→live 복귀까지 포함한다.
- 실제 인천 KIM: `artifacts/airport-model-comparison/live-kim-rksi-20260906/report.json`, 06Z F000~F012 13개, 요청1103회, 누락0.
- 실제 인천 GFS/ICON/EC: `artifacts/airport-model-comparison/live-rksi-final-20260906/report.json`, 각06Z 13개.
- 실제 울산 네 모델: `artifacts/airport-model-comparison/live-rkpu-final-20260906/report.json`, 각06Z 13개, KIM/GFS/ICON F000~F012. 실제 현재 EC도06Z여서 이동량0. EC 구간 이동은 실제00Z raw fixture F006~F018 + 저장소/수명주기 시험으로 별도 검증했다.
- 실제 EC 두 공항의 F001/F002 `wind_gust_kt`는 제공자 결측이다. `providerNull`로 구별하며 0으로 대체하지 않는다.
- 독립 ecCodes2.48.0 대조: GFS13파일267메시지, 두 공항534필드값, 오차0. `artifacts/airport-model-comparison/live-rksi-final-20260906/eccodes-comparison.json`.
- 첫 브라우저: 40통과/5실패 (새 기능18/18통과). 관리자 fixture초기history·중복selector 수정. 캡처에서 발견한 root스크롤잘림·iPad배치·참조카드아이콘 수정.
- 두 번째 브라우저: 44통과/1flaky(관리자 polling route teardown). async route완료 대기 수정 후 전체 계약 45/45 통과 (`artifacts/airport-comparison-browser-verified.log`).

- 최종 프런트엔드 집중 10/10 통과, production build 성공 (`artifacts/airport-comparison-frontend-final.log`, `artifacts/airport-comparison-build-final.log`). 기존 대용량 bundle 경고는 남지만 빌드 오류는 없다.
- Fixture manifest 9/9 SHA256 일치. 신규 GFS06Z F001 실원문은 중복 APCP 회귀 근거다.
- 최종 캡처는 `artifacts/responsive-screenshots/airport-model-comparison/20260906-verified/`; 상단/표와 각 그래프를 별도 viewport 캡처하여 내부 스크롤에 가려진 blank 이미지를 완료 증거로 쓰지 않는다.

## 1차 통합 결과

아래는 1차 통합 검증 기록이다. 2026-09-07 수용 기준 재대조에서 화면 상세 누락을 찾아 보완했다. 최종 완료 여부는 아래 재대조·완료 기록을 따른다.

- 승인 Task1~9 구현·집중시험·실자료·브라우저 검증 완료. 메인이 에이전트 보고와 별개로 최종 명령, 실제 report, ecCodes 수치, 캡처를 확인했다.
- 백엔드185/185, 프런트엔드10/10, production build 성공. 관리자·공항 패널·분석 화면 전체 Playwright45/45 통과. 표식 CSS 보완 후 분석 화면18/18 추가 통과 (`artifacts/airport-comparison-browser-display-final.log`).
- 캡처51개와 manifest, console JSON, 목업 대조 review/issues.md를 최종 캡처 디렉터리에 보관한다. 새 기능 pageerror0; 503은 갱신실패 fixture의 의도된 응답이고 401은 미로그인 shell 확인이다.
- 실제 데이터: RKSI/RKPU 각각4모델×13시각. GFS13파일의 두 공항534필드값을 독립 ecCodes와 대조해 오차0. 제공자 EC F001/F002 돌풍은 null을 그대로 유지한다.
- 실제 HTTP `/api/airport/RKPU/model-comparison`으로 snapshot저장→demo활성화→live수집→live복귀를 검증했다. demo값23°C 유지, live복귀35°C, view revision과 demo기준시각 확인.
- Graphify update 완료, diff-check 통과, fixture SHA2569/9. Graphify의 SQL parser 미설치/비코드파일 노드없음 경고는 기존 도구환경 제한이며 update실패는 아니다.
- 순위·자동 변화 판단·위험 임계값 강조·실제 일기도는 승인된 후속 과제로 남겼다. 운고 추정의 관측 대비 정확도 평가는 이번 데이터 접근/변환 검증과 구별한다.
- 기존 미커밋 문서/사용자 변경 보존. 커밋·푸시·배포 없음. 자동 검증 서버 종료.

## 수용 기준 재대조 — 2026-09-07

- 메인이 승인 스펙의 모든 수용 기준과 계획 7/8의 상세 항목을 현재 코드에 다시 대조했다. 기존 테스트 통과만으로는 운고 근거 hover, 기온/RH 세로 분리, 패널 대상 시각, 같은 시간 복수 METAR 표시를 증명하지 못했다.
- 소유권: detail_audit 담당은 뷰모델·표·그래프·상세 formatter·관련 단위 시험, 메인은 페이지·요약·CSS·브라우저 계약·검증·status. 같은 파일을 동시에 편집하지 않는다.
- 보완: 그래프에서 같은 유효시각 모델별 상세와 원/보간·운고 입력 근거, 표의 근거 상세, 복수 METAR 원시각, 기온/RH 위아래 배치, 패널 요약 대상 시각, 초기 선택 시각의 갱신 시 보존.
- 세로 분리 회귀 계약의 수정 전 실패 확인: `artifacts/airport-comparison-audit-red.log` (desktop, 기온 그래프 영역 부재).
- 실제 데이터·backend는 이번 화면 보완으로 변경되지 않았다. 기존 실제 보고서의 성공 여부·13시각·실제 run과 독립 ecCodes 결과를 재확인한다. 추가 검증 결과를 이어 기록한다.

### 수용 기준별 근거

| 승인 기준 | 코드·검증 근거 |
| --- | --- |
| 0, 0-1 진입·패널 정시 요약 | AirportPanel AMOS 다음 section, Summary의 대상 시각, Page query; VM 정시 경계 시험 및 panel entry 브라우저 계약 |
| 1, 2 모델·공통 유효시각·실제 F-hour | shared allowlist, model/selectForecastWindow, VM 정확 시각 lookup, 표 title·그래프 detail; 모델/API/화면 계약 |
| 2-1 EC 이동 | Open-Meteo 실행 고정 요청, store 구간 불변 payload, lifecycle peer 갱신 후 재평가; 실제 EC00Z raw fixture F006~F018 및 브라우저 F018 |
| 3 모든 시각·격자 추적 | 공통 validator·store pointer validation, VM detail·공통 evidence formatter; model/store/상세 근거 시험 |
| 3-1 METAR/TAF 현상·AMOS mm | service 관측 adapter와 RN 정시 차분, VM 강수 행 순서/정량선 제외, TAF 기온RH 행 제외; API·VM·브라우저 계약 |
| 4, 4-1, 4-2 동일 값·결측·기온RH | 같은 vm을 Summary/Table/Chart에 전달, null 경로 단절, 두 단위 세로 분리, 범위 밖/미검출/입력 결측 구분; VM·상세 시험 및 브라우저 계약 |
| 5, 5-1 운고 방식·근거 | model/estimateCeiling 임계 경계 시험, KIM 응결물 조건, GFS 원 진단; 상세에서 실제 압력면·AGL·운량·tqc/tqi 표시 |
| 5-2, 5-3 EC·층별 운량 | Open-Meteo 실행 고정·파생 provenance, EC 운고 포함, NWP % 유지; parser fixture·실자료 보고 및 상세 근거 |
| 6 실제 F000 결측 | normalize/validator structural_f000, EC 실제 F006 값 유지; 모델별 수집 시험 및 EC F018·부분자료 화면 |
| 7 고정 순서·후속 제외 | VM MODEL_ORDER·Summary, 순위/자동판단 없는 화면; 브라우저 제외 범위 assertion |
| 8 성공 보존 | 원자적 store publish·손상 복구·부분 보고·지난 성공 pointer 보호; store/lifecycle 실패·재시도 시험 |
| 8-1 관리자 상태 | data-health run/available/collected·공항 수·실패·다음 점검; backend health + 실제 admin detail 브라우저 계약 |
| 8-2, 8-3 외부 호출·OFF | operation registry 여섯 endpoint, collector registry·startup/cron/후속 guard; operation/scheduler/lifecycle 시험 |
| 8-4 보존 | latest 포인터 보호·실행4/raw2·구간 revision 정리; store/lifecycle 보존 시험 |
| 9 임시 일기도 | Page 정적 SVG 두 장과 연결되지 않음 문구; 브라우저 complementary 영역 assertion |
| 본문 demo·관측 이력·모드 | 실제 HTTP snapshot/live 왕복, METAR 원시각 복수 보고·미래 제외, 전체/요소 모드 선택 유지; API·VM·브라우저 시험 |

- 실자료 재대조와 fixture 해시 9/9는 `artifacts/airport-comparison-completion-audit.json`에 저장했다. 검증일이 달라져도 실제 수집 보고서의 원래 2026-09-06 실행시각을 유지했다.
- 상세 담당의 도구 실행이 모델 용량 오류로 중단되어, 메인이 남은 변경을 인수하고 코드·단위 시험·실제 브라우저를 직접 확인했다. 완료 보고만으로 승인하지 않았다.
- 프런트엔드 집중 14/14 및 production build 통과. 첫 감사 브라우저 실패는 분리된 두 그래프의 중복 상세 선택자와 동일 좌표 표식의 클릭 충돌이었다. 상세 영역을 scope로 구분하고 가려진 표식은 키보드 선택으로 검증했다. 이후 전체 관련 계약 51/51 통과 (`artifacts/airport-comparison-browser-final-20260907.log`).
- 캡처에서 추가 확인한 TAF 기간 문자열의 셀 넘침은 접는 기간 상세로 이동했다. 기온 그래프의 불필요한 RH 보조선을 제거하고 표·그래프를 같은 가로 스크롤과 시간 열 중심으로 맞췄다. 마지막 분석 화면 계약에는 표 열/그래프 점 중심 오차 3px 미만 assertion을 포함한다.

- 마지막 경계 검사: Open-Meteo 층별 운량 null/문자열이 나눗셈에서 0 또는 숫자로 변환되던 결함을 RED 재현 후 수정했다. 실제 숫자만 운량 비율로 변환하며, 결측은 운고 missing_input으로 유지한다. `artifacts/airport-comparison-cloud-null-red.log` → `artifacts/airport-comparison-backend-audit-final.log` 186/186 GREEN.
- 모바일의 공통 가로 스크롤을 끝 시각으로 이동해도 범례·상세 근거는 화면 폭 안에 남도록 보완했다. 상세 bounding box와 실제 압력면 문구 캡처를 브라우저 계약에 추가했다.

## 완료 — 2026-09-07 최종 확인

- 승인 Task 1~9 완료. 메인이 수용 기준별 현재 코드와 산출물, 실제 데이터를 직접 확인했고 발견한 누락·결함을 보완했다.
- 백엔드 집중·관련 회귀 **186/186**, 프런트엔드 **14/14**, production build 성공. 로그: artifacts/airport-comparison-backend-audit-final.log, airport-comparison-frontend-audit.log, airport-comparison-build-audit.log.
- 관리자·공항 패널·분석 화면 **51/51**, 마지막 표시 보완 후 분석 화면 **24/24** 통과. 최종 로그: artifacts/airport-comparison-browser-readable-final.log.
- 최종 캡처 75개, manifest, console.json, 목업 대조 review/issues.md: artifacts/responsive-screenshots/airport-model-comparison/20260907-final/. 세 viewport의 상세 가독성·열 정렬·선 단절과 pageerror 0을 확인했다.
- 실제 RKSI/RKPU 각 4모델×13시각, EC F001/F002 돌풍만 제공자 결측으로 유지. 실제 같은 run에서 EC 이동량0이며 실제00Z raw fixture/수명주기/브라우저로 F006~F018 이동을 별도 검증했다. GFS 독립 ecCodes 534값 오차0.
- 미해결 구현 문제 없음. 순위·자동 변화·위험 강조·실제 일기도·운고 정확도 평가는 승인된 후속 범위다.
- Graphify update와 diff-check 완료. 기존 사용자 변경·미커밋 문서 보존. 커밋·푸시·배포 없음. 검증 서버 종료(3001/5173 free).

## 사용자 수동 확인 서버

- 2026-09-07 사용자 확인 요청에 따라 127.0.0.1:5173/3001 개발 서버를 실행해 유지한다. DATA_PATH는 artifacts/airport-model-comparison/manual-review-data, 자동 수집은 비활성이다. 기존 backend/data는 변경하지 않았다.
- 인천·울산 실제 2026-09-06 06Z 각4모델×13시각을 별도 snapshot으로 발행했다. 확인용 기준시각은 2026-09-06T08:20Z로 고정했다. 모형 값은 실자료이며 과거 시점의 가용성 재현은 아니다. 관측 자료는 이 확인용 root에 별도로 복제하지 않았다.
- 실제 API RKPU ready/4모델/각13 records와 실제 브라우저의 울산 분석 화면·기온RH 표 렌더를 확인했다. 캡처: artifacts/airport-model-comparison/manual-review-ready.png.

## 사용자 피드백 반영 — 상세 근거 제거·TAF/METAR 연결

- 2026-09-07 사용자 승인으로 셀의 상세 근거와 그래프의 긴 산출 근거 펼침을 제거했다. 실행시각/F-hour와 선택 시각 모델값 비교는 유지하며, 압력면·원변수 근거는 정규화 데이터에 보존한다. 운고 방식은 각 모델 행 머리글에 한 번만 표시한다. 이는 기존 스펙의 상세 근거 표시 요구에 대한 최신 사용자 변경이다.
- 이전 검증에서 표 셀의 상세 근거 펼침을 누락했다. 실제 KIM 셀을 눌러 72px 폭에 1,280자가 들어가 행 높이가 133→2,693px로 늘어나는 결함을 확인했다. 제거 후 실제 수집자료 화면에서 해당 KIM 바람 행 200px 미만과 근거 버튼 부재를 확인했다.
- TAF가 없으면 행을 숨기던 조건도 수정했다. 바람·강수 현상·운고 표는 TAF 행을 유지하며 자료 없음으로 표시한다. 기온/RH에는 TAF가 없고, 강수 mm 누적 그래프에 현상을 수치로 넣지 않는다.
- 검증: 프런트엔드14/14, build 성공, 관리되는 Playwright24/24. logs: artifacts/airport-comparison-simplify-{unit,build,browser}.log. RED 증거는 simplify-red.log와 taf-empty-red.log. Graphify update와 diff-check도 수행했다.
- 사용자의 TAF/METAR 일회 호출 요청: 기존 프로덕션 API client·parser·processor로 인천/울산 각각1회씩, 총4 HTTP 호출 성공, 재시도0. 원본 발표·관측시각을 유지했다. TAF 발표 2026-09-06T11:00Z/유효12:00Z~2026-09-07T18:00Z. METAR는 RKSI15:30Z, RKPU15:00Z. report: artifacts/airport-model-comparison/manual-taf-metar-fetch.json.
- 새 관측과 TAF는 격리된 확인용 snapshot에 연결하고 기준시각을 실제 수집 완료 시점 2026-09-06T15:37:20.068Z로 갱신했다. 기존 backend/data는 변경하지 않았다. 수동 확인용 localhost:5173 서버를 다시 켜 두었다.
- 실제 API·브라우저에서 두 공항 TAF/METAR 존재, 울산 TAF 바람 숫자와 그래프 점, 상세 근거 부재, 운고 방식1회 표시를 확인했다. 증거: artifacts/airport-model-comparison/manual-simplified-verified.json 및 manual-taf-metar-visible.png, manual-method-labels-visible.png.

## 사용자 피드백 반영 — 셀 펼치기·호버 툴팁·그래프 클릭 제거

- 담당: 메인이 표·그래프·뷰모델 표시 어댑터와 브라우저 계약을 단독 수정했다. 기존 사용자 변경 두 파일은 보존한다.
- 운고 셀은 기본 운고만 표시하며 값을 누르면 전/저/중/상 운량이 펼쳐진다. 기온/RH 셀은 두 값만 표시하며 누르면 이슬점·기압이 펼쳐진다. 별도 보조 정보 문구와 기본 펼침 표시는 제거했다. 네이티브 summary와 44px 클릭 영역을 사용한다.
- 목업 HTML의 tooltip/nearestIndex를 다시 대조했다. 그래프 아래 고정 상세 글은 호버 툴팁으로 교체했다. 같은 유효시각의 모델·TAF·관측값, 실제 Run/F-hour와 시간 처리 정보를 비교하며 화면 밖으로 잘리지 않게 배치한다. 운고 산출 방식은 표의 모델명 아래 1회 표시를 유지한다.
- 최신 사용자 지시가 이전 그래프 점 선택/고정 요구를 대체한다. 그래프의 클릭·탭·Enter 시각 선택과 상세 고정 동작을 전부 제거했다. 호버 또는 키보드 포커스만 값을 보여준다. 그래프 클릭으로 URL·선택시각·표 열 수·SVG viewBox·크기가 변하지 않는 계약을 추가했다. 표 시간 머리글의 기존 선택 기능은 유지한다.
- 원인: 그래프 클릭이 선택시각을 바꾸고, 그 선택시각이 표시 구간 시작 계산에도 들어가 앞쪽 열이 사라졌다. SVG 가로세로 비율도 바뀌어 그래프 확대처럼 보였다. 클릭 이벤트 자체를 제거해 해당 경로를 없앴다. RED: artifacts/airport-comparison-click-red.log.
- 검증 중 키보드 포커스 직후 발생하는 브라우저 자동 스크롤이 툴팁을 닫는 문제를 이벤트 기록으로 확인하고, 포커스된 점에 위치를 계속 맞추도록 수정했다. events: artifacts/airport-comparison-tooltip-events.json. 터치 뷰포트의 Escape 후 동일 요소 재포커스 시험은 실제 포커스 이동을 포함하도록 고쳤다.
- 커밋 전 전체 npm test: 백엔드 1,092 통과/1,093 중 레이더 H5 fixture 부재 1건 skip, 프런트엔드 1,466/1,466 통과. production build 성공. logs: artifacts/airport-comparison-precommit-tests.log, airport-comparison-hover-only-build.log.
- 사용자가 마무리 후 커밋·푸시를 새로 승인했다. 현재 feat/airport-detailed-forecast-analysis 브랜치를 유지하며 검증 완료 후 이번 기능의 코드·시험·승인 문서를 함께 커밋한다. 배포는 요청되지 않았다.
- 최종 관리형 Playwright **33/33 통과**, 재시도0, desktop/iPad landscape/mobile 전체 완료. log: artifacts/airport-comparison-hover-only-browser.log. 캡처: artifacts/responsive-screenshots/airport-model-comparison/20260907-hover-only/.
- 메인이 실제 RKPU 자료 화면을 desktop/mobile로 직접 대조했다. 클릭 전후 9개 시간 열과 SVG viewBox, URL이 동일하며 그래프 높이는 각각 344.703125px/250px로 유지됐다. METAR·TAF·4모델의 같은 시각 값 툴팁, 운량/기온 보조값 열기·닫기, pageerror 0을 확인했다. report: artifacts/airport-model-comparison/manual-hover-only-verified.json. 실제 캡처: manual-{desktop,mobile}-{graph-static,graph-hover,cloud-expanded,temperature-expanded}.png.
- 현재 미해결 구현 문제 없음. 수동 확인용 localhost:5173 서버는 실제 자료 snapshot으로 다시 켜 두었다. 원자료 수집을 추가 실행하거나 기존 backend/data를 교체하지 않았다.
