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

## 사용자 피드백 반영 — 해외 NWP 정기 수집 시간대 조정

- 담당: 메인. 사용자가 KIM 수집 방식과 비교한 변경안을 승인하여 해외 3모델의 10분 상시 점검을 폐지했다. 최신 지시가 승인 계획의 10분 cron 요구를 대체한다.
- 00Z 실행 기준 ICON 04:40/05:40/06:40, GFS 06:10/07:10/08:10, EC 07:40/08:40/09:40 UTC에 시도한다. 06/12/18Z에도 같은 지연을 적용하며 자정 재시도를 포함해 모델별 하루 12개 정기 슬롯이다. 완전한 실행/구간이면 기존 due 검사로 외부 호출을 생략한다.
- 세 번째 정기 시도가 실패하면 마지막 성공 자료를 유지하고 다음 실행의 첫 슬롯에서 확인한다. 서버 시작 복구·관리자 수동 호출·peer 변경에 따른 EC 구간 재평가는 유지한다. EC/ICON 실제 가용시각 이후 10분 대기는 제공자 복제 지연 검사이며 정기 재시도 간격과 별개다. KIM 스케줄은 변경하지 않았다.
- last-attempt의 next_check_at는 수집 종료 후 실제 cron의 다음 슬롯으로 기록한다. 관리자 nextCheckAt는 현재 스케줄에서 계산해 과거 파일의 10분 시각을 재사용하지 않는다. 기존 KIM 행 처리와 OFF의 다음 점검 없음은 보존한다.
- 관리자 캡처에서 12개 시각이 API별로 반복되어 행이 길어지는 문제를 발견했다. 주기는 '실행별 1시간 간격 · 3회'로 요약하고 실제 cron 및 다음 UTC 시각은 API에 보존했다. 세 viewport에서 모델 행 400px 미만을 검증했다.
- RED: artifacts/airport-nwp-schedule-red.log, airport-nwp-schedule-label-red.log. 전체 npm test: 백엔드 1,095 통과/1개 기존 레이더 fixture 부재 skip, 프런트엔드 1,466 통과. log: artifacts/airport-nwp-schedule-tests.log.
- 관리형 Playwright 모델 상세·실제 관리자 API 연결 검증 6/6 통과, 재시도0, desktop/iPad landscape/mobile. UTC 스케줄 계산과 관리자 기존 KST 표시를 직접 대조했다. log: artifacts/airport-nwp-schedule-browser.log. 첫 실패는 중복 내비게이션 선택자, 다음 실패는 UTC 전환 UI가 없는 관리자에 UTC 표시를 기대한 시험 가정이었다. 내비게이션 역할로 범위를 한정하고 실제 화면 계약에 맞췄다.
- 캡처와 검토 기록: artifacts/responsive-screenshots/airport-model-comparison/20260907-nwp-schedule/. Graphify update 및 diff-check 수행. 운영 배포는 하지 않았다.

## 사용자 피드백 반영 — 데스크톱 모델 비교 화면 감사 보완

- 담당: 메인. 데스크톱 화면만 대상으로 감사 지적 1~6을 반영했다. 모바일 동작·배치는 이번 변경 범위에서 재검토하지 않았다.
- 강수 축은 최대값이 1 mm 미만일 때 두 자리 소수로 표시해 0.13 mm와 0.00 mm를 구분한다. 운고 그래프는 10,000 ft로 표시 상한을 고정하고 초과 원값은 삼각 표식·툴팁 접근성 이름에 보존한다.
- 운고/운량의 전·저·중·상층 운량 보조선·보조축·툴팁 나열을 제거했다. 표의 운고 셀을 펼칠 때만 해당 정보가 보이며, 운고 그래프는 운고만 비교한다.
- 자료 기준시각 칩은 가용시각이 없을 때 `이용시각 미기록`으로 표기한다. 결측 텍스트의 대비를 올렸고, 차트는 하나의 키보드 탭 정지점에서 화살표/Home/End로 시각을 이동한다. 클릭은 계속 어떤 상태도 바꾸지 않는다.
- 참고 패널은 프로젝트 실제 파일인 `briefing-charts/kim_gdps_erly_city_47163_t072_2026070200.png`, `kim_gdps_skew_47163_s000_2026070200.png`, `surf_2026070112.png`를 각각 연직시계열·Skew-T·지상일기도 샘플로 표시한다. 현재 공항/실행자료와 연결되지 않았다는 문구와 원본 샘플 공항·시각을 함께 표시한다.
- 검증: 집중 Node 시험 14/14, production build 성공, 재사용 개발 서버의 데스크톱 Playwright 계약 11/11 통과(재시도 0), axe WCAG 2A/2AA 위반 0. 실제 RKPU 화면 캡처: `artifacts/airport-model-comparison/audit-fix-desktop-top.png`, `audit-fix-desktop-charts-main-scroll.png`, `audit-fix-desktop-ceiling-final.png`. 마지막 캡처에서 0.13 mm 축, 10,000 ft 상한 삼각 표식, 실제 세 참고 이미지, 운량 보조선 제거를 직접 대조했다.

