# 방문자 집계의 봇·자동화 제외 검토

검토 시각: 2026-10-26 21:29 KST. 운영 revision과 로컬 revision은 모두 `ba85f30a`.
운영 서비스·설정·데이터를 변경하지 않고 SSH, nginx 설정·접속 로그, SQLite 읽기 전용 조회로 확인했다.

## 결론

현재 봇 제외 조건이 없으며 HeadlessChrome 요청이 실제 방문 집계 대상에 들어온다.
최근 7일의 집계 대상 요청 245건 중 88건(35.9%)이 HeadlessChrome이다.
이 88건은 모두 기존 운영 기록의 내부 접속 IP와 같았다. 내부 자동화 점검이 통계를 오염시켰을 가능성이 크다.
악성 봇 유입이나 봇 방문자 88명으로 해석할 근거는 없다.

우선 백엔드 집계 직전에 알려진 봇과 자동화 점검을 제외하는 소규모 변경을 권한다.
기상 서비스 접근과 로그인 응답은 그대로 제공하면서 통계 기록만 생략할 수 있다.

## 접속·확인 근거

- `docs/operations/aws-ec2-manual-deploy.md`: `ec2-user` SSH, `/opt/projectamo/current`, 공유 데이터 경로 확인.
- `docs/superpowers/status/2026-10-20-map-briefing.md` 7단계: Windows `aws.exe`, `aws login --remote`, 내부 접속 IP 변경 이력 확인.
- SSH 접속에 성공하여 AWS 로그인·보안 그룹 변경은 필요하지 않았다.
- 운영 `backend/src/admin/visits.js`가 로컬 구현과 같음을 확인했다.
- `sudo nginx -T`로 HTML은 nginx가 직접 제공하고 `/api/`는 백엔드로 전달함을 확인했다.
- 운영 DB는 Python SQLite `mode=ro`와 `PRAGMA query_only=ON`으로 조회했다.
- nginx의 현재 로그와 회전 로그 7개를 읽었다. 1차 측정 범위는 10-19 12:27:42 ~ 10-26 12:27:42 UTC이며 파싱된 요청은 122,730건, 형식 미일치 행은 0건이다.
- 내부 IP 원문, 쿠키, 계정명, 세션, 환경변수 값은 이 문서에 기록하지 않았다.

## 현재 집계 방식

| 항목 | 구현과 의미 |
| --- | --- |
| 방문 신호 | `GET /api/auth/me`. 백엔드에 직접 들어온 `/api/`, `/data/` 이외의 GET도 포함 |
| 호출 시점 | `AuthProvider`가 마운트될 때. 인증 상태 갱신도 같은 API 사용 |
| 식별 | `amo.vid` UUID 쿠키, 1년 유효. 사람·계정·IP 단위가 아닌 브라우저 쿠키 단위 |
| 전체 방문자 | `visits` 행 수. 마지막 방문 90일 초과 시 정리 |
| 최근 방문 | `last_seen`이 최근 5분 이내인 쿠키 수. 지속 접속 여부를 확인하는 heartbeat는 이 집계에 없음 |
| 일별 방문 | `visit_days`: 쿠키당 UTC 하루 최대 한 줄, 400일 보관 |
| 신규 방문 | `visits.first_seen` 기준. 90일 비활성 정리로 이전 이력이 사라질 수 있음 |
| 이용 시간대 | `visit_hours`: KST 시간별 집계 대상 요청 횟수. 고유 방문자 수가 아님 |
| 주·월 방문 추이 | 일별 고유 방문자 수의 합계. 주·월 전체에서 중복 제거한 방문자 수가 아님 |
| 활성 계정 | `users.last_active_at` 기준으로 별도 집계 |

`visitTracker`는 인증 라우터 이전에 실행된다. 익명 `/api/auth/me`의 정상적인 401 응답도 방문 신호다.
따라서 200만 세도록 바꾸면 익명 방문자를 누락한다.
현재는 UA, 자동화 표시, 요청 출처 등을 검사하지 않고 쿠키 발급과 DB 기록을 수행한다.
기상 데이터 폴링 요청 전체가 방문수에 반영되는 구조는 아니다.

관련 코드: `backend/src/admin/visits.js`, `backend/src/admin/trends.js`, `backend/src/db/schema.sql`,
`backend/server.js`, `frontend/src/features/auth/AuthContext.jsx`, `frontend/src/features/admin/screens/UsersScreen.jsx`.

## 운영 데이터에서 관찰한 점

조회 시 저장된 방문자 쿠키는 344개, 최근 5분 방문은 0개였다.
344개 중 272개는 `first_seen == last_seen`이다. 단일 기록은 일회성 정상 방문도 포함하므로 봇 판정에 사용할 수 없다.

