# 전체 리팩토링 진단 보고서 — S004

**보고 완료·사용자 선정 대기.** 기준 `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41` (`main`), 2026-09-12. RF-001~003 진단과 RF-004 보고서 작성까지 마쳤다. RF-004는 사용자 선정이 남아 `in_progress`다. 사용자 선정 항목은 없으며 앱 코드·설정·저장 형식·영구 테스트는 개선하지 않았다. 원시 증거가 없는 다음 세션에서도 판단할 수 있도록 재현의 입력과 관찰값을 아래에 남긴다.

전체 영역의 근거는 [진단표](audit.md), 실행 조건과 실제 pass/fail/skip은 [기준선](baseline.md)과 [진행 기록](progress.md#마지막-검증)에 연결한다. `확인`은 코드 또는 임시 재현으로 확인한 사실이며, 운영 장애 빈도를 측정했다는 뜻은 아니다. `가설`은 영향·원인 또는 재현이 아직 부족한 후보다.

## 현재 결과를 읽는 기준

- `npm run check`: backend **1,141 pass·1 skip**, frontend **1,539 pass**, build 통과. 별도 root shared **14 pass**. Python·배포 오프라인 결과도 기준선에 분리했다.
- 주요 브라우저: 기본 **214 pass·58 fail·85 skip**, 기관 **24 pass**. 실패58건은 현재 제품 결함58개를 뜻하지 않는다. 오래된 진입/선택자·fixture·제품 상태·환경 제한을 분류했고 실제/기대 이미지를 검토했다.
- 성능: main/terminal 첫·재방문 각5회,8개 API 경로, map idle/switch 각5회. terminal도 main entry **3.35MB**를 요청했고 시간 규칙 NWP는 반복 **114MB 읽기**가 관찰됐다. 지도 heap의 전환 종속 증가는 재현했지만 누수 원인은 미확인이다.
- 모든 후보는 진단 기준 코드의 결과다. 단위·시연·terminal fallback·알림 재발처럼 명시 정책이 필요한 부분은 선택 카드에 선행 조건으로 적었다. 전체 분기·실운영 장애 빈도·안전성 전체 검증은 하지 않았다.
- 기존 미커밋 변경과 앱 파일을 보존했다. 최초 비격리 browser `--list`가 기존 DB open/schema 초기화 경계를 밟은 예외가 있다. 기존 계정2개·신규0이며 전후 DB hash가 없어 무변경을 입증할 수 없다. 이후 browser runner/server 및 모든 재현은 격리했다([B01](baseline.md)).

## 프로젝트 구조 종합평가와 리팩토링 방향

**큰 디렉터리 구조와 런타임 의존성 방향은 대체로 적절하며, 일부 기능의 상태·데이터·스타일 책임 경계를 보완할 단계로 판단한다.** 기능별 모듈, 공통 모델, 수집·저장 경계와 검증 기반이 이미 있다. 현재 근거로 전면 재설계를 필수 작업으로 권고하지 않는다. 다만 자료 보존·권한·핵심 상태 흐름의 후보는 별도로 우선 검토해야 한다. 이 평가는 S004의 코드 추적·대표 재현·측정에 대한 주 담당의 종합 판단이며, 실운영 장애 빈도나 제품 전체의 안전성을 입증한 결과는 아니다.

### 디렉터리와 의존성 평가

| 평가 대상 | 현재 판단과 근거 | 리팩토링에 반영할 방향 |
| --- | --- | --- |
| 디렉터리 구획 | **대체로 적절.** 프론트 `app`의 화면 조립, `features`의 기능 흐름, `api`의 요청, `frontend/src/shared`의 공용 UI·유틸리티가 구분돼 있다. 백엔드도 parser→processor→store와 기관·브리핑 서비스가 분리돼 있다. [A01 공통 조사](audit/common.md), [현재 소유권](../../Architecture.md) | 기존 기능별 디렉터리를 유지한다. 새 파일은 상태·자원의 소유자와 소비 경로를 기준으로 배치한다. |
| 공통 코드와 의존성 방향 | **기본 방향 양호, 도구·정적 자료 예외는 별도 판단.** 조사한 런타임 그래프에서 금지 방향·다중 파일 순환은 발견하지 못했다. 루트 `shared`의 경로·NWP·상태 모델과 프론트 `shared`는 실행 환경·소비자가 달라 분리할 이유가 있다. 수동 도구의 프론트 import 2건과 백엔드의 공항 JSON 읽기는 공통 조사에 따로 기록했다. | 공통 모델과 프론트 전용 코드를 구분한다. 도구 위치·정적 자료 원본의 소유권은 [RF-151](#rf-151) 및 공통 후속의 선택 범위에서 판단한다. 의존성을 일괄 축소하거나 유사한 코드를 모두 공통화하지 않는다. |
| 파일과 내부 책임 분리 | **부분 보완 필요.** 기능별 훅·어댑터·순수 모델은 이미 존재한다. 일부 중심 파일은 여러 상태 전환을 조율하며, 경로 적용·갱신·저장 사이 계약 불일치가 확인됐다. [W06](audit/W06.md), [RF-110](#rf-110)~[RF-112](#rf-112) | 편집/적용 상태, 비동기 결과 반영 조건, 저장 모델의 책임을 먼저 정하고 그 경계에 맞춰 분리한다. 줄 수만 줄이는 분리는 선정 근거로 삼지 않는다. |
| 화면 진입점과 스타일 소유 | **구체적인 보완 근거 있음.** 독립 terminal 화면도 main entry를 요청했고, 공용 WeatherIcon의 기본 스타일은 lazy monitoring CSS에 있다. [RF-124](#rf-124), [RF-153](#rf-153) | MainAppShell의 코드·CSS 의존성을 화면 진입 경계에 맞추고, 공용 컴포넌트의 기본 스타일을 해당 컴포넌트가 소유하도록 검토한다. 공통 bootstrap·provider·토큰·접근성 규칙은 보존한다. |

의존성 수치의 범위는 **테스트 제외 JS/MJS/JSX 601개, 상대 경로 literal import/export/dynamic import 1,297개 관계**다. 정규식 분석에서 금지된 런타임 방향과 다중 파일 SCC는 각각 0건이었다. 계산식 import, CJS require, `import.meta.glob`, CSS `@import`, 런타임 파일 읽기는 제외했고, 해석하지 않은 대상 86개는 CSS·자산이었다. 수동 audit 도구 2개의 프론트 import는 그래프 밖의 실제 예외다. 따라서 이 수치는 저장소 전체의 순환·경계 위반 부재나 비동기 상태의 정합성을 보장하지 않는다([범위·예외 원장](audit/common.md)).

### 초기 세 파일의 분리 필요성

| 파일 | 유지할 역할 | 분리·보완 판단 |
| --- | --- | --- |
| `MapView.jsx` | Mapbox 인스턴스, 배경지도·스타일 준비, `styleRevision`, 기능 조립을 소유한다. 기능별 지도 훅·어댑터와 현재 상태 복원 구조가 이미 있다. | 전체 분리의 필요성은 현재 근거로 낮다. 재현된 영상 전환은 해당 controller에서 다룰 수 있다([RF-115](#rf-115)). NOTAM·경로 preview·ADS-B의 잔여 조립은 [지도 정책](../policies/engineering/map-and-layers.md)에 명시된 과도기 예외이며, 새 기능의 구현 선례로 확대하지 않는다. |
| `useRouteBriefing.js` | 클라이언트 경로 상태와 브리핑 흐름을 조율하고 기존 경로 모델·요청·저장 helper를 사용한다. | 세 파일 중 **책임 경계 보완의 근거가 더 강하다.** 복원 모델의 `enRouteSegments`·`sourceCycle`이 갱신·재저장에서 소실되는 경로는 재현됐다([RF-112](#rf-112)). 대안 action 인자와 NWP 응답 계약은 코드 근거이며 실제 UI 재현이 남았다([RF-110](#rf-110), [RF-111](#rf-111)). 상태 원본과 요청의 유효기간을 정한 뒤 내부 책임을 분리한다. 같은 공유 상태를 여러 훅으로 옮기는 것만으로 해결됐다고 판단하지 않는다. |
| `backend/server.js` | HTTP 구성·인증·라우팅을 조립하며, 별도 라우터·서비스·수집 모듈을 사용한다. | 크기만으로 전면 라우터/서비스 재편을 권고하지 않는다. 선정한 응답·조회·캐시 문제에 필요한 경계를 좁게 정리한다. 예를 들어 수집기의 이전 live 읽기와 화면 active 읽기의 혼동은 store API와 호출자 계약 문제다([RF-100](#rf-100)). 파일 이동만으로 해결되지 않는다. |

### 작업 선정에 적용할 판단

- **먼저 검토할 것은 확인된 동작·계약 문제다.** 자료 보존, 접근 조건, 비동기 응답 순서, 저장 모델 후보를 아래 추천 순서에 따라 검토한다. 구조 변경은 선정한 문제의 재발을 막거나 변경·검증 경계를 명확히 하는 범위로 묶는다.
- **구조 개선의 목적과 검증을 연결한다.** 경로 상태는 편집→적용→갱신→저장/복원과 늦은 응답을, live/active 분리는 시연 중 수집 실패 후 이전 실황 보존을 확인한다. 진입점 분리는 동일 조건의 경로별 JS 요청·초기화를 비교하고, 공용 스타일은 main/monitoring 직접 진입에서 같은 아이콘 입력을 확인한다. 세부 효과·위험·선행 작업은 연결된 기존 카드가 기준이다.
- **이미 분리된 구조와 완료 개선을 유지한다.** 기능별 지도 어댑터, 루트 경로·NWP 모델, 기관의 권한·불변 버전·고정 자료, 공급자별 검증과 마지막 유효 자료 보존, 제한된 worker·queue·cache 및 완료된 폰트 개선을 보존한다([유지·보류·제외 목록](#유지보류제외-추천과-선택-기록)).
- **추가 확인의 범위를 제한한다.** 동적 의존성 전체, 도구·정적 자료의 최종 소유권, 경로 action의 실제 UI, 스타일의 실제 표시, 운영·동시성 조건은 연결 후속에서 선정된 부분만 확인한다. 전체 폴더 재배치나 대형 파일 전면 분리를 공통 선행 작업으로 두지 않는다.

이 종합평가는 기존 63개 후보의 선택을 돕는 설명이며 63개는 필수 변경 개수가 아니다. S007~S009의 실제 사용자 선택과 구현 결과는 작업 목록·진행 기록이 정본이며, 이 S004 진단 보고서의 원래 추천과 혼동하지 않는다.

## 사용자 선택 목록

아래 표는 S004 당시 선택 전 추천이다. 이후 RF-004는 실제 선택 기록이 생겨 `done`이며, S007/S008 기록은 보존되고 S009 선정 카드(RF-106, RF-107~109, RF-121~123, RF-150~151, RF-157, RF-158~162)는 구현까지 마감됐다. 그 외 행의 `미선정`은 그대로이며, 추천은 사용자 선택과 다르다.

우선순위는 장애 빈도의 측정값이 아닌 **영향·재현 근거·범위·검증 가능성**을 종합한 추천이다. P1은 데이터/권한/핵심 사용자 흐름 또는 검증 기반, P2는 제한된 흐름·회복성·측정된 비용, P3는 사용 필요·제품 의도부터 정할 항목이다. 같은 P1도 모두 이번에 수행하라는 뜻은 아니다. 여러 부분을 담은 카드는 제목 아래 지정한 일부만 선택할 수 있다.

처음 검토할 작은 묶음은 다음과 같다. 최종 선택·순서는 아직 없다.

조건부 권한 경계 **RF-157**도 먼저 검토할 항목이다. 실제 운영 설정을 확인한 결과는 아니며, 별도 DB의 실행 모드 검사부터 수행할 수 있다.

1. **검증 기반:** RF-103(검사 격리), RF-104(공통 검사), RF-123(실패 원인별 계약 정렬). 이미 통과한 앱 전체 검사를 문서 편집 때문에 반복할 필요는 없다.
2. **재현된 자료 보존:** RF-100→101(같은 수집 경계), RF-102(KTG 완료). 앞 묶음과 수정 파일이 대부분 다르지만 공통 검증은 순차 조율한다.
3. **재현된 화면·저장 상태:** RF-108/109(폴링), RF-112(저장 모델), RF-115(영상 전환). 서로 독립 선택 가능하며 대형 세 파일의 전면 분리를 선행하지 않는다.
4. **사용 흐름별 선택:** 개인 감시는 RF-143/144, 기관은 RF-131/136, 터미널은 RF-138. 관측 단위 RF-127/128은 원본 계약 확인을 먼저 포함한다.
5. **성능:** RF-124(독립 화면 bundle), RF-125(시간 규칙 격자 읽기). RF-126은 원인 규명을 위한 추가 조사다. 절감률이나 누수 원인을 아직 확정하지 않았다.

| ID | 후보 | 근거 수준 | 추천 우선순위·선택 | 사용자 선택 |
| --- | --- | --- | --- | --- |
| [RF-100](#rf-100) | 수집기가 이전 실황을 읽는 경계 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-101](#rf-101) | 해외 예보 취소와 게시 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-102](#rf-102) | KTG 회차 완료와 부분 파일 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-103](#rf-103) | 브라우저 검사 진입 경계 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-104](#rf-104) | 루트 검사 밖 공통 계약 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-105](#rf-105) | 전송 timeout의 본문 수명 | 현재 실행·측정+코드 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-106](#rf-106) | nginx 직접 서빙과 backend 차단 | 코드 경로; 실행 조건 미검증 | P1 · 추가 조사 | 미선정 |
| [RF-107](#rf-107) | snapshot 구독·재조회 계약과 NOTAM 갱신 정책 | 현재 실행·측정+코드 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-108](#rf-108) | 초기·주기·지연 요청의 완료 순서 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-109](#rf-109) | JSON 본문 실패와 모니터링 초기 복구 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-110](#rf-110) | 경로 적용 action과 요청 수명 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-111](#rf-111) | NWP 갱신 응답과 차트의 시간 정보 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-112](#rf-112) | 저장된 항로 모델의 갱신·재저장 보존 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-113](#rf-113) | 개인 브리핑의 자료 없음과 위험 없음 구분 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-114](#rf-114) | 개인 저장·갱신의 추가 정합성 조사 | 코드 경로; 실행 조건 미검증 | P2 · 추가 조사 | 미선정 |
| [RF-115](#rf-115) | 영상 A→B→A 재선택의 늦은 프레임 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-116](#rf-116) | 내 지도 파일별 식별자와 비동기 삭제 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-117](#rf-117) | FIR 후설치 자원의 가시성 복원 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-118](#rf-118) | 유효시각 원본과 시연 상태 구독 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-119](#rf-119) | 지점 표고 요청의 최신 선택 보장 | 코드 경로; 실행 조건 미검증 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-120](#rf-120) | 개발 KML 뷰어의 지원 목록·종료 수명 | 코드 경로; 실행 조건 미검증 | P3 · 보류 | 미선정 |
| [RF-121](#rf-121) | 배포 성공 표식과 프로세스 대상 | 코드 경로; 실행 조건 미검증 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-122](#rf-122) | 설정 저장 실패와 부트 기본값 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-123](#rf-123) | 현재 화면과 브라우저 계약의 일치 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-124](#rf-124) | 독립 화면 진입의 bundle 경계 | 현재 실행·측정+코드 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-125](#rf-125) | NWP 시간 규칙 경로의 격자 읽기 | 현재 실행·측정+코드 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-126](#rf-126) | 지도 반복 전환의 JS 메모리 추가 조사 | 현재 실행·측정+코드 | P2 · 추가 조사 | 미선정 |
| [RF-127](#rf-127) | 관측 풍속의 단위·결측 정규화 | 현재 실행·측정+코드 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-128](#rf-128) | 관측 운고의 단위·선별·결측 | 현재 실행·측정+코드 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-129](#rf-129) | 모델 원자료 cache의 검증 실패 복구 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-130](#rf-130) | 모델 비교의 성공 응답 내 partial 상태 표시 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-131](#rf-131) | 기관 경로 자료의 저장·발표 연결 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-132](#rf-132) | 기관 발표·편집의 버전 충돌 복구 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-133](#rf-133) | 기관 권한 상실과 비동기 화면 수명 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-134](#rf-134) | 기관 파일 게시와 실패 정리의 동시성 | 코드 경로; 실행 조건 미검증 | P1 · 추가 조사 | 미선정 |
| [RF-135](#rf-135) | 기관 알림 복합 입력의 실패 원자성 | 현재 실행·측정+코드 | P2 · 이번에 작업 후보 | 미선정 |
| [RF-136](#rf-136) | 기관 분석과 지도 경로의 정체성 | 현재 실행·측정+코드 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-137](#rf-137) | 터미널의 실황·fixture·부분 실패 경계 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-138](#rf-138) | 터미널 편성 적용과 결측 숫자 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-139](#rf-139) | 터미널 KST 기준과 운항일 경계 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-140](#rf-140) | 모니터링 경보의 시간 진행과 소리 수명 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-141](#rf-141) | 계정 상태 변경과 기존 세션의 권한 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-142](#rf-142) | 푸시 설정의 서버 성공과 계정 귀속 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-143](#rf-143) | 개인 감시 복제본의 시각·목록·종료 수명 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-144](#rf-144) | 개인 감시 ETA의 입력과 평가 범위 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-145](#rf-145) | 개인 알림의 감지와 전달·재발 정책 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-146](#rf-146) | 개인 사용자 상태와 알림 딥링크 수명 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-147](#rf-147) | 날짜 입력과 선택 시간대의 일치 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-148](#rf-148) | 예보관 문의의 두 단계 저장·재시도 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-149](#rf-149) | 실제 계정·설정 동작과 사용자 안내 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-150](#rf-150) | 일반 수집의 게시·실패·조회 경계 후속 | 코드 경로; 실행 조건 미검증 | P2 · 추가 조사 | 미선정 |
| [RF-151](#rf-151) | 도구·설치·문서의 실제 실행 계약 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-152](#rf-152) | 실제 화면에서 사용하는 미정의 CSS 변수 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-153](#rf-153) | 공유 WeatherIcon의 스타일 소유 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-154](#rf-154) | 모달·피커의 키보드와 포커스 계약 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-155](#rf-155) | 화면 크기 변경과 TAF 표시·safe-area | 코드 경로; 실행 조건 미검증 | P2 · 추가 조사 | 미선정 |
| [RF-156](#rf-156) | 디자인 정본과 자산 출처·배포 고지 | 코드 경로; 실행 조건 미검증 | P3 · 추가 조사 | 미선정 |
| [RF-157](#rf-157) | 테스트 변경 API와 수집·운영 시연의 분리 | 코드 경로; 실행 조건 미검증 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-158](#rf-158) | 관리자 조회 실패와 마지막 정상 상태 | 현재 실행·측정+코드 | P1 · 이번에 작업 후보 | 미선정 |
| [RF-159](#rf-159) | 시연 snapshot 이름과 활성 세대 | 코드 경로; 실행 조건 미검증 | P1 · 추가 조사 | 미선정 |
| [RF-160](#rf-160) | 운영 상태의 원본·이벤트 수·평가 대상 | 현재 실행·측정+코드 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-161](#rf-161) | 백업 완료 판정과 이전 성공본 보존 | 현재 실행·측정+코드 | P1 · 선행 계약·재현 후 작업 | 미선정 |
| [RF-162](#rf-162) | 운영 자원·기간·시간대 지표의 의미 | 코드 경로; 실행 조건 미검증 | P2 · 선행 계약·재현 후 작업 | 미선정 |

## 후보별 검토 근거

<a id="rf-100"></a>

### RF-100 · 수집기가 이전 실황을 읽는 경계

- **문제·원인·소비자:** `store.getCached()`는 활성 뷰용인데 airport_info/takeoff_fcst/TAF previous/ground_forecast/terminal_flights/overseas_forecast 및 flight-category 파생 입력이 collector에서 이를 읽는다. `store.save()`는 실황 base_path로 게시한다. 시연 중 실패 병합 또는 파생 계산에 시연 자료가 들어갈 수 있다. [A10 상세 W03-01](audit/W03.md), [주 담당 공통 조사](audit/common.md).
- **재현:** `node artifacts/refactoring/S004/repro-data-view.mjs`. 임시 live값 `live-value`, demo값 `demo-value`, 공항정보 API 15개 전부 synthetic 실패, 외부 호출 0. 결과 `saved:true`, 실황 latest의 RKSI가 `demo-value, _stale:true`. 기존 실황 유지 실패를 확인했다. 나머지 여섯 경로는 코드 근거이며 동일 런타임 검증은 아직 없다.
- **제안·범위:** store에 명시적인 수집용 live 읽기 경계를 제공하고 해당 일곱 processor의 입력/이전값을 분리한다. 화면·브리핑 조회는 active를 유지한다. 저장 형식 변경을 선행 조건으로 삼지 않는다.
- **효과·위험·선행:** 시연 종료 뒤 실황 출처 보장. TAF previous 의미, terminal 도착시각 fallback, 초기 무자료 처리 회귀 위험. 타입별 previous/파생 입력 계약을 먼저 적고 이미 있는 data-view 원자 전환은 유지한다.
- **검증·완료 조건:** 식별자가 다른 live/demo + 정상/부분/전체 실패 fixture, 실황 latest·active API·시연 종료/재시작 확인. 기존 data-view/store-data-view/demo-session/해당 processor 테스트 및 공항·브리핑 소비 경로. 일괄 getCached 문자열 치환으로 끝내지 않는다. **P1**.

<a id="rf-101"></a>

### RF-101 · 해외 예보 취소와 게시

- **문제·원인:** `overseas-forecast-processor.js:122`는 signal abort면 loop를 break하고 `:140`의 save는 실행한다. 미방문 공항은 failed에도 들어가지 않는다. `index.runWithLock`은 resolve를 성공으로 기록한다.
- **재현:** `node artifacts/refactoring/S004/repro-collector-boundaries.mjs`의 overseasPreAborted. 이전 RJAA last-good를 저장한 뒤 호출 전에 abort. 외부 fetch 0인데 `{saved:true, airports:0, failed:[]}`, 이전 공항 삭제. [W03-02](audit/W03.md).
- **제안·범위:** 해외 예보의 네트워크/루프/게시 경계에 취소를 전달·확인하고 cancellation 결과를 실행 통계와 일치시킨다. 모든 collector 전수 signal 전환은 이 카드 범위가 아니다.
- **효과·위험·선행:** 시연 스냅샷 capture 등의 수집 정리에서 정상 자료 유지. 일부 성공 자료 게시 정책을 정하지 않고 최종 abort만 추가하면 목적을 놓칠 수 있다. RF-100의 이전 실황 읽기와 같은 파일이므로 순차 구현 권장.
- **검증:** 첫 호출 전/응답 대기/공항 중간/게시 직전 abort, latest 해시 불변·실패/취소 구분·lock 해제, 정상 무변경/부분 성공 회귀. **P1**.

<a id="rf-102"></a>

### RF-102 · KTG 회차 완료와 부분 파일

- **문제·원인:** `ktg-processor.js:95`는 좌표를 고도 격자보다 먼저 쓴다. `:127`은 좌표 파일 존재만으로 해당 예보시각을 수집 완료로 취급한다. 파일 하나의 원자 rename은 회차 전체 완료를 뜻하지 않는다.
- **재현:** 같은 임시 도구의 ktgCoordsOnly. 1×1 좌표 파일만 준비하고 고도 grid는 0개, forecast_hours=[0]. 첫 처리에서 `hours:1, altLevels:0`으로 index/latest 게시; 두 번째는 `already_collected`. 외부 fetch 0. [W03-06](audit/W03.md).
- **제안·범위:** 기대 고도 파일의 usable/complete 검사 또는 회차 완료 표식을 통해 skip 여부를 판단한다. KTG processor/store와 기존 index 읽기 호환 범위.
- **효과·위험·선행:** 중간 쓰기 실패 후 자동 재시도 복구. 구형 자료 호환·불필요한 재다운로드 위험. 완료의 기준과 부분 run 노출 기준을 먼저 정의한다. KIM의 이미 있는 usable/complete 분리를 참고하되 저장 형식을 무조건 합치지 않는다.
- **검증:** 좌표만 존재/고도 일부 누락/손상 파일/이전 다른 run index/정상 complete + 쓰기 중 실패 후 재실행. 난류 지도·단면의 자료 없음 상태, 기존 KTG 테스트. **P1**.

<a id="rf-103"></a>

### RF-103 · 브라우저 검사 진입 경계

- **문제·원인:** `admin-console.spec.mjs`의 top-level fixture import → `getDb/createUser`는 `--list`/`--grep`에도 실행된다. Playwright 설정은 자동 수집만 끄고 DATA_PATH 격리를 소유하지 않는다. 기관 설정은 모든 project 이름이 organization-*이므로 grep /organization-/가 전체 testDir를 매칭한다. [A13 W01-02/03](audit/W01.md).
- **실제 근거:** 최초 비격리 목록 조회 로그는 두 계정 모두 이미 있음(신규 0)이나 기존 DB open/schema init 경계를 밟았다. 이후 본 실행은 runner/server 모두 artifacts DATA_PATH. 프로젝트 이름이 grep title에 포함되는 것은 설치 Playwright runner의 실제 호출 흐름으로 확인했다. 기관 본 실행은 파일 두 개를 지정한다.
- **제안·범위:** 검증 runner에서 DATA_PATH·fixture 생명주기를 소유하고 discovery에는 계정 변경이 없도록 명시 setup으로 분리. 기관 spec 선택은 파일/testMatch로 고정. 실제 관리자 로그인/권한 검증은 유지한다.
- **효과·위험·선행:** 사람의 DB·다른 fixture 상태 의존 제거와 예기치 않은 대량 검사 방지. 재사용 서버 fast 모드 및 기존 capture의 자료 경계가 달라질 위험. runner/server 일치·cleanup·로그 기준을 먼저 문서화한다. 현재 브라우저 실패를 무조건 baseline 갱신으로 해결하지 않는다.
- **검증:** 빈 root/기존 계정이 다른 root에서 list·grep·기본/기관 실제 파일 목록·로그인, 종료 뒤 잔여 프로세스/DB 경로 확인. 3001/5173 사용자 서버 보존. **P1**, 다른 브라우저 회귀 작업의 선행 권장.

<a id="rf-104"></a>

### RF-104 · 루트 검사 밖 공통 계약

- **문제·원인:** root test는 backend/frontend cwd의 Node discovery만 실행한다. shared 4개 파일의 14 case, Python 4개, deploy 2개, 독립 prototype test는 별도다. CI 정의가 추적 목록에 없지만 외부 CI 존재 여부는 미확인. [W01-01](audit/W01.md), [W02-10](audit/W02.md).
- **근거:** Node 22.23.1 내장 runner 패턴·실제 read-only glob·test import 소비자 대조. shared 모델은 양쪽 앱에서 사용 중이며 별도 실행 14/14 pass. 다른 그룹 실행 결과는 최종 기준선에 별도 기록한다.
- **제안·범위:** 가벼운 공통/오프라인 검증을 명시적 그룹으로 연결하고 전체 명령의 보장 범위를 문서화한다. prototype build나 외부 자료 검사를 기본 단위 검사에 무조건 묶지 않는다.
- **효과·위험·선행:** 공통 route/NWP/status 계약 변경의 누락 방지. 테스트 시간 증가·배포 공통 lock·선택 GIS 의존성 혼합 위험. 각 명령의 입력/출력·설치 조건을 분리한 뒤 연결한다.
- **검증:** 실제 discovery 목록과 의도한 그룹 일치, 선행 실패 시 후속 미실행 상태를 정확히 보고, Python main() 두 파일은 unittest discover와 별도 실행. **P1**, 코드 리팩토링 검증의 선행 권장.

<a id="rf-105"></a>

### RF-105 · 전송 timeout의 본문 수명

- **문제·원인:** `request-observability.js:93-97`의 timeout은 fetch가 헤더를 반환하면 해제되고 `:165`의 arrayBuffer 읽기는 뒤에 실행된다. 헤더 이후 지연은 선언 timeout의 범위 밖이다.
- **재현:** 임시 도구의 bodyTimeout. timeout20ms, 즉시 header + 80ms 뒤 body로 응답하는 fake fetch. status200/success, signal은 abort되지 않음. 실제 provider 지연 빈도·기본 transport 자체 timeout은 미확인. [W03-09](audit/W03.md).
- **제안·범위:** 전체 응답 완료/abort까지 요청 deadline을 유지하는 공통 transport 경계. validate 실패 retry 정책은 별도이며 이 카드에서 무조건 재시도하지 않는다.
- **효과·위험·선행:** lock/수집 지연의 예측 가능한 상한. 대용량 위성/모델 정상 다운로드를 너무 일찍 끊을 위험이 있어 operation별 timeout 의미·크기를 먼저 대조한다.
- **검증:** header 대기·body stall·부분 body·정상 대용량·외부 abort·429/5xx retry에서 물리 요청당 usage 1회·최종 상태·타이머/리스너 cleanup. 기존 transport 검증 유지. **P2**.

<a id="rf-106"></a>

### RF-106 · nginx 직접 서빙과 backend 차단

- **문제·근거:** `deploy/nginx/projectamo.conf.example:35-59`는 DB/기관파일을 막고 /data를 alias로 직접 제공하지만 CTPS/Echo Top binary 차단이 없다. `backend/server.js:204-210`은 해당 두 binary를 404 처리하고 지점 API만 제공한다. 전용 processor는 공개 이미지와 동일 자료 root에 binary를 쓴다. 일부 영상/meta cache 규칙도 두 경로가 다르다. [W02-01](audit/W02.md).
- **수준·제한:** 로컬 설정 불일치 확인. nginx 바이너리가 이 환경에 없어 실제 HTTP 재현 미실행. 운영 설정·외부 노출 여부·민감도는 확인하지 않았으며 운영 보안 사고로 단정하지 않는다.
- **제안·범위:** 공개/비공개 URL·cache 계약을 nginx와 backend 양쪽에 동일하게 검증하고 정확한 파일 패턴 차단/허용 또는 proxy 경유를 선택한다. 모든 .bin을 일괄 차단하는 변경은 별도 소비자 대조가 필요하다.
- **효과·위험·선행:** 서버 전용 자료의 우회 공개와 이미지 캐시 차이 방지. 정상 파일 제공·정적 서빙 비용 회귀 위험. 먼저 임시 nginx 또는 배포환경과 동일한 로컬 실행에서 계약을 재현한다.
- **검증:** CTPS/Echo Top bin404, 공개 WebP/GeoJSON200, meta no-cache와 immutable frame, DB/기관파일404, live/demo view 전환. 예제 수정만으로 운영 반영 완료라 하지 않는다. **P1 · 추가 조사 후 작업**.

<a id="rf-107"></a>

### RF-107 · snapshot 구독·재조회 계약과 NOTAM 갱신 정책

- **문제·원인:** main의 builder/diff/changed loader가 다른 키 집합을 사용한다. convectiveMeta는 initial/diff/fetch에 있지만 builder에서 빠져, 같은 자료를 받아도 다음 poll에 다시 변경으로 판단한다. `repro-client-decode.json`에서 같은 tm/hash 입력으로 builderHasConvective=false/convectiveChanged=true를 확인했다. echoMeta/flightCategory/KTG는 diff에 있으나 main 적재 원본이 없어 빈 merge를 반복할 조건이 있다. 독립 overlay hook이 이미 소유하는 키를 모두 main에 넣는 해결은 부적절하다. [W04-02](audit/W04.md).
- **재현과 반대 근거:** `repro-polling-keys.mjs/json`은 NOTAM/특보 hash만 바뀌어도 changedKeys=[], fetch0임을 확인했다. 다만 `snapshotMeta.test.js:83`은 **NOTAM 초기 전용을 명시한 기존 의도**다. 코드 누락을 곧바로 우발적 버그로 단정하지 않는다. NOTAM은 실제 지도·공항 탭이 소비하지만, main 특보의 표시 소비자는 찾지 못했다. Monitoring 특보는 별도 정상 diff 경로다. NOTAM의 실황 freshness 및 자료뷰 전환 정책을 먼저 결정해야 한다.
- **제안·범위:** profile별 구독 키·metadata projector·diff·fetcher를 한 계약으로 검토하고, 같은 응답 수신 후 no-op을 보장한다. NOTAM 초기 전용 유지/일반 갱신/뷰 전환만 갱신은 별도 선택 지점으로 남긴다.
- **효과·위험·선행:** 불필요 재조회·merge 감소, 화면 갱신 정책 명시. 원치 않는 NWP·태풍·ADS-B 중복 요청, 기존 초기 전용 의미 변경 위험. 키별 실제 소유자를 먼저 고정하고 HTTP null/실패 undefined를 보존한다. 성능 이득은 해당 요청 수 실측 후 정한다.
- **검증:** 실제 body→build→diff→changed→advance→동일 snapshot 반복, convective no-op, 독립 key 중복0, NOTAM의 선택한 갱신 정책 및 viewRevision 변경, 실패 후 재시도. **P2 · 계약 확인 후 작업**. 초안의 NOTAM ‘단순 누락 버그’ 해석은 반대 근거 검수 후 수정했다.

<a id="rf-108"></a>

### RF-108 · 초기·주기·지연 요청의 완료 순서

- **문제·원인:** `useWeatherPolling.js:31,51,64,102,140`의 세 writer가 mounted 여부만 확인하거나 직접 상태를 쓴다. 초기 bundle이 60초 넘게 대기하면 다음 timer가 두 번째 초기 bundle을 시작하고, 늦은 첫 응답이 전체 값을 덮을 수 있다. airportInfo/SIGWX history 지연 적재와 증분 poll도 같은 키를 쓴다. [W04-01](audit/W04.md).
- **근거 수준:** 실제 호출·상태 흐름 확인. 제어된 실제 hook 재현 `repro-polling.mjs/json` 종료0: production React, 60초 clock 전진으로 초기 요청2개, B 완료 뒤 A 완료 시 최종값은 A, pageerror0. 주입한 값 이름은 synthetic이고 실제 live/demo 전환을 실행한 것이 아니다. `/dev` 발신 data-view 이벤트를 main의 자연스러운 동일 문서 재현으로 확대하지 않는다. 지연 완료 뒤 snapshot의 viewRevision이 지워지는 경로도 별도로 확인했다.
- **제안·영향:** 자료뷰 epoch와 키별 요청 소유권 또는 동등한 commit 규칙을 정하고 초기·증분·deferred에 적용한다. main/monitoring 공유 hook, metadata 갱신과 feature 소비자 범위. 단일 전역 latest 요청만 허용하면 서로 다른 키의 정상 결과를 버리므로 피한다.
- **효과·위험·선행:** 새 자료가 늦은 과거 응답으로 되돌아가는 경로 방지. null/undefined·SIGWX 묶음·deferred 재시도 회귀 위험. RF-107의 소유자 표를 입력으로 쓰되 NOTAM 정책 결정과 독립인 순서 보장부터 가능하다.
- **검증:** 실제 hook의 초기 A/B 역순, 공항정보 지연/poll 역순, SIGWX 본문+history 일치, unmount/StrictMode, 다른 키 동시 성공, 실패 뒤 다음 성공과 revision. **P1 · 이번에 작업 추천**.

<a id="rf-109"></a>

### RF-109 · JSON 본문 실패와 모니터링 초기 복구

- **문제·원인:** `weatherApi.js:24-33`, `monitoringApi.js:3-7`은 try 안에서 `return res.json()`을 await하지 않아 비동기 decode rejection이 optional fallback을 벗어나 Promise.all 전체를 실패시킨다. monitoring은 초기 defaults가 실패하면 interval=null이고 retry UI가 없어 주기 복구도 시작하지 못한다. [W04-03](audit/W04.md), W08 후속 검수.
- **근거:** source와 실제 native Promise 의미 확인; `repro-client-decode.mjs/json`에서 actual loader와 native Response로 main initial/changed 및 monitoring initial/changed 네 경로의 optional METAR malformed body가 모두 SyntaxError로 reject됨을 확인했다. 정상 200 null은 main에서는 null, monitoring에서는 undefined였다. 일시 defaults 실패의 UI 복구는 W08 확인 범위다. 실제 공급자 오류 빈도는 미측정. monitoring의 200 null→undefined 변환은 별도 정책 확인 대상으로 남긴다.
- **제안·범위:** body decoding까지 optional 실패 정책으로 처리하고, monitoring의 초기 오류→재시도→성공 전이를 명시한다. API helper와 shared hook/monitoring profile 범위; 전체 client 교체는 불필요하다.
- **효과·위험·선행:** 한 잘못된 body가 정상 형제 자료를 막는 영향과 일시 초기 실패 후 영구 대기 감소. 정상 빈 자료와 오래된 경보 보존의 의미를 바꿀 위험. null/undefined 계약을 먼저 고정하고 RF-108과 공유 hook 변경을 순차 조율한다.
- **검증:** HTTP503/network reject/200 null/native json rejection, healthy sibling 보존, defaults 첫 실패→성공 뒤 카드·interval·error 상태 복구. **P1 · 이번에 작업 추천**.

<a id="rf-110"></a>

### RF-110 · 경로 적용 action과 요청 수명

- **문제·원인:** `RouteAlternativesStep.jsx:211`은 같은 event에서 draft를 갱신하고 문자열로 onApplyDraft를 호출한다. 연결된 `useRouteBriefing.js:1362`는 `{designId,draft}` 객체를 기대해 이전 렌더의 draft를 읽는다. 토큰 적용 `:1447-1481`도 planner/exposure await 뒤 새 입력·reset·기관 전환과 비교 없이 commit한다. full briefing의 gate는 존재하나 경로 선택 변경이 모든 gate를 무효화하지 않는다. [W06-01/02](audit/W06.md).
- **근거 수준:** 인자·closure·소비자 연결 확인, 실제 UI의 한 번 입력/역순 완료는 아직 미재현. 기존 selection 문자열 테스트 통과는 이 동작 보장이 아니다. 일반 브라우저 대안 검사 실패와 동일 원인이라고 자동 연결하지 않는다.
- **제안·범위:** 첫 단계는 새 문자열을 명시적 action payload로 넘기는 경계, 다음은 route/context revision별 적용 commit gate다. route editor·대안·지도/브리핑 소비자. 초안/적용본/비교 선택 분리는 유지한다.
- **효과·위험·선행:** 입력과 결과의 일치, B 경로에 A 날씨가 붙을 가능성 감소. waypoint identity·절차·undo·기관 고정 bundle 손상 위험. action별 상태표와 정상 저장/복원 계약을 먼저 고정한다. **두 단계 중 일부만 선정 가능**하다.
- **검증:** 대안 A→B 한 번 입력, 첫 빈 draft·map drop 객체, apply A/B 역순, apply 중 reset/기관 전환, 기상 A 진행 중 B 적용 후 late commit과 loading/error/fitBounds. **P1 · 좁은 동작 재현 후 작업 추천**.

<a id="rf-111"></a>

### RF-111 · NWP 갱신 응답과 차트의 시간 정보

- **문제·원인:** 일반 단면은 `server.js:1330`의 crossSection 내부에 timeRules/nwpTimeAvailability를 넣지만 refresh `:1362-1365`는 최상위로 반환한다. `useRouteBriefing.js:2394`는 crossSection만 저장하고 차트 `VerticalProfileChart.jsx:371`은 그 내부 필드만 읽는다. 갱신 뒤 시각 가용성·사라진 waypoint 안내·offset disabled 정보가 소비 경계에서 빠진다. [W06-03](audit/W06.md).
- **근거 수준:** 응답 shape와 최종 차트 props 경로 확인. 실제 버튼 상태 변화는 미재현. backend 시간 규칙 계산이 없다는 의미가 아니다.
- **제안·범위:** 개인 단면 응답 모델/refresh adapter를 일치시킨다. NWP만 NAVLOG에 patch하고 NOTAM·hazards·고도제약을 보존하는 구조는 유지한다.
- **효과·위험·선행:** 갱신 후에도 적용 가능한 시각과 제외된 의도를 표시. 기관 validated display shape에 개인 envelope를 강제할 위험; 개인 경계부터 제한한다. RF-112 저장 모델 입력도 함께 검증하되 독립 수정 가능하다.
- **검증:** 일반 단면→unknown waypoint/unavailable offset 포함 성공 refresh→API shape·hook state·차트 안내 비교, 기관 브리핑 회귀. **P1 · 이번에 작업 추천**.

<a id="rf-112"></a>

### RF-112 · 저장된 항로 모델의 갱신·재저장 보존

- **문제·원인:** 저장 복원은 최소 routeResult와 기존 routeModel을 함께 보존하지만, `verticalProfileRequest.js:139`와 `routeSaveGeometry.js:21`은 routeResult.routeModel을 읽지 않고 segments 없는 최소 결과에서 모델을 재생성한다. 호출자는 NWP refresh·경로 메뉴 저장·브리핑 저장이다. [W06-04](audit/W06.md).
- **재현:** `node artifacts/refactoring/S004/repro-saved-route.mjs` 종료0. 기존 테스트 형태의 IFR fixture에 A582 구간1개/sourceCycle을 넣었다. 복원 결과는 보존하지만 refresh 요청과 resave 모델은 enRouteSegments=[]/sourceCycle 없음, enRouteRange=not_applicable. geometry는 그대로다. 실제 순수 production helper 조합이며 HTTP/DB/브라우저는 사용하지 않았다.
- **제안·범위:** 기하가 변하지 않은 저장 경로는 versioned 기존 모델을 원본으로 사용하는 resolver를 profile/save 경계에 적용한다. 편집으로 기하가 바뀐 경우 재생성·검증 규칙을 별도로 둔다. 저장 format migration을 전제로 하지 않는다.
- **효과·위험·선행:** NAVLOG 구간·AIP provenance·다시 저장할 입력 보존. 오래된 모델을 새 기하에 붙일 위험. geometry revision과 legacy no-model fallback을 먼저 정한다.
- **검증:** 저장→복원→NWP refresh→재저장 round trip의 segment/range/sourceCycle/marker 일치, 실제 NAVLOG patch, 수정된 geometry/terminal 절차/VFR/legacy 사례. **P1 · 이번에 작업 추천**.

<a id="rf-113"></a>

### RF-113 · 개인 브리핑의 자료 없음과 위험 없음 구분

- **문제·원인:** `route-exposure.js:12`, `briefing-composer.js:113`은 누락 SIGMET/AIRMET을 빈 목록으로 만들고, `hazard-section.js:12,65`는 비교 불가 항목을 생략한 뒤 green을 만들 수 있다. 개인 `BriefingView.jsx:417`은 encounters가 비면 ‘계획고도에서 조우하는 위험 없음’을 표시한다. 기관에는 incomplete guard가 있으나 개인 경로에는 같은 source availability 복구가 없다. [W06-06](audit/W06.md).
- **근거 수준:** null/geometry 없음/range unavailable의 code path와 표시 소비자 확인. 운영에서 해당 입력의 빈도 및 화면 재현은 미확인. 정상 빈 snapshot도 실패라고 바꾸자는 제안은 아니다.
- **제안·범위:** source availability/reason/provenance를 원본에서 유지하고 horizontal/altitude/time 비교 결과와 분리해 합성·표시한다. 개인 노출 API·composer·비교 카드·브리핑. 기관 componentStatus와 순수 exposure adapter는 재사용 가능한 기존 경계다.
- **효과·위험·선행:** 자료 공백을 정상 결과로 오해하는 경로 감소. 정상 0건을 과도한 경고로 바꾸거나 enroute 범위를 넓히는 위험. source별 빈값/누락/만료/비교 불가 정책과 기존 route-source 계약을 먼저 명시한다.
- **검증:** 정상 빈 source, null source, geometry 없음, range unavailable, 유효시간 불명, 실제 불교차를 동일 route fixture로 API→provenance→최종 문구까지 비교. **P1 · 계약 fixture 확인 후 작업 추천**.

<a id="rf-114"></a>

### RF-114 · 개인 저장·갱신의 추가 정합성 조사

- **질문·근거:** 경로 메뉴는 alternatives/selectedAlternativeId를 저장하지만 geometry가 있는 정상 로드는 applyBaseRoute로 `[base]`만 복원한다(W06-05). NWP 부분 갱신은 leg만 patch하고 기존 model ribbon/provenance run을 남기며 개인의 세 API는 동일 source revision을 확인하지 않는다(W06-07). [W06 상세](audit/W06.md).
- **수준:** 코드 연결 확인, 각각 ‘base만 편집 복원’, ‘NAVLOG만 갱신’이라는 의도일 가능성이 남는다. 실제 운영 불일치와 제품 기대는 미확인. 두 질문은 독립이므로 **저장 대안 / NWP 회차 중 선택 가능**하다.
- **제안·영향·효과:** 먼저 저장2대안 round trip과 provider 사이 회차 교체를 재현해 복원 범위·표시 출처 계약을 정한다. 이후 명시적인 복원 함수 또는 NWP 요약/provenance 동시 갱신을 검토한다. 잘못된 범위의 리팩토링 방지가 현재 기대 효과다.
- **위험·선행:** 해외/절차 기하 재검색으로 원본 손실, 기관의 더 강한 고정 계약을 개인에 과도하게 이식할 위험. RF-112와 기관 W09 결과가 선행 입력이다.
- **검증:** base+대안2+선택ID 저장/로드, legacy no-geometry와 briefing kind 분리; 선택 hf 변경·source revision 변경 전후 NAVLOG/chart/ribbon/provenance 대조. **P2 · 추가 조사 추천**.

<a id="rf-115"></a>

### RF-115 · 영상 A→B→A 재선택의 늦은 프레임

- **문제·원인:** `rasterFrameTransition.js:136`은 이미 active인 A를 재선택하면 pending B generation을 취소하지 않고 반환한다. B의 늦은 preload/source 완료는 기존 검사를 통과해 활성 영상을 바꾼다. HSR/HCI/가시·적외·QPF/WISSDOM의 공통 소비 경로다. [W05-02](audit/W05.md).
- **재현:** `node artifacts/refactoring/S004/repro-raster.mjs` 종료0. 실제 controller+기존 테스트 Mapbox double. A 확정→B preload 보류→A 재선택(true)→B 완료. 선택은 `/a.webp`, 실제 layer source URL은 `/b.webp`. 브라우저 렌더/운영 발생률은 미측정이다.
- **제안·범위:** 최신 요청 선택과 active 자원을 분리해 active 재선택도 이전 pending을 무효화한다. 기존 마지막 유효 프레임 유지·동일 pending coalescing·style 복원·fade는 유지한다.
- **효과·위험·선행:** 선택 시각과 표시 영상 일치. fade timer/취소 promise/stacking 회귀 위험. controller 상태 전이와 source cleanup을 먼저 고정하며 MapView 전체 재작성은 필요 없다.
- **검증:** B preload/source/fade 각 단계에서 A 복귀, off/dispose/style 재생성, source URL·visible layer·선택시각 및 모든 promise settle. 관련 실제 radar/satellite 계약은 RF-123의 fixture 정합성 보완 뒤 확인. **P1 · 이번에 작업 추천**.

<a id="rf-116"></a>

### RF-116 · 내 지도 파일별 식별자와 비동기 삭제

- **문제·원인·근거:** `kmlFolderTree.js:9`는 매 파일마다 f0부터 폴더 ID를 생성하지만 `useMyMap.js:49,67,217`의 hidden/flyToFolder와 패널 expanded는 fileId 없이 사용한다. 두 파일의 f0을 함께 숨기거나 다른 파일로 이동할 조건이다. `openFile:126`의 parse 완료는 remove/toggle 의도와 비교 없이 active/layers를 추가한다. [W05-01/06](audit/W05.md). 실제 다중파일 UI/IO 역순 재현은 미실행.
- **제안·범위:** 첫 단계는 fileId+folderId 식별을 hook/UI/Mapbox 소비에 적용, 둘째는 파일별 desired-active/deleted와 작업 generation을 둔다. parser 내부 ID·원본 파일 저장 ID는 유지한다. **폴더 식별 / 삭제 경쟁 중 일부 선정 가능**.
- **효과·위험·선행:** 여러 파일의 표시·확장·카메라와 삭제 의도 보장. 부모 숨김 전파·전체 토글·원본 저장 실패 시 이번 지도 표시 fallback 회귀 위험. 파일별 상태 전이와 삭제 실패 UI 계약을 먼저 고정한다.
- **검증:** 다른 위치의 같은 f0/f1을 가진 KML2개→토글/확장/fit, 전체off/on·style 전환; deferred load/parse→delete 및 연속toggle→최종 목록/active/source/bounds. **P2 · 좁은 재현 후 작업 추천**.

<a id="rf-117"></a>

### RF-117 · FIR 후설치 자원의 가시성 복원

- **문제·원인·근거:** `useFirTickOverlay.js:106-129`는 늦은 자료 완료 뒤 tick을 defaultVisible로 설치하고 현재 FIR visibility를 받지 않는다. `MapView.jsx:1509`의 공통 sync는 존재하는 layer만 처리한다. FIR을 먼저 끄면 후설치 tick만 보일 조건이 있다. [W05-04](audit/W05.md). 실제 Mapbox 순서 재현은 미실행.
- **제안·범위·효과:** 후설치 adapter가 현재 master visibility를 입력받거나 설치 직후 적용하도록 맞춘다. FIR line/mask/tick/label을 같은 사용자 토글에 맞추며 geometry·공유 fetch는 유지한다.
- **위험·선행·검증:** 일반 항공 레이어 전체를 다시 설계할 이유는 없다. off→지연응답 완료, off→단색/위성/기본 전환 뒤 모든 FIR resource visibility와 이웃 경계 표시를 확인한다. **P2 · 재현 후 작업 추천**.

<a id="rf-118"></a>

### RF-118 · 유효시각 원본과 시연 상태 구독

- **문제·원인·근거:** 지도 NOTAM은 demoNowMs를 사용하지만 `useMoaActivation.js:69`는 Date.now를 읽고 clock을 effect dependency로 받지 않는다. 같은 NOTAM의 MOA 활성 표시가 시연 시각·일일 schedule 경계와 어긋날 조건이다. `useDemoMode`는 MapView/BriefingView/TafTab마다 독립 30초 fetch를 만든다. cleanup은 있으며 ‘누수’로 판정하지 않는다. [W05-05](audit/W05.md), [W04-04](audit/W04.md).
- **제안·범위:** MOA에는 기존 NOTAM이 사용하는 effective now를 전달하고, demo status/clock의 공유 구독은 별도 단계로 정리한다. W07-06의 TAF badge/body와 Airport NOTAM도 같은 effective-now 입력 검토에 포함하되 Moon 달력·원문 발행시각·UTC run 라벨은 별도 의미로 유지한다. live clock·시연 고정시각·기관 pinned validTime은 구분한다. main header의 실제시각까지 무조건 바꾸지 않는다.
- **효과·위험·선행:** 동일 자료의 상태 판정 일치와 동일 endpoint 중복 감소. 주 타임라인 과거시각을 모든 NOTAM에 적용하는 의미 변경 위험. A09/A11과 source별 now 계약이 선행이다. 정확한 동시 요청수·정량 이득은 미측정.
- **검증:** real/demo가 다른 고정 fixture, 유효기간·일일 schedule 경계에서 NOTAM 목록/지도/MOA 대조; main+공항+브리핑 mount/unmount별 구독/요청수·최후 interval 정리·slow response 역순·pinned 발표. **P2 · MOA 계약 확인 후 작업, 공유 구독은 후순위 추천**.

<a id="rf-119"></a>

### RF-119 · 지점 표고 요청의 최신 선택 보장

- **문제·원인·근거:** `useMeasureOverlay.js:118,240`은 click point와 표고 fetch를 바꾸지만 응답에 point identity/token을 검사하지 않는다. clear/도구 전환/cleanup도 pending을 무효화하지 않는다. MapToolsPanel이 값을 그대로 소비한다. [W05-03](audit/W05.md), 실제 UI 역순 재현 미실행.
- **제안·범위·효과:** point request에 commit token/cancel을 두고 clear/tool/map cleanup에서 무효화한다. B 지점에 A 표고를 붙이는 경로를 막는다. 기존 CTPS/Echo Top의 취소 경계는 유지할 선례다.
- **위험·선행·검증:** 0ft/null/실패와 측정선 상태를 혼합할 위험. 지연 A/B 역순, clear 후 완료, 도구 전환/close/style/unmount의 point marker+값 일치를 검사한다. 별개 `line-join` paint 경고(W05-09)는 저위험 선언 정리로 선택 가능하며 새 구현 복제 테스트는 필요 없다. **P2 · 이번에 작업 후보**.

<a id="rf-120"></a>

### RF-120 · 개발 KML 뷰어의 지원 목록·종료 수명

- **문제·원인·근거:** `useKmlWeather.js:24,73-83`의 지원 목록에는 HSR/HCI/가시/CI/CTPS/Echo Top이 있지만 실제 조합은 주 MapView의 별도 adapter를 호출하지 않는다. raster/lightning dispose도 주 지도와 다르다. [W05-07](audit/W05.md). 개발 전용 버튼/종료 오류는 실제 브라우저 미재현.
- **제안·범위·효과:** 개발 도구의 의도한 MET subset과 실제 호출 목록을 맞추고 adapter cleanup 소유자를 명시한다. 지원한다고 보이지만 동작하지 않을 가능성과 제거 후 callback 접근을 줄인다.
- **위험·선행·검증:** 전체 지도 기능을 붙이면 timeline/altitude/point query까지 범위가 커진다. 먼저 spike의 필요 subset을 정한 뒤 각 버튼→source/layer와 preload 중 이탈→2회 mount/unmount를 확인한다. draw/KML 자체와 연구 산출물은 유지한다. **P3 · 보류 추천**, 실제 개발 사용에서 필요하면 선정.

<a id="rf-121"></a>

### RF-121 · 배포 성공 표식과 프로세스 대상

- **문제·원인·근거:** fast deploy는 build 전에 `.deployed-at`을 쓰고 full deploy에는 쓰기가 없어 admin 화면의 배포시각이 성공/적용 시각을 보장하지 않는다. PM2 점검은 앱 이름 대신 jlist[0].pid를 선택한다. staging build는 실패 시 이전 dist를 보존하지만 두 번 mv 사이 및 기존 asset 제거 뒤 열린 탭 lazy load는 추가 확인 대상이다. [W02-02/06/07](audit/W02.md).
- **제안·범위·효과:** 성공한 배포 단계에서 일관된 표식을 기록하고 PM2 app identity로 상태를 검사한다. fast/full script와 admin의 표시 계약을 맞춘다. 오래 열린 탭의 asset 보존은 별도 2버전 재현 뒤 선택한다.
- **위험·선행:** 실제 VM의 PM2 목록/배포 경로는 보지 않았다. 의존성 변경 시 full deploy 원칙과 기존 lock/staging 보존을 유지한다. 원자 rename만으로 모든 배포 원자성을 주장하지 않는다.
- **검증:** stubbed build 실패/성공·다른 PM2 앱 선두·full/fast 적용 후 표식, 기존 lock 검사; 별도 두 build로 old tab lazy import 관찰. 실제 배포는 이 진단 및 향후 코드 구현만으로 승인되지 않는다. **P2 · 표식·대상 작업 추천, asset 수명 추가 조사**.

<a id="rf-122"></a>

### RF-122 · 설정 저장 실패와 부트 기본값

- **문제·원인·근거:** `main.jsx:11`의 폰트 초기화와 `fontPrefs.js`/TimeZoneContext/SettingsModal은 localStorage read/write 예외와 허용값 처리가 고르지 않다. 폰트 읽기가 throw하면 createRoot 전에 멈출 조건이다. useLastSeenVersion/온보딩에는 이미 실패 시 세션을 유지하는 선례가 있다. [W04-05](audit/W04.md).
- **제안·범위·효과:** 저장 IO/enum 경계만 작게 정리해 storage 불가 때도 기본 화면과 현재 세션 설정을 유지한다. 기존 key, Wanted 자체 호스팅·lazy font load, UTC/KST 결과를 보존한다.
- **위험·선행·검증:** 운영 발생률 미확인이고 정상 preference 값을 덮는 migration은 제안하지 않는다. get/set throw, unknown time_zone/font_pref, apply/save/reset/cancel·reload에서 상태와 화면을 확인한다. language 저장값의 실제 렌더 소비는 찾지 못했으므로 i18n 구현은 별도 제품 질문이다. **P2 · 조건부 재현 후 작업 후보**.

<a id="rf-123"></a>

### RF-123 · 현재 화면과 브라우저 계약의 일치

- **문제·근거:** 기본 357사례 중 58실패. 여러 실패는 오래된 release0.3/지형 옵션/구름꼭대기 이름/옛 radar source/사라진 적용 버튼·단계 진입 선택자로 실제 대상 동작에 도달하지 못했다. 모니터링은 자료·레이아웃 차이와 mobile redirect가 섞여 있고, FPL 절차·WebKit profile 등은 추가 원인 확인이 필요하다. [기준선 B03](baseline.md), [W01](audit/W01.md), [W05-08](audit/W05.md).
- **제안·범위:** 계약의 보호 목적을 먼저 고정한 뒤 현재 진입·fixture·resource·engine과 맞춘다. 58건을 58개 제품 버그로 집계하거나 모든 screenshot을 새로 승인하지 않는다. 명시적 mobile 단계와 실제 레이더 순서/가용성을 검사하고 source 문자열 검사와 동작 검사의 역할을 나눈다.
- **효과·위험·선행:** 후속 개선의 회귀 판단을 신뢰할 수 있게 한다. 현행 결함을 새 기대값으로 굳힐 위험이 가장 크므로 실패 원인 분류와 검토 가능한 실제/기대 이미지를 선행한다. 데이터 격리는 RF-103이 선행 권장이다.
- **검증:** 수정된 계약의 targeted 실행→해당 engine/viewport의 실제 사용자 상태·resource oracle, 현재 실패 및 skip 목록과 대조. baseline 갱신이 필요한 경우 변경 이유와 승인 대상을 분리. registry에 누락된 spec/engine/fixture 범위도 맞춘다. **P1 · 실제 구현에 앞선 검증 기반 작업 추천**.

<a id="rf-124"></a>

### RF-124 · 독립 화면 진입의 bundle 경계

- **문제·원인·측정:** App은 standalone runtime을 배타 lazy 분기하지만 MapView/AirportPanel 등 main import가 entry에 남는다. production main/terminal 각각 첫 방문5회에서 terminal도 동일 entry3,347,094B(decoded)/956,739B(encoded)를 요청하고 TerminalPage 등까지 합쳐3,431,544B의 JS를 받았다. [B04](baseline.md). 단순 큰 파일 경고가 아닌 실제 standalone 소비 경로다.
- **제안·범위:** MainAppShell과 main 의존 import/CSS를 진입 경계 뒤로 이동하는 방안을 좁게 검토한다. main 자체의 필요한 Mapbox 초기화나 독립 화면의 현재 lazy/정상 API 분리는 유지한다.
- **효과·위험·선행:** terminal·기관·모델 standalone에 불필요한 main 코드 전송/평가 감소 가능. 아직 변경 전후 비교가 없어 절감률·체감 향상을 확정하지 않는다. eager CSS의 전역 의존, shared provider/context와 경로별 초기화 순서 위험. [W12-03 CSS 소유 목록](audit/W12.md)의 reset/focus/modal/motion/token과 RF-153의 공유 아이콘 스타일을 선행 입력으로 사용한다.
- **검증:** production 동일 5회 fresh/revisit에서 실제 요청 chunk·압축 bytes·DOM 준비 비교, 메인/terminal/기관/모델/admin 직접 URL 및 뒤로가기, 전역 CSS 영향과 WebKit. 터미널 기준값은 운항 종료 화면이며 populated 운항표는 별도 조건을 고정한다. **P2 · 성능 개선 작업 추천**.

<a id="rf-125"></a>

### RF-125 · NWP 시간 규칙 경로의 격자 읽기

- **문제·원인·측정:** `enroute-cross-section.js:215-227,273`에서 시간 규칙 KIM/KTG는 cachedGrid를 우회한다. 동일 run/경로/시각 반복5회에서 일반 warm112.35ms·4reads·63,264B, 시간 규칙289.23ms·35reads·114,126,422B였다. cold 일반은355.81ms·36reads·114,736,979B. [B05](baseline.md). API200/21levels, application cache와 OS cache 조건을 구분했다.
- **제안·범위:** root/run/revision/hf/level별 재사용 가능한 bounded grid 조회를 시간 규칙에서도 사용하도록 책임을 정리한다. 다중 hf를 한 bundle key로 덮어 쓰지 않는다. 기관 exact resource/partial-run 경계와 정상 cache invalidate는 유지한다.
- **효과·위험·선행:** 반복 파일 읽기·JSON parse/CPU 감소를 기대한다. 현재 전체 시간 비율2.57배를 모두 cache 효과로 주장하지 않으며 입력 분기 차이·driver overhead가 있다. 다중 회차 혼합·cache memory 증가 위험. 키·상한·무효화 계약과 최대 활성 hf를 먼저 정의한다.
- **검증:** 같은 fixture 일반/timeRules·다중 waypoint offset·같은 tmfc 재게시·demo/live·기관 revision, 응답 수치 동일성 및5회 I/O/CPU/elapsed/RSS 비교. 목표는 동일 요청의 반복 큰 파일 읽기 제거이고 시간 목표는 구현 방식 검토 후 정한다. **P2 · 측정 근거가 있는 작업 추천**.

<a id="rf-126"></a>

### RF-126 · 지도 반복 전환의 JS 메모리 추가 조사

- **관찰·근거:** production 기본↔단색10회, 매회 full GC 뒤 JS used heap33.72→95.88MiB, canvas1개, DOM696→702, listener265→265, pageerror0. [B04](baseline.md). 한 번의 증가만으로 누수·MapView의 특정 함수 결함을 확정하지 않는다.
- **추가 측정 결과:** fresh context idle/switch 각5회·각10회2초 interval, 매회 full GC. `bench-map-memory.mjs/json` 종료0,246.32s: idle 증가 중앙0.216MiB(0.205–0.231), switch 증가62.009MiB(61.756–62.257), pageerror0. 같은 짧은 관찰 기간의 idle과 다른 전환 종속 증가가 반복됐다. 장기 plateau와 구체적인 retaining owner는 아직 미확인이다.
- **제안·범위·효과:** 증가가 전환에 종속되면 heap retaining path/adapter map identity/Mapbox cache 수명부터 조사한다. bounded cache의 정상 증가와 제거된 map/style 자원 잔존을 구분하는 것이 현재 목표다. 원인 확인 전 cleanup 일괄 추가나 MapView 전체 분리는 제안하지 않는다.
- **위험·선행·검증:** 외부 타일 응답·DevTools 측정 overhead·GPU/native memory가 JS heap과 다르다. idle 대조→반복/안정화→닫기/GC→allocation/retainer를 확인하고 재현된 소유자만 후속 구현 범위로 선정한다. **P2 · 추가 조사 추천**.

<a id="rf-127"></a>

### RF-127 · 관측 풍속의 단위·결측 정규화

- **문제·원인:** parseWind는 비-KT unit을 남기면서 수치를 변환하지 않고 raw에는 KT를 붙이며, 누락 풍속을0/calm으로 만든다. METAR panel·측풍·badge와 비교 API는 speed를 kt로 소비한다. [W07-01](audit/W07.md), `parse-utils.js:158-205`, `metarViewModel.js:72-105`.
- **재현:** `repro-observations.mjs/json`에서 m/s10→speed10/unit m/s/raw18010KT, panel windSpeedText10. 빈 wind{}→00000KT/calmtrue. actual parser와 표시 helper의 synthetic 입력 결과이며 공급자가 이런 입력을 주는 빈도는 미확인이다. NOAA는 이미 knot로 정규화한 wspd를 넘기므로 원문 MPS만 보고 재변환하면 안 된다.
- **제안·범위·효과:** 지원 unit의 변환/거부와 missing/calm을 원본 정규화 경계에서 명시해 downstream의 값·임계값 일치를 보장한다. parser/normalized snapshot/TAC 및 METAR·TAF·지도·브리핑·알림 소비자 범위.
- **위험·선행:** 기존 snapshot 호환, VRB/실제0, 이중 변환과 풍속 배지 회귀. 실제 제공자 unit 명세·보존 원문을 먼저 확인하고 UI마다 보정하지 않는다.
- **검증:** KT/m/s/미지원/누락 unit×정상/누락/0/VRB, parser→저장 payload→API→풍속/측풍/비교 값과 결측 상태. **P1 · 원단위 계약 확인 후 작업 추천**.

<a id="rf-128"></a>

### RF-128 · 관측 운고의 단위·선별·결측

- **문제·원인:** 동일 AMOS cloud_min_m 값은 console에서 그대로 ft, flight-category stations에서는 m→ft로 해석된다(W07-02). METAR panel은 VV를 제외하지만 비교는 포함하고, 비교는 최저값 대신 첫 finite cloud를 선택한다(W07-03). 모델별 운고 추정 방식과 관측 선별을 합칠 문제는 아니다. [W07 상세](audit/W07.md).
- **재현:** `repro-observations.json`: AMOS 같은500→panel500ft, 지도1640ft. VV200→panel NSC/ceiling category VFR, 비교200ft. **AMOS 원자료가 m인지 ft인지는 아직 미확정**이며 어느 쪽을 바꿀지 외부 명세/검증된 raw header가 선행한다. VV와 정상 clear/결측의 서로 다른 소비는 실행 확인했다. 첫 임시 script는 nullable cell 접근으로 실패했고 harness만 바로잡아 종료0; 앱 결함으로 집계하지 않았다.
- **제안·범위·효과:** 관측 ceiling 값/상태와 단위 변환 책임을 하나의 검토 가능한 계약으로 정한다. AMOS panel/브리핑/지도와 METAR/TAF panel·비교의 최저 cloud·VV·NSC/결측을 맞춘다. **AMOS 단위 / 관측 cloud 선별을 독립 선정 가능**.
- **위험·선행:** 기존 snapshot·센서 sentinel·NSC/CAVOK·null=VFR 소비자가 영향을 받는다. 정상 무운과 자료 없음의 oracle을 먼저 정하고 normalized source부터 적용한다.
- **검증:** 같은 원문1건+null/상한/임계값 양쪽, VV only·unsorted BKN/OVC·base없음·NSC/CAVOK를 parser→두 화면/지도까지 비교. **P1 · 계약 확인 후 작업 추천**.

<a id="rf-129"></a>

### RF-129 · 모델 원자료 cache의 검증 실패 복구

- **문제·원인·근거:** `open-meteo.js:244-278`은 좌표/시간 대응 뒤 raw cache를 먼저 쓰고 단위·record 검증은 나중에 한다. cache 재사용은 envelope/시각 coverage만 확인하므로 같은 run의 단위 오류 자료가 계속 재검증되고 정상 수정 응답을 재요청하지 않을 조건이다. [W07-04](audit/W07.md). 실제 두 번 수집 재현은 미실행이며 마지막 정상 pointer는 보존된다.
- **제안·범위·효과:** 실패한 공항/window별 유효성·eviction 또는 validation-before-cache로 회복 가능성을 보장한다. 성공 sibling과 EC window 재사용은 유지한다. GFS/KIM의 다른 raw cache에 동일 문제가 있다고 확대하지 않는다.
- **위험·선행·검증:** 전체 cache 폐기는 외부 요청량을 늘린다. 동일 run 첫 오류→둘째 정상 fixture의 요청수/failed/정상 pointer, sibling 보존·peer window 이동·재시작을 확인한다. **P2 · 재현 후 작업 추천**.

<a id="rf-130"></a>

### RF-130 · 모델 비교의 성공 응답 내 partial 상태 표시

- **문제·원인·근거:** service는 last_collection_failed/손상 모델을 HTTP200 status/issues로 내고 view model도 보존하지만 Page/Summary는 query.error와 값 중심으로 표시한다. 4모델의 이전 정상 값이 남은 수집 실패에서는 설명이 보이지 않는다. [W07-05](audit/W07.md). missing 모델 행과 HTTP503 뒤 실패 안내는 이미 있어 유지한다.
- **제안·범위·효과:** 마지막 정상 값을 유지하며 source별 지연/부분 상태를 사용자가 해석할 수 있게 표시한다. 비교 Page/Summary/뷰모델의 소비 경계만 대상으로 하고 정상 provenance의 null 모델을 임의 partial로 바꾸지 않는다.
- **위험·선행·검증:** 과도한 오류 배지와 generic _stale 정책 혼합 위험. API issue reason별 사용자 의미를 먼저 정한 뒤 4모델+last_collection_failed→성공 복구에서 값 보존·표시/해제를 확인한다. UI 재현은 미실행. **P2 · 작업 후보**.

<a id="rf-131"></a>

### RF-131 · 기관 경로 자료의 저장·발표 연결

- **문제·원인·근거:** 개인 저장 API는 `{id,name,savedAt,...snapshot}`을 내지만 `OrganizationDocument.jsx:62`는 `route.snapshot`을 자료 metadata로 보낸다. 서버는 v3 snapshot을 요구해 거절한다. 발표 뷰어는 route 자료를 원본 파일 URL로 보내지만 해당 종류에는 storage key가 없다. [W09-01/02](audit/W09.md).
- **재현:** `repro-organization.mjs/json`, 실제 validator+메모리 DB에 생산자의 flat shape를 전달하면400 `metadata.snapshot/v3_required`. UI 클릭/원본 HTTP404는 코드 확인만 했다. material KML 지도의 live/pinned 차이는 별도 제품 계약 질문이다.
- **제안·범위·효과:** 저장 경로 adapter를 명시하고 자료 종류별 발표 renderer를 연결해 현재 UI가 제공하는 경로 공유·발표를 사용할 수 있게 한다. 원본 파일이 있는 PDF/이미지의 exact version URL은 유지한다.
- **위험·선행·검증:** v3 저장 모델(RF-112)·기관 route identity(RF-136)와 같은 계약을 읽어야 한다. 임의 nested migration을 먼저 만들지 않는다. 개인 저장→기관 자료 만들기→발표→reload, KML/PDF/image/route의 버전·원본·권한·가용성을 확인. **P1 · 작업 추천**, 생성/발표를 작은 단계로 선정 가능.

<a id="rf-132"></a>

### RF-132 · 기관 발표·편집의 버전 충돌 복구

- **문제·원인·근거:** 서버 CAS는 정상이나 발표409 뒤 UI의 재준비는 현재 run.version을 다시 읽지 않아 재적용도 옛 version을 보낼 수 있다. 편집 session version도 초기 state에 남는다. [W09-03](audit/W09.md), `useOrganizationPresentation`, `BriefingsScreen`. 기관24개 브라우저 통과 fixture는 version을 검증하지 않아 이 경로의 증거가 아니다.
- **제안·범위·효과:** 충돌 때 최신 version을 조회하고 현재 draft/candidate와 명시적으로 조정하는 복구 상태를 둔다. 다중 창 사용자가 재시도 가능한 상태로 돌아오게 한다.
- **위험·선행·검증:** 최신 값을 자동 덮어쓰면 다른 사용자의 편집과 pinned 발표가 소실될 수 있다. 후보/적용 분리·immutable version·시작자 권한은 유지. 두 세션의 prepare/apply/edit/end 순서와409→재조회→검토→성공, 새 회차 전환을 실제 API 또는 version 검증 fixture로 확인한다. 재현 미실행. **P1 · 좁은 재현 후 작업 추천**.

<a id="rf-133"></a>

### RF-133 · 기관 권한 상실과 비동기 화면 수명

- **문제·원인·근거:** 일반 라운지는401/403/404에 자료를 비우지만 발표 polling은 오류를 삼켜 회원 자격 상실403 뒤 이전 비공개 자료가 남을 조건이다. prepare/apply/end와 session poll의 문맥 검사가 모두 같지 않고 sessionStorage run key에 user가 없다. [W09-04](audit/W09.md). 새 API 권한 우회가 확인된 것은 아니며 직접 로그아웃 정리는 존재한다.
- **제안·범위·효과:** 인증/권한 상실을 일시 통신 실패와 구분하고 user/org/session/run별 commit·표시 수명을 일치시킨다. 정상 일시 실패의 last-good 및 pinned 자료는 보존한다.
- **위험·선행·검증:** permission 오류와 transient503을 일괄 clear하면 발표 복원성이 손상된다. RF-132 복구 경계 및 A08 세션 정책이 입력이다. membership revoke→403, 지연 poll/end→기관·회차 전환, 사용자 교체/reload에서 화면·키·후속 navigation을 확인. 실제 브라우저 미재현. **P1 · 조건 재현 후 작업 추천**.

<a id="rf-134"></a>

### RF-134 · 기관 파일 게시와 실패 정리의 동시성

- **조건·근거:** 같은 hash 이미지 A가 원본 생성→thumbnail await, B가 원본 재사용→DB commit, A가 제목/DB 오류로 실패→createdPaths unlink이면 성공한 B의 파일을 지울 조건이다. 교체도 await 이후 version 재검사보다 version INSERT가 먼저라 같은 expectedVersion 경합이409 대신500일 수 있다. `materials.js:162-185,270-333`, [W09-05](audit/W09.md). **동시 요청 실행은 미검증 가설**이다.
- **제안·범위·효과:** 임시 root의 barrier 재현을 먼저 하고, 파일 채택/공유 참조/실패 청소와 transaction 내부 CAS의 책임을 정한다. 성공한 불변 자료 버전의 원본 보존과 의미 있는 충돌 응답이 목적이다.
- **위험·선행·검증:** unlink 제거만으로 해결하면 고아 파일 증가, process-local lock만으로는 재시작·다중 process 부족. 기존 storage key·백업 호환을 유지하는 안부터 검토한다. 동일 이미지 두 요청 중 하나 실패, 같은 version 교체, DB 참조 원본/thumbnail 및 과거 버전 bytes를 검증한다. **P1 · 추가 조사 추천**, 원인 확인 전 저장 형식 변경 선정 금지.

<a id="rf-135"></a>

### RF-135 · 기관 알림 복합 입력의 실패 원자성

- **문제·원인·재현:** `updateAlertState`는 acknowledged UPDATE 뒤 snoozeMinutes를 검증한다. 메모리 DB의 실제 함수에 `{expectedVersion:1,acknowledged:true,snoozeMinutes:0}` →400이지만 version2/acknowledged로 변했다. `repro-organization.json`, [W09-06](audit/W09.md), `repository.js:762`. 현재 UI는 두 body를 분리하므로 정상 클릭의 공통 장애로 과장하지 않는다.
- **제안·범위·효과:** 선택 필드를 모두 검증한 뒤 공동 확인과 개인 read/snooze 쓰기를 transaction으로 처리해 실패 응답의 무변경 의미를 보장한다.
- **위험·선행·검증:** 공동 ack와 개인 상태를 합치지 않고 version/changedSinceAcknowledgement 계약 유지. invalid composite 전후 모든 row 불변, valid composite 원자 반영, stale expectedVersion 무변경을 확인한다. **P2 · 범위가 작은 작업 후보**.

<a id="rf-136"></a>

### RF-136 · 기관 분석과 지도 경로의 정체성

- **문제·원인·재현:** 분석은 snapshot.routeGeometry, 지도는 flight.profileRequest.routeGeometry를 우선한다. 실제 createFlight+두 소비 helper에 정상 경로 A/B를 넣으면 version1로 저장되고 분석은 `[126,37]→[129,35]`, 지도는 `[126,37]→[128,34]`였다. `repro-organization.json`, [W09-07](audit/W09.md). 현재 실사용 자료의 발생률·정상 UI 생성 조건은 미확인.
- **제안·범위·효과:** API 입력·versioned flight·분석 bundle·지도에서 의도한 routeModel/geometry 원본을 정해 같은 비행의 위치·분석을 일치시킨다. RF-112의 모델 보존이 관련 계약이다.
- **위험·선행·검증:** base/대안/전체 profile/선택 en-route 구간의 의도적인 좌표 차이를 무조건 equality로 거부하면 안 된다. create/PATCH→exact version→candidate/apply/hydrate에서 경로선·분석·주석을 대조하며 불일치 입력 거부 또는 정규화 정책을 먼저 선택한다. **P1 · 원본 계약 확인 후 작업 추천**.

<a id="rf-137"></a>

### RF-137 · 터미널의 실황·fixture·부분 실패 경계

- **문제·원인·근거:** production route에서 flights 실패는 dated fixture로, 일부 날씨 실패는 fixture 필드로 돌아갈 수 있으나 footer는 실시간 운항정보로 고정된다. fixture 보존은 기존 테스트의 의도다. 자체60초8요청 poll은 mounted만 확인하고 bundle 전체를 교체해 부분 실패 last-good와 응답 세대 경계가 없다. [W08-02/04](audit/W08.md). 실제 장애 빈도·역순 응답은 미재현.
- **제안·범위·효과:** 입력을 fixture/usable snapshot/partial stale/unavailable로 구분하고 source·reference instant를 전달한다. 그 정책에 맞춰 요청 generation과 필드별 보존/validempty를 적용한다. **출처·실패 정책 / polling 세대 중 일부 선정 가능**.
- **위험·선행·검증:** 항상 채운 시연 화면과 실황 게시판의 요구를 먼저 정해야 한다. renderer/queue/dated test fixture는 유지. RF-100 및 RF-108/109와 계약을 공유하되 기존 hook의 race를 그대로 옮기지 않는다. flights503·유효[]·METAR-only503·unknown ICAO·A90초/B10초·unmount를 주고 값/출처/버전/요청수를 확인. **P1 · 운영 fallback 계약 확인 후 작업 추천**.

<a id="rf-138"></a>

### RF-138 · 터미널 편성 적용과 결측 숫자

- **문제·원인:** board cursor로만 next simulation 적용을 판단하지만 weather/rail은 별도 cursor를 전진시켜 새 편성이 멈출 조건이다. 별도로 AMOS null을 Number(null)=0으로 읽어 유효 METAR fallback을 막는다. [W08-03/05](audit/W08.md).
- **재현:** 실제 helper `repro-terminal.json`에서4frame/cursor1의 새 편성3회 모두old 유지, cursor0에서new. 부모의 rail 전환 연결은 정적 확인이며 브라우저 integration은 미실행. AMOS null+METAR25°C는 출발/목적지 모두0°C, 습도0%였다.
- **제안·범위·효과:** 활성 화면의 queue cycle과 최신 편 상태 반영을 분리하고, 숫자 변환은 null/빈문자열/진짜0을 구분한다. **편성 / 결측 숫자는 독립 선정 가능**. 화면별 queue·capacity·공동운항 규칙을 유지한다.
- **위험·선행·검증:** RF-137 source 정책과 gate/delay 즉시 갱신 의도가 입력이다. cursor1에서 rail→feed3회→board, frame 축소·autoplayoff·키보드 전환; AMOS null/undefined/''/'0'/0와 유효METAR를 검증한다. **P1 · 좁은 작업 추천**.

<a id="rf-139"></a>

### RF-139 · 터미널 KST 기준과 운항일 경계

- **문제·근거:** 표제 clock은 explicit KST지만 nowKst는 OS local getters로 만들고 예보 date/hour 선택에 쓴다. HH:mm 운항/도착 anchor의 날짜 소실과 정시가 지난 지연편의 제외는 별도 정책 질문이다. [W08-06](audit/W08.md), `DestinationWeatherPage.jsx:360`, `terminalLiveData.js:210`.
- **제안·범위·효과:** 우선 동일 epoch의 KST 날짜/시간을 명시적으로 전달한다. 운항일·지연편·익일 도착 identity 확장은 실자료/표시 정책 확인 뒤 별도 선택한다. 해외 예보가 이미 KST로 변환됐다는 계약을 유지한다.
- **위험·선행·검증:** 현지시각과 출발/도착 날짜 이중 변환 위험. 같은 epoch의 Seoul/UTC/Los_Angeles 브라우저와 KST자정, 늦은출발/익일도착/저빈도공항을 비교. OS별 실제 브라우저는 미실행. **P2 · KST 입력 작업, 운항일 추가 조사 추천**.

<a id="rf-140"></a>

### RF-140 · 모니터링 경보의 시간 진행과 소리 수명

- **문제·근거:** alert effect는 data 변경으로 평가하지만 TAF lookahead/quiet hours/cooldown은 현재시각을 사용한다. 모든 hash가 같으면 시간 경계만 지난 상태를 늦게 판단할 조건이다. AlertSound의 반복 beep/preview timeout은 mode·설정·unmount에 취소되지 않는다. oscillator 자체 stop은 존재한다. [W08-07/08](audit/W08.md). 장시간/실제 오디오 재현 미실행.
- **제안·범위·효과:** 허용 시간 정밀도의 경계 평가와 alert batch별 sound 자원 소유를 명시한다. **평가 clock / sound cleanup 독립 선정 가능**. 비행장 경보와 사용자 임계 경보, 공항별 cooldown·firstFired·ground의 수동 preview 예외는 유지한다.
- **위험·선행·검증:** 단순 매초 deps 추가는 중복 발화, 모든 배열변경 cleanup은 beep 잘림을 만들 수 있다. 고정hash+quiet종료/lookahead진입/ground복귀/A→B→A, 첫beep직후음소거·전환·unmount·동시2알림을 제어 clock/AudioContext로 확인한다. **P2 · 좁은 재현 후 작업 추천**. 실제 소비가 사라진 monitoring groundOverview 구독은 W08-09의 저우선 선택 사항이며 backend 수집 제거 근거가 아니다.

<a id="rf-141"></a>

### RF-141 · 계정 상태 변경과 기존 세션의 권한

- **문제·근거:** 로그인은 현재 status를 검사하지만 requireAuth/requireRole은 세션에 복사된 userId/role·만료만 확인한다. admin reject는 DB status만 바꾸고 기존 세션/개인 감시는 회수하지 않는다. 기관 gate는 현재 userStatus를 검사한다. 로그인 SID regenerate도 없다. [W10-01](audit/W10.md), `auth/{router,middleware}.js`, `admin/router.js:76`. 실제 cookie 회수/악용은 미재현.
- **제안·범위·효과:** 계정 거절·역할 변경의 효력 시점을 정하고 인증 경계의 현재 상태 확인/세션 갱신을 맞춘다. 기관별 권한을 전역 role로 대체하지 않는다.
- **위험·선행·검증:** 기존 로그인 작업·감시·로그아웃 뒤 push 유지 정책과 DB 조회 비용을 검토. active로그인→reject→기존cookie 개인/admin/forecaster/기관, 재로그인SID, idle/absolute 만료를 각각 확인. **P1 · 권한 회수 정책 확인 후 작업 추천**.

<a id="rf-142"></a>

### RF-142 · 푸시 설정의 서버 성공과 계정 귀속

- **문제·근거:** `usePersonalSettings.js:58,71,92`는 browser subscription만으로 켜짐을 판정하고 등록/해지 HTTP status를 확인하지 않는다. DB는(user_id,endpoint)별, logout은 구독을 유지, SW는 현재 로그인과 무관하게 payload를 표시한다. [W10-02](audit/W10.md).401/500 false-on과 공유 브라우저의 이전 계정 메시지 경로는 코드 확인, 실제 push 전달 미실행.
- **제안·범위·효과:** permission/browser subscription/server association을 구분하고 서버 등록 실패의 재시도·상태 복구를 구현할 후보. 계정 전환의 endpoint 귀속은 별도 정책으로 선정 가능하다.
- **위험·선행·검증:** 개인 기기의 logout 중 수신 요구와 다중기기를 보존한다. 무조건unsubscribe하지 않는다. stub PushManager+등록201/401/500/throw, 재진입·AlogoutB·해지실패·410을 확인. URL/키 형식/구독 상한의 보안 영향은 추가 조사 범위다. **P1 · false-on 작업, 계정 수명 계약 확인 추천**.

<a id="rf-143"></a>

### RF-143 · 개인 감시 복제본의 시각·목록·종료 수명

- **문제·원인:** 감시 등록/PATCH는 새 ETD/ETA를 DB 컬럼에만 쓰고 GET routes/딥링크는 옛 payload 시각을 쓴다. kind=briefing 복제본이 일반 저장 목록·5개 상한에도 포함된다. 이력 FK 때문에 만료 DELETE가 실패하면 enabled/대기 표시와 snapshotCache가 남는다. [W10-03/04/07](audit/W10.md).
- **재현:** `repro-personal.mjs/json`, 메모리 DB+실제 HTTP routers+synthetic session. 감시201 뒤 scheduler는2030-01-02T10Z, 목록/재개 helper는01-01T10Z. 원본3+감시2가 목록/count5이며 네 번째 원본 저장400 too_many_briefings. 종료cache/ID재사용은 코드상 질문이고 메모리 증가 미측정.
- **제안·범위·효과:** 원본 템플릿과 독립 감시 복제본을 구분하는 조회/시각 projection·상한·종료 상태를 정한다. **시각 왕복 / 목록·상한 / 종료·cache는 단계별 선정 가능**. 새 테이블이나 migration을 먼저 강제하지 않는다.
- **위험·선행·검증:** alert_enabled=0만으로 일반/취소 감시를 구별할 수 없고 옛 알림 링크가 감시ID를 쓴다. 이력 보존·재개 기간·구형행 식별이 선행. T0저장→T1등록→T2지연→알림 재개,3+2상한, 복제연쇄·다른사용자·이력있는 만료/삭제·재등록을 확인. **P1 · 시각·목록 작업 추천, 종료 정책 확인**.

<a id="rf-144"></a>

### RF-144 · 개인 감시 ETA의 입력과 평가 범위

- **문제·근거:** 저장 v3는 tasKt, 등록 UI는 cruiseSpeedKt를 읽어 자동 ETA가 생성되지 않는다. null/invalid ETA는 목적지·교체 TAF를 미평가 후 false로 만든다. 출발지·경로 SIGMET은 별도다. [W10-05](audit/W10.md).
- **재현:** 실제 alerts HTTP에 eta='invalid' POST201/PATCH200, DB에도invalid 저장(`repro-personal.json`). UI 자동계산과3공항 상태 연결은 정적 확인이며 전체 UI 재현 미실행.
- **제안·범위·효과:** 실제 tasKt에 ETA helper를 연결하고 등록/PATCH의 유한시각·순서·unavailable 정책을 맞춘다. 미평가를 정상으로 읽는 경로를 제한한다.
- **위험·선행·검증:** 수동 ETA를 자동값으로 덮지 않고 구형 speed·기하없는 템플릿을 처리해야 한다. 계산불가면 필수입력/출발지만 평가 중 계약을 선택. v3→등록→scheduler, null/invalid/ETA≤ETD/PATCH·수동값유지를 검증. **P1 · 작업 추천**.

<a id="rf-145"></a>

### RF-145 · 개인 알림의 감지와 전달·재발 정책

- **문제·근거:** 감지 시 DB/cache를 먼저 갱신하고 새 changes만 전송한다. 실패한 개인 delivery를 다시 조회하는 경로가 없고 alreadyFired가 같은 비행·조건 재발을 억제한다. 초기 baseline 무발화·비행당 한 번은 일부 기존 테스트의 의도다. 운영 알림은 성공 후 기록해 재시도가 이미 있어 다르다. [W10-08/09](audit/W10.md).
- **제안·범위·효과:** **전달 실패 복구 / unknown·재발 의미**를 따로 선정한다. 채널·구독별 성공 단위/재시도 유효기간/timeout을 정의하고, 자료 회복·minima변경·기상재발을 어떻게 알릴지 계약을 정한다. 새 queue 라이브러리/채널 계층 전면 도입 근거는 없다.
- **위험·선행·검증:** 성공 구독 중복 전송·알림 피로도·process restart baseline을 고려. fake sender500/무응답·2구독1성공·저장후재시작·겹친tick, good→unknown→bad/회복재발/minima변경을 확인. 실제 외부 발송·재현 미실행. **P1 · 실패 전달 추가 조사 후 작업, 재발 정책 확인 추천**.

<a id="rf-146"></a>

### RF-146 · 개인 사용자 상태와 알림 딥링크 수명

- **문제·근거:** 초기 me reject는 loading을 끝내지 않고 개인 hook은 user 변경/401/지연 응답에 같은 수명 검사를 하지 않는다. markRead는 이미 읽은 행도 count감소·HTTP미확인, 이동은 완료를 기다리지 않는다. App은 auth/map 준비 전에 flight URL을 소비하며 ChangeStrip은 모듈 초기 ID를 사용한다. [W10-10](audit/W10.md), [W04](audit/W04.md).
- **제안·범위·효과:** user/context별 commit guard와 인증 실패 전파, 읽음 성공/reload, 준비 후 딥링크 intent 소비·현재 브리핑 ID를 연결한다. **인증·개인 hook / 읽음 / 딥링크 각각 선정 가능**. 같은 사용자의 transient 실패에는 usable 자료를 유지한다.
- **위험·선행·검증:** guest local fallback·오프라인·로그인 전 push 진입의 목적지 보존을 먼저 정한다. RF-108과 race 개념은 공유하되 파일 소유가 다르다. A응답지연→B로그인, me reject/401, 이미읽음·navigation, 로그인전flight→로그인→map준비·A→B브리핑으로 확인. 실제 browser 재현 미실행. **P1 · 좁은 재현 후 작업 추천**.

<a id="rf-147"></a>

### RF-147 · 날짜 입력과 선택 시간대의 일치

- **문제·근거:** 개인 datetime-local helper는 OS local인데 화면은 TZ를 명시하지 않고 전역 UTC/KST 선택을 따른 것처럼 읽힌다. Account 저장시각은 Z 고정, 기관 목록 날짜는 ISO slice라 선택TZ 날짜와 다를 수 있다. [W10-06](audit/W10.md), [W09-08](audit/W09.md). 원문 발행시각과 외부 Telegram Z 고정은 별도 의미다.
- **제안·범위·효과:** UTC 저장을 유지하며 입력 TZ와 화면 formatter의 계약을 명시한다. 개인 입력과 기관 목록 표시는 독립 선택 가능. RF-118의 판정 now, RF-139의 고정KST와 구별한다.
- **위험·선행·검증:** 익숙한 local 입력의 의미 변경과 자정 날짜를 주의. OS UTC/Seoul×선택UTC/KST×자정에서 입력→저장→목록 왕복을 확인한다. 실제 TZ matrix 미실행. **P2 · 계약 확인 후 작업 추천**.

<a id="rf-148"></a>

### RF-148 · 예보관 문의의 두 단계 저장·재시도

- **문제·근거:** 매 제출마다 route 저장 뒤 requests INSERT, 두 단계 실패에 저장ID 재사용/idempotency가 없다. 문의 FK가 있는 route DELETE는 실패할 수 있고 network 예외의 guest fallback은 서버 저장과 로컬 복사를 만들 조건이다. [W10-12](audit/W10.md), `ForecasterInquiry.jsx:31`, `me/requests.js:32`. 단일 클릭 sending guard·사용자/공항 권한은 존재한다.
- **제안·범위·효과:** 동일 intent의 저장ID·실패 재시도와 문의 보존/원본삭제 오류 계약을 정한다. 정상적인 새 문의와 응답 유실 재시도를 구별한다.
- **위험·선행·검증:** 예보관 문의 상태·보존 요구(A09) 및 개인 저장 위치 계약이 선행. route201→request500→retry, request201응답유실, 문의 참조routeDELETE·401·네트워크 fallback을 확인. 실행 미검증. 예보관 backend는 계획된 frontend 소비가 남은 확장점이며, W11-12의 claim 인계/closed 재개·문의 당시 고정본 의미는 별도 계약 확인으로 둔다. **P2 · 좁은 재현 후 작업 후보**.

<a id="rf-149"></a>

### RF-149 · 실제 계정·설정 동작과 사용자 안내

- **문제·근거:** minima 기본값은1500ft지만 안내는1000ft, 승인제 가입201 뒤 즉시 login은 정상 pending을 오류처럼 표시한다. English 저장값의 실제 번역 소비자는 찾지 못했다. [W10-11](audit/W10.md), [W04-05](audit/W04.md). 현재 제한 상수와 정상 알림 문구는 일치한다.
- **제안·범위·효과:** 현 minima·승인제를 유지하고 안내·가입 완료 상태·언어 선택의 실제 지원 범위를 맞춘다. **각 항목 독립 선정 가능**, 번역 기능 신설은 이 정리의 자동 범위가 아니다.
- **위험·선행·검증:** 부분 minima 기본값·언어 로드맵을 확인하고 null/부분설정 안내↔1500경계, 가입201→pending, 실제language소비를 확인한다. 작은 문구만 바꾸면 구현을 복제한 영구 테스트를 추가하지 않는다. **P2 · 안내 정합성 작업, 언어는 보류 추천**.

<a id="rf-150"></a>

### RF-150 · 일반 수집의 게시·실패·조회 경계 후속

서로 다른 다음 네 부분은 **각각 추가 조사/보류로 선택**한다. [W03-03/04/05/07](audit/W03.md)에 생산자·소비자·필요 fixture를 상세히 적었다. RF-100/101/102/105의 재현을 이 범위의 검증으로 확대하지 않는다.

| 부분 | 사실·조건부 영향 / 제안·효과 | 위험·선행 / 검증 |
| --- | --- | --- |
| 파서null·전체실패 | METAR/TAF parse-null이 failedAirport가 아니어서 이전값이 빠질 조건, environment 전체실패→null. 실패·정상empty 게시 계약을 정해 last-good 의미 보장 | 실제 upstream 입력 종류 먼저 확인. 정상empty/parse-null/부분실패/전체실패→latest·API·화면. 일괄 null 보존은 정상 clear를 막을 수 있음 |
| 파일 게시 | 일반 latest/일부meta 직접 덮어쓰기의 중단 시 손상 위험. atomic file publish 범위 검토 | JS 동기 write 내부 interleaving을 주장하지 않음. 강제중단·손상·재시작 임시root 재현, 파일 하나/asset+meta/run 전체 원자성 구별 |
| stale와hash | stale 변경이 content hash에 빠져 메모리·디스크·재조회 의미가 달라질 조건. actual UI _stale 소비자 미확인 | 소비자가 필요한 freshness 의미부터 정함. payload동일·stale만변경→API/restart/hash, 전체 자료 폭풍 재조회 위험 |
| 조회 외부호출 | ADS-B/callsign은 예약 수집off와 별개 온디맨드 호출·cache. 시연 ADS-B live는 의도 | 네트워크 차단 기준선의 endpoint stub 필요. GET중복/timeout/TTL/키상한·실행mode를 좁게 측정; globaloff로 production traffic까지 끊지 않음 |

**P2 · 추가 조사 추천**. 파일 크기·cache 존재만으로 전면 저장계층 재작성이나 모든 API 공통화를 권고하지 않는다.

<a id="rf-151"></a>

### RF-151 · 도구·설치·문서의 실제 실행 계약

다음 부분은 독립 선택 가능하며, 공통 목적은 새 환경과 운영자가 명령의 보장 범위를 알게 하는 것이다. [W02-03/04/05/08/09](audit/W02.md), [공통 A15](audit/common.md).

| 부분 | 근거·제안·효과 | 위험·선행·검증 / 추천 |
| --- | --- | --- |
| 개발 readiness | HTTP200을 시작한 child identity와 연결하지 않아 기존 포트 응답을 새 서버 준비로 오인할 가설. 프로세스/포트 소유 확인 경계 | 다른 앱이3001/5173 점유한 임시 환경에서 launch/verify/cleanup 확인. 사람 서버 종료 금지, 실제 충돌 재현 미실행 / P2 추가 조사 |
| 설치 범위 | bootstrap Chromium 중심과 WebKit matrix·선택Python의 설치 계약 차이. 어떤 검사까지 가능한지 명시 | fresh clone·기본/선택 검증의 설치 재현 필요. 전부기본설치로 시간·용량 확대하지 않음 / P2 작업 후보 |
| root dependency | root UI dependency/file:.. link 소비 미발견 범위, Turf/concurrently 실제 소비 존재. isolated clean install/build로 축소 가능성 판단 | 현재설치/배포 full 필요·lock/link 영향. 검색미발견만 삭제하지 않음 / P3 추가 조사·보류 |
| 수동 도구 경계 | backend/scripts/audit-terminal 두 도구가 frontend JS를 import. root 도구 소유 또는 명시 예외 정리 | 실제 terminal fixture/로고 소비 유지, command/import 경계 확인. 런타임backend는0건과 구별 / P3 작업 후보 |
| 문서 정합성 | cache no-store/ETag, root shared 검사, TAF/model ceiling, collector 주기·시연 구형설명 차이 | 현행코드가 모두 옳다고 문서만 덮지 않고 해당후보의 계약 판정 뒤 정본 갱신. AGENTS/CLAUDE동일 유지 / P2 선정 작업과 함께 |

<a id="rf-152"></a>

### RF-152 · 실제 화면에서 사용하는 미정의 CSS 변수

- **근거·원인:** 기관 선택 `--accent-soft`, WISSDOM disabled `--border-2/--surface-2`, route confirm `--border-strong`, monitoring `--panel`은 현재 frontend 선언과 이름이 맞지 않고 fallback이 없다. [W12-01](audit/W12.md). 다른 선택 표시·border가 존재하므로 선택 상태 전체 소실로 단정하지 않는다. 외부 runtime 주입/computed 결과 미검증.
- **제안·범위·효과:** 각 의미를 기존 정본 token에 연결하고 실제 선택/비활성/배경을 맞춘다. WeatherLegends의 잘못된 문자열 기대도 함께 검토한다. 화면별 부분 선정 가능.
- **위험·선행·검증:** 새 색을 임의 추가하기 전에 intended token을 결정. 기관selected, WISSDOMdisabled, routeapply/cancel, monitoringlight/dark/hover의 computed style·대비를 Chromium/WebKit에서 확인. vendor/Fluent/JS변수를 구분 없는 전역 검사로 막지 않는다. **P2 · 표시 재현 후 작업 추천**.

<a id="rf-153"></a>

### RF-153 · 공유 WeatherIcon의 스타일 소유

- **문제·근거:** shared markup은 CSS를 import하지 않고 기본 img/강도overlay 규칙은 lazy monitoring legacy CSS에만 있다. 공항 METAR도 이 component를 쓰지만 자체CSS는 wrapper크기만 공급한다. [W12-02](audit/W12.md). WindBarb named export의 inline style은 별도다. 실제overflow크기는 미측정.
- **제안·범위·효과:** 공통 기본CSS를 shared component와 연결하고 monitoring 크기·theme는 feature에 둔다. 소비 화면의 숨은 import순서 의존을 제거할 후보이며 RF-124의 선행 입력이다.
- **위험·선행·검증:** legacyaccent·mini/card규격 유지. freshmain에서 clear/+RA/-SN/VC img/overlaybox와 monitoringops/ground 같은입력을 비교하고 URL별CSS 포함·alt표기를 확인. **P2 · 좁은 시각 재현 후 작업 추천**.

<a id="rf-154"></a>

### RF-154 · 모달·피커의 키보드와 포커스 계약

- **문제·근거:** Settings는dialog semantics/focus/Escape, Auth는trap/복귀/Escape가 빠진 구현이며 backbuttonhook은popstate만 처리한다. PickerField listbox의 연결·방향키도 별도다. Search/native기관dialog/non-modalMobileSheet에는 좋은 선례가 있다. [W12-04](audit/W12.md). 실제screenreader/키보드 결과는 미실행.
- **제안·범위·효과:** **Settings/Auth / Picker**를 별도 선정해 표면별focus 책임을 맞춘다. 키보드 사용자의 배경 이탈·닫기 후 포커스 소실을 줄일 후보다.
- **위험·선행·검증:** auth 바깥클릭 무시·settingsapply/save/cancel·history·지도non-modal조작을 유지. 모든sheet에trap을 넣지 않는다. 키보드open→Tab/ShiftTab→Escape/X→trigger복귀, 중첩portal과picker0/1/N을Chromium/WebKit에서 확인. **P2 · 동작 재현 후 작업 추천**.

<a id="rf-155"></a>

### RF-155 · 화면 크기 변경과 TAF 표시·safe-area

- **관찰·근거:** TAF는 최초 matchMedia로 view/compact를 정한 뒤 갱신하지 않지만 CSS는 resize에 반응한다. MobileTaskBar의 60px 안에 safe-area와 44px 버튼이 함께 들어가는 조건은 별도 iOS PWA 가설이다. [W12-05](audit/W12.md). 현재 viewport 검사로 회전/PWA의 실패를 확정하지 않는다.
- **제안·범위·효과:** 필요한 구조 분기만 현재 크기에 맞추거나 사용자 고정 view의 의도를 명시한다. safe-area는 실기기 조건 확인 뒤 별도 선정한다. 의도한 정보 밀도와 버튼 접근성을 보장하는 목적이다.
- **위험·선행·검증:** 사용자 선택 view를 resize마다 초기화하지 않는다. 719↔720/1279↔1280·iPad 회전/분할 화면·forceCompact, 홈 화면 설치 inset에서 TAF 잘림/터치 영역/지도 크기를 확인한다. **P2 · 추가 조사 추천**.

<a id="rf-156"></a>

### RF-156 · 디자인 정본과 자산 출처·배포 고지

- **사실·근거:** 디자인 정책의 Pretendard와 실제 Wanted 기본·전광판 폰트는 fonts 문서의 보존 계약과 차이가 있다. 공항 root gradient/blur는 실제 사용 중이다. BasMilius MIT 원문은 있지만 현재 dist에서 고지 텍스트를 찾지 못했고, FIR는 metadata/Mapbox attribution 전달이 있다. 기타 로고/배너/공항 샘플의 원본 권리 및 외부 직접 URL 소비는 미확인이다. [W12-06/07](audit/W12.md).
- **제안·범위·효과:** **디자인 정본 / 배포 고지·출처 원장 / 미참조 자산**을 독립 선정한다. 실제 제품 의도·허용 테마와 원본/생성기/공개 고지를 연결해 향후 갱신 근거를 보존한다. 로컬 추적 결과이며 법적 적합성/위반 판정이 아니다.
- **위험·선행·검증:** 이미 완료된 폰트 최적화·벤더 SVG gradient·동적 symbol/glyph를 유지한다. 원본·고지의 최종 배포 경로와 실제 attribution, 직접 URL/접근 로그/prototype 참조를 확인한 뒤에만 삭제 후보로 선정한다. 배경/폰트 변경은 줄바꿈·대비·지도 합성의 시각 비교가 필요하며 성능 개선율은 미확인이다. **P3 · 정본·출처 추가 조사, 일괄 삭제/폰트 재최적화 제외 추천**.

<a id="rf-157"></a>

### RF-157 · 테스트 변경 API와 수집·운영 시연의 분리

- **문제·조건·근거:** `server.js:257,278`은 NODE_ENV!=test와 DISABLE_COLLECTION truthy만으로 dev router를 등록한다. `/api/dev/role`은 requireAuth만 거쳐 사용자 DB·세션 역할을 변경한다. 따라서 **production+해당 플래그**에서도 일반 로그인 사용자의 역할 변경 경로가 등록될 코드 조건이다. 실제 운영 플래그·공격 발생은 미확인. AUTO_ADMIN_LOGIN은 별도 production 차단이 있어 혼동하지 않는다. [W11-01/02/04](audit/W11.md).
- **인접 경계:** 운영 admin 모달은 정상 시연과 미등록 dev 기능을 같이 표시한다. test overlay는 해외 cache까지 바꾸지만 reset은 일부 국내 타입·live root만 읽으며 직접 tick은 실제시각·전체사용자·실제 sender 경로다. 이것들의 실제 오염/발송은 실행하지 않았다.
- **제안·범위·효과:** **서버 test mutation gate / UI capability / overlay·reset·tick**을 단계별 선정한다. 명시적 테스트 모드·격리 DB·non-production 조건을 수집 여부와 분리하고 테스트의 view/clock/대상/sender를 한정한다. 운영 admin 시연과 실제 평가 엔진의 재사용은 유지한다.
- **위험·선행·검증:** UI 숨김은 서버 권한을 대체하지 않는다. 기존 1인 테스트 runner·역할 전환·운영 시연 계약을 먼저 정한다. 별도 DB에서 production/development/test×flag없음/1/0×익명/pilot/admin의 actual mount와 응답, 국내/해외 주입→reset·demo·누락원본·mock sender를 확인. **P1 · 서버 실행 경계 우선 작업 추천**, 운영 조작 없이 검증한다.

<a id="rf-158"></a>

### RF-158 · 관리자 조회 실패와 마지막 정상 상태

- **문제·근거:** AdminShell은 성공 payload만 갱신하고 실패 상태를 남기지 않으며 range/granularity 응답 세대도 검사하지 않는다. topSignals는 미적재 null을0문제로 만든다. 실제 helper `repro-admin.json`에서 health/server null → 자료·수집·API·서버 모두tone ok. [W11-03](audit/W11.md). 지연HTTP/만료후화면은 미재현.
- **제안·범위·효과:** usable payload를 유지하면서 조회 상태·마지막 성공시각·request key를 분리하고 현재 세대만 commit한다. 초기 미확인과 최근 성공 뒤 조회실패를 운영자가 구별할 수 있게 한다.
- **위험·선행·검증:** Promise.all로 바꾸거나 모든 오류에 clear하면 부분 성공/복원성을 잃는다.401/403/5xx와 range별 자료 계약을 정한 뒤 첫실패·정상→실패·A10초/B1초·unmount에서 색/문구/시각/최종자료를 확인. **P1 · 좁은 작업 추천**.

<a id="rf-159"></a>

### RF-159 · 시연 snapshot 이름과 활성 세대

- **문제·조건·근거:** 자동 이름은 drain await 전에 정하고 capture는 start/stop exclusive 밖이다. save는 같은 이름 디렉터리를 교체하며 active same-name은 metadata를 다시 읽지 않는다. 동시 capture 이름 충돌 또는 active 이름 overwrite에서 파일과 view revision/referenceTime이 다른 세대가 될 가설이다. [W11-05](audit/W11.md). 실제 동시성·overwrite는 미실행.
- **제안·범위·효과:** 이름 할당·게시·활성 세대의 불변성을 하나의 경계에서 보장하거나 active/기존 이름 overwrite를 거부하는 안을 비교한다. 준비 검사한 그 세대를 소비하게 한다.
- **위험·선행·검증:** staging/rollback·active symlink는 유지하고 외부 repair/기존 이름 재사용 요구를 확인한다. 변경은 cache/목록/restore 호환에 영향. 임시root+drain barrier로 동시capture, active overwrite, 같은이름재시작, publish실패 rollback을 검증. **P1 · 추가 조사 추천**.

<a id="rf-160"></a>

### RF-160 · 운영 상태의 원본·이벤트 수·평가 대상

다음 세 부분은 독립 선정 가능하다. [W11-06/07/08](audit/W11.md), W03의 실패 결과를 성공 통계로 읽는 경계(W03-08)도 이 계약과 함께 다룬다.

| 부분 | 사실·근거와 제안·효과 | 위험·선행·검증 |
| --- | --- | --- |
| 자료 health | active 내용+live stats+실제 now를 결합하고 last_success 우선. 야간quiet은 sun을 받지 않는 실제 호출에서 적용되지 않음. live수집/active표시의 source·revision·시각을 명시 | 수집성공/content변경/사용가능은 별개. 모든now를demo로 바꾸면 실제 장애를 숨김. live성공+과거demo/실패+usabledemo/중지flag·sun유무와 mockops 판단 비교 |
| 이벤트 건수 | 실제 readDataHealth에 nationwide strikes0·공항2 입력→activeCount2(`repro-admin.json`). UI는 N건발효로 표시. 타입별count/unit/coverage 의미를 정함 | 여러 공항의 같은strike 중복 합산 금지. 무낙뢰·겹치는1strike·partialcoverage·null·다른warning/typhoon을 대조 |
| 감시 대상 | admin watching은 시간창만, scheduler는 사용자당1개 선택·demo중자동중지. 등록/창/실제선택/중지·마지막평가를 분리 | 운영 목록에서 창밖/종료를 지우지 않음. RF-143/145의 정책 입력, 한사용자겹친2건+다른사용자·demo·구독0·ETD경계 검증 |

**P1 · 의미 계약을 확정한 부분부터 작업 추천**. 오알림 빈도나 실제 운영 장애는 측정하지 않았으며 공개 health의 HTTP liveness와 이 지표를 합치지 않는다.

<a id="rf-161"></a>

### RF-161 · 백업 완료 판정과 이전 성공본 보존

- **문제·원인·근거:** 같은 분 backup target을 먼저 지우고 VACUUM 뒤 첨부/manifest를 쓴다. list/today/UI는 DB 파일명·mtime만 사용한다. `repro-admin.json`의 임시 `.db`는 유효SQLite도manifest도 아닌데 hasBackupToday=true/latest로 나왔다. 실제 프로세스 중단·운영 손실은 미관측. [W11-09](audit/W11.md).
- **제안·범위·효과:** DB+참조assets+manifest 완료 후 한 세대로 게시하고 목록/일일dedup/UI가 완료 단위를 보게 한다. 마지막 실패와 마지막 성공을 분리해 새 실패에도 이전 성공본을 유지한다.
- **위험·선행·검증:** VACUUM 일관DB·해당DB 참조첨부·SHA검증·keep7 동반삭제·새경로 복원은 유지한다. 파일명/restore/외부보관 호환과 같은분재저장 의도를 확인한다. 임시DB의 VACUUM후/manifest전/게시직전 fault, 같은분재실패·재시작·보관정리·무결성실패/기존대상복원거부를 확인. **P1 · 게시 경계 추가 재현 후 작업 추천**.

<a id="rf-162"></a>

### RF-162 · 운영 자원·기간·시간대 지표의 의미

- **사실·근거:** cpuPct는 CPU 사용률이 아니라 loadavg 1분/논리 CPU×100에 상한을 적용한 값이다. disk는 `/`의 용량이며 data volume과 다를 수 있고 statfs 실패는0/0이다. admin은 선택 TimeZoneProvider 밖이며 local/KST가 섞이고 공유 range7d에 Overview의24시간 라벨이 남을 수 있다. visits의 UTC 일별 unique/KST 요청수·90일 보존/약6개월 신규 추세도 서로 다른 모수다. [W11-10/11](audit/W11.md).
- **제안·범위·효과:** **자원 단위·unknown / 기간·TZ / 방문 집계**를 독립 선정한다. metric source·validity·집계단위를 응답/라벨과 맞춰 운영 판단을 정확히 한다. 현재60초/7일 제한과 간단한 disk cache는 유지한다.
- **위험·선행·검증:** 새 측정식과 과거 cpu_pct를 표식 없이 섞지 않는다. business day·방문 모수 변경은 formatter 교체와 다르게 과거 자료 재해석이 필요하다. mock load/statfs 실패/다른 volume, UTC/KST·비KST OS·1h→7d→Overview,90일 비방문·주/월 경계를 검증한다. 실VM·원본 방문자료·실제 부하는 미측정이다. **P2 · 의미 확정 후 작업 후보**.

## 유지·보류·제외 추천과 선택 기록

| 구분 | 대상과 이유 | 다시 검토할 조건 |
| --- | --- | --- |
| 유지 | 기능별 adapter, root route/NWP 모델, 기관 ACL·CAS·pinned version·exact map resource, provider별 검증과 last-good, 제한된 worker/queue/cache | 선정한 후보가 이 계약을 건드릴 때 관련 검증만 확장 |
| 유지 | 현재 monitoring legacy·classic/signage, terminal queue/transition, 실제 순수/HTTP/브라우저 검사, 배포 lock/staging | 실제 소비/설계가 바뀌거나 구체적 회귀가 확인될 때 |
| 유지·완료 개선 | Wanted 자체호스팅·선택 lazy/dedup, Pretendard 생성·고지, 모델 provenance·검증 경계 | 새 요구나 동일 조건의 성능 회귀가 생길 때 |
| 보류 추천 | RF-120 DEV KML 확대, RF-151 의존성 축소, RF-156 미참조 자산 정리·디자인 정본, RF-149 언어 기능 | 실제 사용 요구·원본·동적/직접 URL 소비·제품 의도가 확인될 때 |
| 제외 추천 | 크기만으로 server.js/MapView/useRouteBriefing 전면 분리, legacy/프로토타입 일괄 삭제, 폰트 최적화 재실행, provider/TAF 규칙 기계적 통합 | 구체적 변경 비용·실제 결함·측정 이득이 새로 입증될 때 |
| 추가 조사 | RF-106 nginx runtime, RF-126 지도 retainer, RF-134 파일 경합, RF-150 게시/소스 경계, RF-155 실기기, RF-159 snapshot 경합 | 해당 후속의 재현 환경과 사용자 선정이 있을 때 |

현재 모든 카드의 사용자 선택은 **미선정**이다. 사용자는 ID별로 `이번에 작업 / 보류 / 제외 / 추가 조사`와 카드 안의 일부 범위를 선택할 수 있다. 선택 내용·지시 날짜·선행 작업 포함 여부·실행 순서는 [tasks의 선정 기록](tasks.md#rf-004-진단-보고와-사용자-선정)에 반영한다. 보고서 작성이나 P1 추천은 구현 지시가 아니다. 다음 세션에서 동일 조사를 처음부터 반복하지 않는다.