## 사용자 피드백 반영 — 관측 예정·NSC·무현상 그래프

- 담당: 메인. 미래 METAR와 AMOS의 미발생 시각은 `자료 없음`과 구분해 짙은 회색 `관측 전` 셀로 표시하고, 차트 점에서는 제외했다. 과거 시각의 실제 결측과 모델 입력 결측은 기존대로 각각 `자료 없음`·`입력자료 없음`으로 남긴다.
- 사용자의 최신 지시에 따라 5,000 ft 이하에 운고가 없는 모든 상태(`not_detected_below_limit`, `no_ceiling`)와 METAR/TAF의 운고 미검출을 `NSC`로 통일했다. NSC 셀은 비어 있는 운량 상세를 열지 않으며, 운량 계층값이 실제로 있을 때만 셀 펼치기를 제공한다.
- 표시 구간 전체의 유효 강수 수치가 모두 0 mm이면 강수 그래프를 비우고 `강수량 없음`을 표시한다. 모든 해결된 운고가 NSC이면 운고 그래프를 비우고 `구름 없음`을 표시한다. 모델 입력 결측이나 예보 범위 밖이 하나라도 있으면 이 무현상 상태로 축약하지 않는다.
- 검증: 집중 Node 시험 15/15 통과, Vite production build 성공, Playwright 신규 계약 desktop/iPad landscape/mobile 6/6 통과(재시도 0). 데스크톱 재검증과 실제 캡처는 `frontend/artifacts/verification/airport-model-comparison-nsc-3/desktop-{nsc-observation-pending,empty-precipitation-ceiling-ceiling-chart-0}.png`에 보존했다. `git diff --check` 및 Graphify update 수행.

## 사용자 피드백 반영 — 그래프 요소 토글·목업 연직 패널 복원

- 담당: 메인. 그래프 범례의 각 출처를 접근 가능한 토글 버튼으로 바꿨다. 토글은 해당 그래프의 선·점·호버 툴팁만 숨기며, 비교표와 선택 유효시각은 바꾸지 않는다. 전부 끄면 `표시할 요소 없음`을 보인다.
- 지상일기도 카드를 제거했다. 목업 HTML을 브라우저로 직접 대조해, 연직시계열·단열선도 두 카드만 남기고 1600px 이상에서 440px 우측 고정 패널, 그 미만에서 하단 패널이라는 목업 배치를 적용했다.
- 단열선도에는 이전/다음과 범위 슬라이더를 복원했다. 모두 공통 선택 유효시각을 바꾸며, 확대 대화상자에서도 같은 슬라이더 상태를 유지한다. 현재 이미지는 목업과 같이 임시 KIM 샘플이고 캡션은 공항·KIM F-hour·선택 시각을 표시한다.
- 검증: 새 Playwright 계약 desktop/iPad landscape/mobile 6/6 통과, 데스크톱 캡처 `frontend/artifacts/verification/model-comparison-controls/desktop-{legend-toggles,kim-reference-slider}.png`, 집중 Node 15/15, production build와 diff-check 통과.

## 2026-09-08 — 승인 HTML의 요소별 그래프 적용