| UTC 날짜 | `/api/auth/me` GET | HeadlessChrome 요청 |
| --- | ---: | ---: |
| 10-19, 범위 내 일부 | 3 | 0 |
| 10-20 | 18 | 0 |
| 10-21 | 39 | 0 |
| 10-22 | 26 | 0 |
| 10-23 | 35 | 15 |
| 10-24 | 79 | 55 |
| 10-25 | 33 | 18 |
| 10-26, 범위 내 일부 | 12 | 0 |
| 합계 | 245 | 88 |

HeadlessChrome은 `149.0.7827.55` 한 UA였고, 응답은 200 30건과 401 58건이었다.
전부 문서상 내부 접속 IP와 일치했다. 같은 IP의 일반 UA에서도 `/api/auth/me` 43건이 관찰됐다.
따라서 이 IP 전체를 제외하면 일반 브라우저 사용도 함께 빠진다.
IP 일치는 내부 점검 가능성을 뒷받침하지만 각 요청의 실제 실행 주체를 확정하지는 않는다.

Googlebot, bingbot, ClaudeBot, OAI-SearchBot 등의 UA도 전체 접속 로그에 있었다.
이번에 사용한 명시적 봇·도구 문자열 검사에서 `/api/auth/me`에 해당한 것은 HeadlessChrome 88건뿐이다.
일반 UA로 위장한 봇이 없다는 뜻은 아니다. 이 검사는 알려진 문자열의 관측이며 탐지 정확도를 검증한 분류기가 아니다.

nginx 로그는 UA를 기록하지만 `amo.vid`는 기록하지 않는다. DB에는 방문자 ID와 시각만 있고 UA·분류 사유가 없다.
따라서 88건이 고유 방문자 쿠키 몇 개를 만들었는지, 저장된 344개 중 무엇을 지워야 하는지는 정확히 확정할 수 없다.
시간대 격자는 이미 합산되어 과거 자동화 요청만 정확히 빼기도 어렵다.

## 적용안 비교

| 방안 | 효과 | 적용 범위·한계 | 판단 |
| --- | --- | --- | --- |
| 집계 전 UA·자동화 표시 검사 | 실제 관측된 HeadlessChrome과 명시적인 봇·점검 요청 제외 | UA를 숨기는 봇까지 식별하지는 못함. 기존 Express middleware에서 가능 | 우선 적용 권고 |
| 전용 방문 API + 쿠키 왕복 확인 | 단순 API 호출·쿠키를 보관하지 않는 요청의 허수 감소 | 프론트·백엔드 변경. JS와 쿠키를 지원하는 자동화에는 별도 필터 필요 | 2차 선택 |
| IP·요청 빈도만으로 제외 | 단순 반복 요청 감소 | 같은 NAT의 정상 사용자·내부 실제 방문 누락, 현재 관측에도 해당 | 단독 기준으로 비권고 |
| AWS WAF Bot Control | 관리형 봇 분류·행동 분석 | EC2에 직접 연결 불가. CloudFront 또는 ALB 등의 앞단 구성과 비용 검토 필요 | 현재 방문 통계 개선만을 위한 우선안으로 비권고 |

### 1차 권고안: 작은 범위에서 미래 집계 개선

1. `visitTracker`의 쿠키 발급·`recordVisit` 호출 전에 판정 함수를 둔다.
2. 명확한 `HeadlessChrome`, 알려진 검색·AI crawler UA, 명시적인 모니터·점검 도구 요청을 제외한다.
   관측용 스크립트의 넓은 정규식을 그대로 운영 필터로 사용하지 않고 정상 UA 오탐 여부를 검증한다.
3. Playwright와 화면 캡처 도구에서 `X-ProjectAMO-Analytics: ignore` 같은 명시적인 제외 헤더를 보낸다.
   이 표시는 통계 제외만 수행하며 인증·권한·요청 제한에는 영향을 주지 않는다.
4. 제외한 요청도 `next()`로 진행한다. 로그인·익명 사용·검색 노출을 유지하며 통계만 기록하지 않는다.
5. 제외 건수는 `headless`, `known_bot`, `internal_test` 등의 사유별 집계로 남긴다.
   수집 허용·제외 결과와 정책 버전·적용 시각을 운영자가 확인할 수 있게 한다.
6. 최초에는 기존 UA 목록에 판정을 적용해 일반 Chrome/Edge, Samsung Internet, Kakao 인앱을 제외하지 않는지 확인한다.