- 담당: 메인. 사용자가 `artifacts/airport-comparison-recommended.html`의 추천안과 이후 누적 강수·운고 계단선 변경을 승인했다. 실제 React 화면에 적용하며 비교표·공통 시간축·선택 URL·연직 참고 패널의 계약을 유지한다.
- 바람: 공통 0 기준 눈금, 풍속 실선·돌풍 점선, 작은 표식, 돌풍 토글. 강수: 모델별 누적 막대. 운고: 계단형 선 및 독립 NSC 표식, 결측 연결 금지. 기온: 점과 연결선. RH: 공통 0–100% 색상 띠와 수치.
- 누적 강수는 화면 구간과 제공된 NWP 구간들의 공통 시작 경계를 사용한다. EC의 실제 Run/F-hour를 바꾸지 않고 동일 경계 이후 시간당 자료만 더한다. 시작값 0은 기준점이며 F000의 직전 시간 강수를 가정하지 않는다. 중간 결측 후에는 합산을 중단하고, 공통 시작 전에 끝난 오래된 모델에는 0을 만들지 않는다. 누적 시작 시각을 KST/UTC 선택에 맞게 표시하며 표에는 시간당 값을 보존한다.
- METAR·TAF의 강수현상은 별도 띠와 툴팁으로 표시하고 mm로 변환하지 않는다. 실제/조건부 강수현상이 있으면 수치예보가 0이어도 무강수 빈 상태로 덮지 않는다. F000의 구조적 결측은 무강수 판정의 누적 시작 경계 밖으로 처리한다.
- 운고는 5,000 ft 기본 축으로 표시하고 더 높은 수치가 있으면 기존 10,000 ft 상한과 넘침 표식을 사용한다. 그래프의 숫자·선·막대·색상 띠는 표의 시간 열과 같은 가로 좌표를 사용한다. 그래프 클릭은 선택·크기·시간 열을 바꾸지 않는다.
- 검증 자료: `frontend/verification/model-comparison-fixture.mjs`의 실제 RKPU 09Z 파생값과 명시적인 가상 시계열. 새 디자인 계약에는 모델별 강수 시점·양, 급격한 풍속 변화와 67 kt 돌풍, 서로 다른 운고/기온/RH를 넣었다. 1920×1080 캡처를 승인 HTML과 직접 비교했다. 로컬 저장자료 API는 HTTP 200 / empty / models=[]이므로 최신 실시간 모델을 통한 검증은 하지 못했다. 운영 서버는 변경하지 않았다.
- 최종 검증: 집중 Node 21/21, 전체 프런트엔드 1475/1475, production build 성공(기존 번들 크기 경고), `git diff --check` 통과. 관리형 Playwright 48/48 통과(재시도 0, desktop/iPad landscape/mobile, 종료 코드 0). 데스크톱 디자인 계약은 1920×1080으로 검증했으며 실제 캡처를 직접 확인했다. Graphify update 완료.
- 재현: `npm --prefix frontend test`, `npm --prefix frontend run build`, `PROJECTAMO_COMPARISON_CAPTURE_DIR=/home/john_doe/ProjectAMO/artifacts/verification/approved-chart-design npm --prefix frontend run dev:contract -- --grep airport-model-comparison --retries=0 --max-failures=1`. 로그·검증 명세·각 요소 캡처는 `artifacts/verification/approved-chart-design/`에 보존했다. 현재 요청의 변경은 커밋·푸시·배포하지 않았다.
- 검증 중 Vite가 `react-dom_client.js`와 `@fluentui_react-components.js`에 `504 Outdated Optimize Dep`를 반환해 화면 진입 전 타임아웃이 발생했다. 브라우저 요청 오류로 원인을 확인하고 해당 테스트 실행을 중단한 뒤, 관리형 서버 종료와 포트 해제를 확인했다. 빌드와 브라우저 실행을 분리하여 다시 검증했다. 앱 코드에 우회 로직을 추가하지 않았다.

### 커밋·푸시·운영 배포 완료

- 후속 사용자 요청 `커밋 후 푸쉬 그리고 배포`에 따라 메인이 `97373807`을 main에 커밋·푸시했다. 커밋 직전 전체 프런트엔드 테스트 1475/1475 및 diff-check를 다시 통과했다.
- AWS `/opt/projectamo/current`에서 `bash deploy/deploy-vm.sh` 실행 성공. 기존 서버 `497802f7` 이후의 NSC·그래프 토글·연직 참고 패널 변경도 함께 반영했다. 의존성 변경 없음 확인, 기존 서버 설정 백업 파일 보존. 새 dist 빌드·교체, PM2 설정 적용·로그 회전, nginx 검증·reload 및 backend/site health 통과.
- 운영 `https://projectamo.co.kr/airport/RKSI/models`를 Playwright 1920×1080으로 직접 검증했다. 화면/API HTTP 200, 실제 저장된 KIM·ECMWF·GFS·ICON 4개 모델 ready(모두 2026-09-07 06Z Run), 브라우저 오류 0. 그래프 클릭 후 URL·크기 유지, 그래프만 모델 토글, 돌풍 토글, 누적 강수·계단 운고 표시, RH 수치 띠 확인. 현재 인천 운고는 전부 NSC여서 `구름 없음` 빈 상태를 확인했으며 수치 계단선·유강수 막대는 앞선 48개 계약의 가상 시계열 검증이 근거다.
- 배포 직후 서버 HEAD와 origin/main이 `97373807ce36adb3f0cce77e4714d9312cd4789e`로 일치했다. `/api/health` ok, `/api/snapshot-meta` HTTP 200, 공개 API `Cache-Control: no-store` 확인. 증거는 `artifacts/verification/approved-chart-design/{aws-deploy.log,production-smoke.log,production-smoke.json,production-*.png}`에 보존했다. 본 배포 기록은 별도 문서 커밋으로 동기화한다.

### 후속 수정 — 그래프 비율과 METAR 상대습도 겹침

- 담당: 메인. 운영 1920×1080 RKSI 화면에서 SVG 실폭 1138px / viewBox 폭 560, 가로 배율 2.03214·세로 배율 1을 확인했다. `preserveAspectRatio="none"`이 글자와 원형 점을 가로로 늘렸다. METAR 상대습도는 30분 간격에도 1시간 칸 너비를 사용해 겹쳤다.
- SVG 좌표를 실제 캔버스 폭으로 계산하고 화면 폭 변화를 ResizeObserver로 반영한다. 표 시간 열과의 정렬을 유지하면서 글자·원형 점은 CSS 픽셀 크기를 유지한다. 상대습도와 강수현상 띠는 인접 자료의 실제 시간 간격으로 너비를 제한한다.
- 6개 시간 열·30분 METAR 재현 계약을 추가했다. 수정 전 배율·점 비율·띠 겹침·리사이즈 검증 실패를 확인했고, 수정 후 desktop/iPad/mobile 3/3 통과했다. 데스크톱 1920→1440 리사이즈 후에도 배율 1:1, 원형 점, 표 열 중심 오차 1px 미만, METAR 띠 겹침 없음 확인. 캡처를 직접 확인했다.
- 전체 Node 1475/1475, production build, 관리형 Playwright 51/51(재시도 0, 종료 코드 0) 통과. Graphify update와 diff-check 완료. 자료와 캡처·재현 실패/성공 로그는 `artifacts/verification/chart-scale-fix/`에 보존한다.
- 현재시각+12시간 보장과 F012 수집의 차이를 설명한 뒤 사용자가 `그럼 그냥 놔둬 이거는`으로 기존 동작 유지를 지시했다. 수집 F-hour·저장 자료 계약·표시 시간축은 수정하지 않았다.
- `159fffdf` 커밋·main 푸시 후 AWS fast deploy 완료. 서버 HEAD/origin/main 일치, backend/site health 성공. 운영 RKSI 동일 URL을 Playwright로 다시 열어 SVG 실폭/viewBox 모두 1138px, 가로·세로 배율 1, 원형 점 7.5×7.5px, 실제 METAR 5개 칸 겹침 없음, 브라우저 오류 0을 확인했다. `artifacts/verification/chart-scale-fix/production-verification.json` 및 `production-desktop.png`에 수치와 직접 확인한 화면을 보존했다.