이번에 확인한 UA를 중심으로 작은 분류 함수를 만들면 새 의존성 없이 fast deploy로 적용할 수 있다.
장기적인 crawler 목록 관리에는 [`isbot`](https://github.com/omrilotan/isbot) 도입도 가능하다.
이는 UA 기반 분류 도구이며 위장 봇을 검증하는 수단은 아니다. 도입 시 의존성이 변경되므로 full deploy가 필요하다.

### 과거 통계 처리

과거 데이터는 삭제·추정 차감하지 않는다. 적용 이후 요청에만 필터를 넣으면 과거에 만들어진 쿠키 행은
전체 수에 남고, 오래된 비활성 기록이 정리될 때까지 영향을 준다. 재방문하면 보존 기간도 이어질 수 있다.
화면에 필터 적용일과 이전 데이터 포함 여부를 명시해야 한다.

적용일부터 깨끗한 통계를 별도로 보고 싶다면 기존 표를 보존한 채 새 정책용 방문자·일별·시간별 표를
만들어 신규 집계를 시작하는 방법을 권한다. 적용 직후 기존 전체 344개와 새 지표를 직접 비교해서는 안 된다.
이 선택은 집계·조회·UI·보관 정책 변경이 추가되므로 단순 미래 필터와 분리해 작업 범위를 정한다.

### 2차 선택: 전용 방문 API

인증 조회와 방문 신호를 분리해 앱 초기화에서 전용 `POST /api/visits`를 호출할 수 있다.
최초 요청에서 쿠키만 발급하고 쿠키가 돌아오는 확인 요청에서 집계하면 쿠키를 보관하지 않는 요청의 허수를 줄인다.
기존 UA·내부 점검 제외는 함께 유지한다. 탭이 보이는 상태에서 60초 heartbeat를 추가하면 최근 활동을
더 잘 표현할 수 있지만, 시간대 요청 히트맵에 heartbeat가 그대로 누적되지 않도록 지표를 분리해야 한다.
체류시간이나 클릭을 필수 조건으로 삼으면 짧은 정상 방문과 접근성 도구 사용을 누락할 수 있다.

## 구현 시 검증·배포

- 정상 데스크톱·모바일·인앱 UA의 쿠키 발급과 방문 기록, 익명 401 방문을 보존한다.
- HeadlessChrome·알려진 봇·점검 표시 요청은 쿠키 발급과 세 방문 표의 쓰기가 모두 생략되는지 확인한다.
- 제외 요청에서도 인증·기상 API 응답은 정상적으로 제공되는지 확인한다.
- 동일 쿠키 재호출의 일별 중복 제거, 신규·일별·시간대 통계의 정책 일치를 확인한다.
- 새 지표를 시작한다면 이전 DB 보존·마이그레이션·정책 버전·적용일 표시를 확인한다.
- `admin-visits`, `admin-trends`, `visit-hours`와 middleware 통합 검증을 수행한다.
- 의존성이 없으면 fast deploy, `isbot` 등 의존성을 추가하면 full deploy를 사용한다.
- 운영 배포 후 명시적인 점검 요청의 제외 사유 증가와 정상 방문 집계를 확인한다.

후속 요청에 따라 1차 권고안을 로컬 코드에 구현했다. `visitTracker`가 쿠키·DB 기록 전에
`HeadlessChrome`, 알려진 crawler와 HTTP 점검 도구, `X-ProjectAMO-Analytics: ignore` 요청을 걸러낸다.
관리자 이용자 화면에는 서버 시작 후 사유별 제외 요청 합계와 과거 기록 포함 안내가 표시된다.
Playwright 계약 설정과 항적 패널 캡처 스크립트에는 제외 헤더를 추가했다.
기존 DB 기록 정리와 운영 배포는 이 구현에 포함되지 않는다.
재현용 읽기 전용 스크립트는 ignored `artifacts/visitor-bot-review/inspect-production.py`에 있다.

## 외부 참고

- [`isbot` 공식 저장소](https://github.com/omrilotan/isbot): UA 기반 bot/crawler 분류와 사용자 정의 패턴.
- [Matomo 봇 제외 안내](https://matomo.org/faq/new-to-piwik/faq_63/): 방문 분석에서 식별된 봇을 제외하는 방식.
- [AWS WAF 지원 리소스](https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html): WAF 연결 대상 리소스.
- [AWS EC2와 WAF 구성](https://repost.aws/knowledge-center/waf-protect-ec2-instance): EC2 직접 연결 불가 및 ALB 구성.
- [AWS Bot Control 적용 안내](https://docs.aws.amazon.com/waf/latest/developerguide/waf-bot-control-use-cases.html): 식별 가능한 봇과 위장 봇의 탐지, count 기반 관찰과 조정.