### 후속 수정 — 상대습도는 표와 같은 1시간 칸

- 담당: 메인. 사용자가 제시한 운영 RKNY URL에 Playwright로 접속해 09:12Z·09:17Z 관측의 칸 폭 약 10.84px보다 `100` 숫자 폭 18px가 커서 다시 겹치는 것을 확인했다. 앞선 수정은 30분 간격의 사각형 충돌만 검증해, 더 짧은 간격의 숫자 충돌을 놓쳤다.
- 최신 사용자 지시 `관측값은 1시간 고정만 사용해, 정시관측만`을 반영했다. 비교 화면의 모든 METAR 표·그래프와 자료 기준시각은 정시 관측만 사용한다. 상대습도는 시간별 표의 셀을 그대로 사용하며, 30분·비정기 관측으로 정시 결측을 대신 채우지 않는다. 없는 시간과 미래 시간은 빈칸이며 앞선 값을 복사하거나 보간하지 않는다. 호버에는 실제 관측 시각을 함께 표시한다. AMOS는 기존 정시 매칭을 유지하며, 예보 구간과 수집기는 유지한다.
- Node 회귀 검증은 한 시간의 여러 관측, 정시 없이 30분 관측만 있는 시간, 미래 자료 제외, 정시 값·원시각 보존 및 모든 METAR 요소의 정시 필터를 확인한다. 브라우저에는 운영 사례와 같은 5분 간격 자료를 넣되 비정기 값과 정시 값을 다르게 만들어, 정시 3개 값만 표현되고 세 자리 수가 칸 안에 들어가는지 확인한다. 증거 위치: `artifacts/verification/rkny-humidity-labels/`.
- 최종 검증: 전체 Node 1476/1476, production build, 관리형 Playwright 54/54(재시도 0, 종료 코드 0), diff-check·Graphify update 완료. 양양 저장 실자료에 적용한 결과는 07Z 73%, 08Z 78%, 09Z 100%, 이후 관측 전 빈칸이다. `on-hour-contracts.log`와 `real-data-hourly-result.json`에 근거를 보존했다.
- 배포 접속 문제: 공개 HTTPS 화면/API는 정상이나 `3.34.113.37:22` SSH 연결이 두 차례 시간 초과됐다. 사용자에게 SSH 허용 IP/접속 제한 변경 여부를 확인 요청했다. 이 변경의 운영 배포는 아직 수행하지 못했다.

### 후속 수정 — TAF는 요소별·시간별 값 하나

- 담당: 메인. 사용자가 `TAF 조건 기간`과 한 시간대의 이중 조건 표시를 원하지 않으며 바람·강수·운고 모두 같은 방식으로 적용하도록 지시했다. 배포는 명시적으로 보류했다.
- 표의 조건 기간 펼치기와 보조 조건 문구, 그래프 조건 삼각 표식·별표, 호버의 조건 중복 문구를 제거했다. 하나의 해석 결과를 표와 그래프가 공유한다. BECMG는 완료 시각, FM은 시작 시각부터 새 값을 적용한다. TEMPO 등 일시 조건은 해당 기간에 값 하나로 표시하고 기간 종료 후 지속 예보값으로 돌아간다. TEMPO 표시 선호를 질문했으며 별도 답변이 없는 경우의 적용 방식을 사용자에게 설명한 뒤 구현했다.
- BECMG·TEMPO·FM의 시작/종료 경계에서 바람·강수현상·운고가 동시에 단일 값으로 전환되는 회귀 테스트를 추가했다. 운영 양양 저장 자료로 바람 080° 8kt 유지, 10Z 이후 -RA·운고 500ft 전환 및 조건 문구 미생성을 확인했다. 증거는 `artifacts/verification/taf-single-value/`에 보존한다. 서버 배포는 수행하지 않는다.
- 최종 검증: 전체 Node 1477/1477, production build, 관리형 Playwright 57/57(재시도 0, 종료 코드 0) 통과. 데스크톱 실제 렌더링 캡처를 확인했고 diff-check·Graphify update를 완료했다. 현재 변경은 로컬 작업 상태로 보존하며 커밋·푸시·배포하지 않았다.

### 후속 수정 — Gust 표기

- 담당: 메인. 사용자 지시에 따라 풍속 셀·모델 요약·그래프 접근성 라벨·호버에서 돌풍값이 있을 때만 `Gust N kt`로 표시한다. 돌풍값이 없는 경우에는 보조 줄과 `돌풍 없음`·`돌풍 자료 없음` 문구를 표시하지 않는다. 그래프의 돌풍 점선 토글 이름은 유지했다.
- 테스트는 돌풍 부재 보조값 없음, 돌풍값 `Gust` 표기 및 상세 호버의 접근성 라벨을 확인한다. 이전 사용자 지시에 따라 커밋·푸시·배포는 수행하지 않는다.

### 상단 압축 시안 — 3줄 헤더 + 요약 1안

- 담당: 메인(HTML·브라우저 검증), 읽기 전용 리뷰어(요청안 대조). 사용자의 시각적 확인 요청에 따라 `artifacts/airport-comparison-compact-header.html`에 독립 시안을 만들었다. 제품 코드에 적용하거나 배포하지 않았다.
- 공항명·시간대, 선택 시각·보기 조작, 발표 정보의 3줄 헤더와 바람 범위·모델별 강수·운고의 가로 요약을 구성했다. 값은 사용자 스크린샷의 예시이며 실시간 연동하지 않는다.
- Playwright에서 1440·1920px 데스크톱 가로 넘침 없음, 시간대·보기 방식·Run 펼치기 동작과 페이지 오류 0건을 확인했다. 헤더 140px, 요약 약 137px. 캡처와 측정은 `artifacts/verification/compact-header/`에 저장했고 메인이 1600px 캡처를 직접 확인했다. Graphify update 완료.

### 상단 압축 적용 — 3줄 헤더 + 요약 1안 / 표 머리글 정리

- 사용자 승인에 따라 분석 화면을 공항명·시간대, 선택 시각·보기 방식·요소 탭, 자료 발표시각의 3줄로 압축했다. 동일 Run은 하나로 묶고 다른 Run은 모델별 실제 시각을 표시하며, 이용시각은 펼치기로 보존했다. 반복 상태·요약 시각은 제거했다.
- 바람 범위·Gust, 모델별 시간당 강수량·운고를 숫자 중심 3칸 요약으로 표시한다. 0·NSC·결측을 구분하는 구조화 데이터를 사용한다. 모든 비교 표의 눈에 보이는 `출처` 머리글을 지우고 보조기술용 열 이름은 보존했다.
- 담당: 메인(모든 코드·테스트·통합·시안 대조), 읽기 전용 리뷰어(승인안·회귀 점검). 기존 미커밋 변경을 보존하며 배포는 보류한다.
- 집중 Node 21/21, 전체 frontend Node 1479/1479, production build 통과. 새 데스크톱 계약에서 Run 통합/분리, 시간대·탭 전환, 1440·1920px 가로 넘침 없음과 요약 하단 340px 미만을 확인했다. 메인이 두 너비 캡처를 직접 확인했다. 저장된 양양 운영 API 자료로 시안과 동일한 값(풍속 8–16, Gust 17–20, 강수 2.7/0.9/1.8/0.0, 운고 NSC/2,379/949/906)도 확인했다.
- 분석 화면 적용 후 전체 비교 브라우저 회귀는 58개 통과, 데스크톱 전용 검사 2개 타 표면에서 제외했다. 읽기 전용 리뷰 지적에 따라 강수도 레코드 부재(`예보 범위 밖`)와 필드 결측(`자료 없음`)을 구분하도록 보완했다. `출처` 제거는 사용자 명시 요청이므로 유지한다.
- 추가 사용자 요청으로 공항 패널도 같은 숫자 중심 요약을 사용하도록 연결했다. 요약 폭은 패널 전체(열기 링크와 동일)로 채우고, 선택 시각은 한 번 표시한다. 패널 자체 너비에 따라 800px 이상 3칸, 560–799px 바람 전체 줄+강수·운고 2칸, 그 미만 세로 배치로 숫자 판독 폭을 확보한다. 추가 수정 후 전체 Node 1479/1479 및 production build 재통과.
- 공항 패널 후속 검증: 패널 진입·요약 폭·시각 연계·분석 화면 왕복, 압축 헤더, 부분/전체 결측 계약 10개 통과(데스크톱 전용 2개 타 표면 제외). 읽기 전용 재리뷰에서 차단 결함 없음. 메인이 패널 캡처를 다시 확인했으며, 요약과 열기 버튼이 모두 831px 너비이고 버튼 높이는 44px다. 처음 캡처의 하단 잘림은 스크롤 위치를 조정해 전체 버튼까지 재캡처했으며 해당 왕복 계약도 1/1 재통과했다.
- 증거: `artifacts/verification/compact-header-implemented/`의 페이지·패널 캡처, 실제 패널 치수, 저장 운영 자료 요약, 테스트/빌드 로그. 커밋·푸시·배포하지 않았다.

### 관리자 자료 수집 — API 요약과 높이 제한

- 사용자 승인에 따라 API 열을 결과 집계·가장 가까운 예정시각·상세 버튼으로 압축했다. 긴 마지막 오류는 한 줄 말줄임 후 클릭으로 전체 내용을 연다. 실행 상세 창은 API별 결과·소요·예정·오류를 보존하고 동일 호출 일정은 한 번만 표시한다. 실패·건너뜀·미실행·기록 없음은 각각 구분한다.
- API 열 240px를 확보하면서 열 합계를 기존 최소 표 폭 1040px에 맞췄다. 자료 목록은 최대 `min(640px,65dvh)`, 상세 본문은 `min(480px,60dvh)`까지 늘어나고 초과하면 각각 내부 세로 스크롤이 생긴다. 머리글은 고정하며 좁은 화면에서는 표 내부 가로 스크롤을 유지한다.
- 담당: 메인(구현·검증·캡처 확인), 읽기 전용 리뷰어(운영 상태 의미·접근성·레이아웃). 리뷰에서 지적한 실행 상태 구분과 메시지 없는 오류의 코드 대체 표시를 보완했다.
- 전체 Node 1480/1480 및 production build 통과. 관리자 전체 브라우저 계약 30/30 통과 후 열 폭과 상태 집계 보완에 대해 집중 계약 6/6 재통과. 18개 API·긴 오류로 행 높이 150px 미만, 데스크톱 가로 넘침 없음, 표/상세 내부 세로 스크롤, 마지막 API 접근, Esc 닫기·원래 버튼 포커스 복귀를 검증했다. 메인이 데스크톱 표와 상세 캡처를 직접 확인했다.
- 증거: `artifacts/verification/admin-api-compact/`. 기존 미커밋 작업 보존, 커밋·푸시·배포 보류 유지.

### KIM 참고 패널 통합과 인천 단열선도 샘플 추가

- 사용자 요청으로 오른쪽 참고 영역을 하나의 패널로 합치고 연직시계열/단열선도 탭으로 전환한다. 키보드 방향키·Home·End로 탭을 선택할 수 있고 확대 보기 동작은 유지한다.
- 제공된 인천공항 47113, 2026-09-07 12UTC 발표 F018~F054(3시간 간격) 원본 PNG 13개를 `frontend/public/briefing-charts/`에 추가했다. 원본은 변경하지 않았으며 파일 목록·크기·SHA-256을 검증 증거로 보관한다.
- 단열선도는 별도의 `샘플 시각` 슬라이더로 실제 파일과 유효시각을 함께 전환한다. 왼쪽 표의 선택 시각/URL은 건드리지 않는다고 사용자에게 설명했다. 기본 F018부터 표시하며 탭 왕복과 확대 창에서도 선택한 샘플을 유지한다. 공항명과 발표시각은 이미지 자체의 인천/무안 샘플 정보를 표시한다.
- 담당: 메인(원본 확인·구현·검증·캡처 대조), 읽기 전용 리뷰어(파일/시각 대응·접근성·비교 화면 영향). 새 `AtmosphericReference.jsx`가 참고 패널과 샘플 상태를 담당한다.
- 전체 Node 1480/1480, production build 통과. 집중 데스크톱 계약에서 13개 이미지 실제 로드, 첫/마지막 버튼 비활성, 슬라이더 키보드 조작, 확대 창 상태 공유, 표 시각 불변을 확인했다. 전체 회귀 검사에서도 데스크톱 KST/UTC와 키보드 탭 전환 검증을 통과했고 메인이 두 종류의 패널 캡처를 직접 확인했다.
- 전체 비교 Playwright 58개 통과, 데스크톱 전용 검사 2개 타 표면 제외(재시도 0, 종료 코드 0). 읽기 전용 리뷰에서 차단 결함 없음. 원본과 복사본 13개 SHA-256 일치, UTF-8·diff-check·Graphify update 완료.
- 증거: `artifacts/verification/kim-reference-tabs/`의 패널 종류별 캡처·이미지 명세·테스트/빌드 로그. 커밋·푸시·배포는 보류한다.

### 커밋·푸시·운영 배포 요청 (2026-09-08)

- 사용자가 최신 수정까지 커밋·푸시·배포하도록 명시적으로 요청하여 앞선 배포 보류를 해제했다. 담당: 메인.
- 최종 frontend Node 테스트 1480/1480 재통과. 최신 production build, 비교 Playwright 58개 통과(데스크톱 전용 2개 제외), 관리자 집중 계약과 읽기 전용 리뷰 근거는 위 기록을 따른다. 의존성 변경은 없다.
- AWS 수동 배포 지침과 운영 문서의 대상은 `ec2-user@3.34.113.37`, 키 `~/.ssh/key.pem`, 체크아웃 `/opt/projectamo/current`이며 fast deploy 대상이다. 지침 그대로 접속을 재확인했으나 TCP 22 연결이 시간 초과되어 서버 명령은 실행되지 않았다. 공개 HTTPS health는 정상이다. 커밋·푸시를 진행하되 운영 배포 완료로 간주하지 않는다.

### 운영 배포 완료 (2026-09-08)

- 사용자가 현재 접속 IP를 보안 그룹에 추가한 뒤 SSH 접속이 정상화됐다. `9259539c`를 main에 커밋·푸시했으며 서버의 기존 `8ab3a642`에서 fast deploy로 업데이트했다. 기존 서버의 미추적 환경 백업 파일은 보존했다.
- `deploy/deploy-vm.sh` 종료 코드 0. frontend 새 폴더 빌드·교체, PM2 online, NODE_OPTIONS 일치, nginx 구성 검사·reload, 로그 회전(10MB/매일, gzip, 7개), backend health 및 사이트 응답 정상. 배포 직후 서버 HEAD와 origin/main 모두 `9259539c`임을 확인했다.
- 공개 RKNY 분석 화면을 실제 API 자료로 Playwright 검증했다. 압축 헤더·모델 표, TAF 조건 기간·돌풍 없음·출처 문구 제거, 참고 패널 탭 전환, 단열선도 원본 13장 실제 로드와 슬라이더 조작 시 비교 URL 불변을 확인했다. 상대습도 METAR 2개 점은 모두 정시이며 페이지 오류 0건이다. 메인이 단열선도·기온/RH 캡처를 직접 확인했다.
- 운영 검증 스크립트의 첫 RH 점 선택자가 범례 버튼도 포함해 실패했다. 시간 문자열을 가진 관측점만 선택하도록 검사 스크립트를 수정한 뒤 전체 운영 검증이 통과했다. 제품 코드는 추가 변경하지 않았다. 관리자 UI는 앞서 통과한 로컬 계약 근거를 유지하며 운영 관리자 로그인 검증은 수행하지 않았다.
- 증거: `artifacts/verification/release-20260908/`의 deploy.log, server-verification.log, browser.log, result.json 및 운영 화면 캡처. 이 배포 기록은 별도 문서 커밋으로 푸시하고 서버 체크아웃에도 동기화한다.
