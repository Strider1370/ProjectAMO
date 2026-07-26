# Spec: 모니터링 데이터 수명주기 통합

**Status:** Approved
**Created:** 2026-07-23

## Problem / Goal

`/monitoring`과 메인 화면은 같은 백엔드 수집·저장·API를 사용하지만, 브라우저에서는 각각 초기 데이터 수신, 변경 확인, 변경분 병합을 따로 구현한다. 이 중복은 같은 API 계약이 두 곳에서 달라질 위험을 만든다.

모니터링의 사용자 화면은 그대로 두고, 두 화면이 같은 브라우저 데이터 수명주기(초기 수신 → 변경 확인 → 변경분 수신 → 기존 데이터 병합)를 사용하도록 한다. 모니터링은 계속 운항/지상 대시보드와 알림을 독립적으로 표시한다.

## Current System Baseline

### Shared backend boundary

백엔드는 이미 하나의 데이터 수명주기를 제공한다. 각 processor가 자료를 수집하고, `backend/src/store.js`가 최신 스냅샷과 content hash를 관리하며, `backend/server.js`가 같은 스냅샷을 자료별 API와 `/api/snapshot-meta`로 제공한다.

```text
외부 기상·항공 자료
  → backend processor / cron
  → backend store의 latest snapshot + content hash
  → 자료별 /api/* 및 /api/snapshot-meta
  → 메인 화면 또는 /monitoring
```

따라서 이 작업은 백엔드 통합이 아니다. collector, store, cron, API 응답은 이미 공통이며 변경하지 않는다.

### Current browser boundary

```text
메인 경로
  useWeatherPolling
  → loadWeatherData
  → 60초마다 snapshot-meta
  → 변경된 자료만 loadChangedWeatherData
  → MapView / AirportPanel / route briefing

/monitoring 경로
  MonitoringPage 자체 initialLoad / pollOnce
  → loadMonitoringData + monitoring 전용 선행 요청
  → 알림 설정의 poll_interval_seconds마다 snapshot-meta
  → 변경된 자료만 loadChangedMonitoringData
  → legacy 대시보드 / MonitoringMap / 알림
```

`App.jsx`는 `/monitoring`에서 `MainAppShell`을 마운트하지 않는다. 따라서 현재 두 polling loop가 동시에 실행되는 문제는 없으며, 전역 브라우저 store가 필요하지 않다. 문제는 동일한 수명주기 규칙이 두 구현에 복제돼 있다는 점이다.

### Data input inventory

| 자료 | 공통 백엔드 API / 자산 | 메인 수신 방식 | 모니터링 수신 방식 | 현재 출력 |
| --- | --- | --- | --- | --- |
| 공항 목록 | `/api/airports`, 해외 공항 JSON | 초기 수신 후 지도·검색·공항 패널 | 초기 수신; 국내 목록 중심 | 메인 지도/검색/공항 패널, 모니터링 공항 선택/지도 |
| 국내·해외 METAR | `/api/metar`, `/api/metar-overseas` | 초기 + 변경 시 | 초기 + 변경 시 | 공항 정보; 모니터링 현재날씨·알림. 해외 자료는 두 지도에서 병합 표시 |
| 국내·해외 TAF | `/api/taf`, `/api/taf-overseas` | 초기 + 변경 시 | 초기 + 변경 시 | 메인 공항/브리핑; 모니터링 TAF·알림은 국내 자료 사용 |
| AMOS·공항 경보 | `/api/amos`, `/api/warning` | 초기 + 변경 시 | 초기 + 변경 시 | 공항 상세·지도 경고; 모니터링 카드·경보 목록·알림 |
| SIGMET·AIRMET·낙뢰 | `/api/sigmet`, `-overseas`, `/api/airmet`, `/api/lightning` | 초기 + 변경 시 | 초기 + 변경 시 | 두 지도; 낙뢰는 모니터링 알림에도 사용 |
| 레이더·위성·SIGWX | radar/satellite 메타, SIGWX API와 메타 | 초기, SIGWX 이력은 필요 시 | 초기, SIGWX 이력·`/api/sigwx-low-fronts`·`/api/sigwx-low-clouds`도 즉시 | 두 지도 오버레이 |
| RainViewer | rainviewer 메타 | 초기 + 변경 시 | 초기 수신하나 변경 감지에는 포함하지 않음 | 메인 지도 오버레이. 모니터링은 현재 미표시 |
| 지상 예보·개황·환경 | `/api/ground-forecast`, `/api/ground-overview`, `/api/environment` | 예보는 초기, 나머지는 필요 시 | 모두 즉시 | 모니터링 지상 카드·시간별 예보·경보 목록 |
| 공항 정보·ADS-B | `/api/airport-info`, `/api/adsb` | 공항 정보는 탭 진입 시, ADS-B는 지도 레이어 활성 시 | 모두 즉시 선행 요청 | 공항 정보는 메인 공항 탭. ADS-B 지도는 `MapView`가 별도 요청 |
| NOTAM | `/api/notam` | 초기 수신 | 초기 수신하나 화면에 표시하지 않고 변경 감지에도 포함하지 않음 | 메인 지도·경로 브리핑만 |
| 이륙예보 | `/api/takeoff-fcst` | 브리핑 응답에서 사용 | 수신하지 않음 | 메인 경로 브리핑만 |
| KIM·KTG·비행범주 | KIM/KTG/flight-category API | 지도 레이어·클릭 시 | NWP는 비활성; 공통 MapView가 비행범주 확인 | 메인 수치예보/난류 레이어, 공통 지도 기능 |
| 경보 유형·알림 기본값 | `/api/warning-types`, `/api/alert-defaults` | 수신하지 않음 | 초기 수신 | 모니터링 경보 설명·알림 설정 |

모니터링은 초기 진입 시 공통 기본 묶음에 지연 자료 5종과 SIGWX 보조 메타를 더해 받는다. `loadMonitoringStaticData()`와 `loadMonitoringData()`가 병렬 실행돼 공항 목록과 경보 유형이 각각 두 번 요청되는 현재 동작도, 이 작업에서는 제거하지 않는다. 요청 수 절감은 별도 작업이다.

### Browser refresh inventory

| 항목 | 메인 | 모니터링 | 통합 후 불변 조건 |
| --- | --- | --- | --- |
| 기준 주기 | 고정 60초 | 사용자 알림 설정값, 기본 60초 | 각 화면의 현재 주기를 유지 |
| 변경 확인 | `/api/snapshot-meta` | 같은 API | 동일 API와 hash 계약 유지 |
| 변경분 수신 | 이미 요청한 지연 자료만 포함 | 즉시 받은 지연 자료까지 포함 | 화면별 수신 범위 유지 |
| 초기 수신 실패 | 콘솔 경고, 데이터 없음 | error overlay 표시 | 각 화면의 현재 사용자 노출 방식 유지 |
| 주기적 갱신 실패 | 마지막 정상 데이터 유지, 다음 주기 재시도 | 마지막 정상 데이터가 화면에 남고 다음 주기 재시도 | 두 화면 모두 마지막 정상 데이터 유지; 모니터링의 초기 error overlay와 혼동하지 않음 |
| 알림 | 없음 | METAR·TAF·경보·낙뢰 비교 후 출력 | 모니터링의 평가·쿨다운·출력 유지 |

공통 구현은 하나여야 하지만, 두 화면의 갱신 자료 목록까지 같아져서는 안 된다. 메인의 profile은 현재 사용하는 NOTAM·RainViewer와 지도 자료를 유지하고, 모니터링 profile은 현재 감지하는 METAR·TAF·경보·SIGWX·AMOS·낙뢰·지상 자료와 fronts/clouds 보조 메타를 유지한다. 모니터링이 초기에는 받지만 현재 변경 감지에서 제외하는 RainViewer·NOTAM은 이번 작업에서 새 갱신 대상으로 추가하지 않는다.

### Backend schedule inventory

| 자료군 | backend 수집 주기 | 이 작업에서의 처리 |
| --- | --- | --- |
| 국내·해외 METAR | 10분 | 변경 금지 |
| 국내·해외 TAF | 30분 | 변경 금지 |
| 경보·SIGMET·AIRMET·낙뢰·레이더 | 5분 | 변경 금지 |
| AMOS·RainViewer | 10분 | 변경 금지 |
| 위성 | 20분 | 변경 금지 |
| 저고도 SIGWX | 서버 로컬 시각 05:05, 11:05, 17:05, 23:05 | 변경 금지 |
| 지상 예보 | 서버 로컬 시각 06:30, 11:30, 18:30, 23:30 | 변경 금지 |
| 환경 | 매시 10분 | 변경 금지 |
| 공항 정보 | KST 06:00, 06:30, 17:00, 17:30 | 변경 금지 |
| 이륙예보 | KST 매시 08분 | 변경 금지 |
| NOTAM | 6시간 | 변경 금지 |
| ADS-B | cron 없음; 레이어 요청 시 최대 5분 간격 갱신 | 변경 금지 |
| KIM·KTG | 기존 UTC 발표 시각 cron | 변경 금지 |

### File ownership at the migration boundary

| 파일 | 현재 책임 | 이 스펙에서 유지할 책임 |
| --- | --- | --- |
| `frontend/src/app/useWeatherPolling.js` | 메인 초기 수신·변경 확인·지연 수신 | 공통 브라우저 데이터 수명주기 |
| `frontend/src/api/weatherApi.js` | 공통 API 요청·자료별 변경분 수신 | API 응답 형식과 공통 요청 경계 |
| `frontend/src/features/monitoring/MonitoringPage.jsx` | 모니터링 상태·자체 데이터 수신·알림·표시 조합 | 모니터링 상태·알림·표시 조합. 자체 polling 제거 대상 |
| `frontend/src/features/monitoring/monitoringApi.js` | 모니터링 데이터 조합 | 모니터링 고유 정적·선행 자료 요청 경계 |
| `frontend/src/features/monitoring/MonitoringMap.jsx` | 공통 MapView의 모니터링 래퍼 | 변경하지 않음 |
| `frontend/src/features/monitoring/legacy/*` | 모니터링 카드·알림·CSS | 변경하지 않음 |
| `backend/src/index.js`, `backend/src/store.js`, `backend/server.js` | 수집·저장·API | 변경하지 않음 |

## Requirements

- FR-001: 메인 화면과 `/monitoring`은 하나의 공통 브라우저 데이터 수명주기 구현을 사용해야 한다.
- FR-002: 메인 화면의 기본 60초 변경 확인 주기는 유지해야 한다.
- FR-003: 모니터링의 변경 확인 주기는 현재 알림 설정의 `poll_interval_seconds`를 계속 사용해야 하며, 기본값 60초와 사용자가 저장한 값을 유지해야 한다. 설정값이 없거나 0이면 현재 코드와 같이 30초를 사용해야 한다.
- FR-004: 모니터링은 현재 화면·알림에 필요한 초기 데이터 묶음을 계속 즉시 받을 수 있어야 한다. 여기에는 SIGWX 이력, 지상 개황, 환경 데이터, 공항 정보, ADS-B의 현재 선행 요청과 `/api/sigwx-low-fronts`·`/api/sigwx-low-clouds`의 초기 수신이 포함된다.
- FR-004a: `sigwxLow`, `sigwxFrontMeta`, `sigwxCloudMeta` 변경 뒤에는 모니터링의 fronts/clouds 보조 메타를 현재와 같이 다시 수신해야 한다.
- FR-005: 변경 확인은 기존 `/api/snapshot-meta`와 변경된 자료 API를 사용해야 한다. 새 백엔드 통합 API를 만들지 않는다.
- FR-005a: 공통 구현은 화면별 refresh profile을 받아야 한다. profile은 초기 수신 자료, 변경 감지 자료, 변경 뒤 다시 받을 자료를 분리해 정의하며, 메인과 모니터링의 현재 범위를 임의로 합치지 않는다.
- FR-005b: 공통 구현은 profile별 snapshot 전진 함수를 받아야 한다. 모니터링 profile은 현재처럼 `snapshot-meta` 응답, 성공한 변경분 데이터, 직전 snapshot을 함께 사용해 다음 snapshot을 계산해야 한다. 변경분 요청이 하나라도 실패하면 snapshot을 전진시키지 않아 다음 주기에 재시도해야 한다.
- FR-006: 주기적 데이터 갱신 실패 시 마지막으로 정상 수신한 데이터를 계속 표시하고 다음 예정 주기에 다시 확인해야 한다. 모니터링의 초기 수신 실패 시에는 현재 error overlay를 계속 표시해야 하며, 주기적 갱신 실패 때문에 새 error overlay를 표시하지 않아야 한다.
- FR-006a: 주기적 변경 요청에서 HTTP/network 실패는 기존 데이터를 보존하고 재시도해야 한다. HTTP 200으로 받은 JSON `null`은 현재와 같이 해당 자료의 정상적인 빈 값으로 취급하여 기존 값을 `null`로 교체한다.
- FR-007: 모니터링의 선택 공항, 운항/지상 모드, 알림 평가·쿨다운·팝업·소리·하단 메시지 동작은 유지해야 한다.
- FR-008: `/monitoring`, `/monitoring?mode=ops`, `/monitoring?mode=ground` URL과 직접 진입·새로고침 동작을 유지해야 한다.
- FR-009: 모니터링의 JSX 구조, CSS 클래스, 데스크톱·태블릿·휴대폰 레이아웃, 지도 위치와 레이어 진입 방식은 변경하지 않아야 한다.
- FR-010: 백엔드 수집기, cron 주기, 저장소 타입, 기존 API 응답 형식은 변경하지 않아야 한다.
- FR-011: 한 화면이 마운트된 동안 그 화면의 공통 데이터 수명주기 외에 같은 목적의 별도 polling loop가 실행되지 않아야 한다. 사용자가 ADS-B 레이어를 켰을 때 `MapView`가 수행하는 별도 ADS-B 갱신은 이 조건에서 제외한다.

## Non-Goals (out of scope)

- 모니터링 카드, 알림 설정, 운항/지상 모드, 지도 UX 또는 모바일 작업 탭의 재설계
- `/monitoring`을 메인 사이드바·공항 패널 레이아웃 안으로 시각적으로 합치기
- 백엔드 API, 수집 processor, cron, 저장소 또는 데이터 형식 변경
- NOTAM, 이륙예보, KIM/KTG 등 이번 통합과 무관한 기존 갱신 범위의 확장
- 현재 모니터링이 선행 요청하지만 화면에 직접 쓰지 않는 자료의 제거 또는 네트워크 최적화
- 전역 싱글턴 브라우저 저장소 도입. 두 경로는 동시에 마운트되지 않으므로 요구하지 않는다.

## Success Criteria

- SC-001: 메인과 모니터링이 공통 초기 수신·snapshot 비교·변경분 병합 코드를 사용하며, 모니터링 전용으로 중복된 polling 구현이 남아 있지 않다.
- SC-002: 모니터링 진입 뒤 운항/지상 전환, 공항 변경, METAR·TAF·경보·지상 정보 표시, 알림 설정과 알림 출력을 기존과 동일하게 사용할 수 있다.
- SC-003: 모니터링의 설정된 갱신 주기마다 `/api/snapshot-meta`를 한 번 확인하고, 변경된 자료만 다시 요청한다.
- SC-003a: 정상 변경분 수신 뒤 모니터링 snapshot은 현재의 server snapshot fallback 규칙으로 전진하며, 같은 hash를 다음 주기에 반복 수신하지 않는다. 부분 실패 뒤에는 snapshot이 전진하지 않아 실패한 모든 key를 다음 주기에 다시 요청한다.
- SC-004: 주기적 데이터 요청 또는 변경분 요청 실패 뒤에도 이미 보이던 모니터링 데이터와 선택 공항이 사라지지 않는다. 초기 수신 실패 시에는 기존 error overlay가 표시된다.
- SC-005: `npm.cmd run dev:contract -- --grep monitoring`이 데스크톱과 iPad Landscape에서 통과한다.
- SC-006: 고정 데이터 검증 환경에서 구현 전·후 모니터링의 ops, ground, 지도 레이어 패널, 설정 열린 상태를 desktop·iPad Landscape·mobile viewport으로 캡처하고, 허용 차이 0의 이미지 비교를 통과한다. 이 비교는 기존 baseline runner만으로 완료 처리하지 않으며, 해당 상태를 여는 결정적 Playwright 절차와 screenshot assertion을 포함한다.
- SC-007: 구현 변경에는 `backend/` 경로, backend API 계약, 수집 cron, 모니터링 JSX markup 또는 CSS selector·layout 변경이 포함되지 않는다.
- SC-008: 모니터링이 현재 즉시 받는 SIGWX 이력, fronts/clouds 보조 메타, 지상 개황, 환경, 공항 정보, ADS-B와 알림 설정 자료는 통합 뒤에도 같은 시점에 수신한다. SIGWX 관련 변경 때 fronts/clouds 보조 메타 재수신도 유지한다.
- SC-009: 자료별 backend cron과 `/api/snapshot-meta`의 hash 기반 변경 확인 계약은 구현 전후 동일하다. 저고도 SIGWX와 지상 예보 cron은 서버 로컬 시각 계약을 유지한다.
- SC-010: 자동화 검증은 초기 수신 실패와 두 key의 주기적 변경분 수신 실패를 각각 재현해, 초기 error overlay와 기존 데이터 유지·모든 실패 key의 다음 주기 재시도를 구분해 확인한다.

## Alternatives Considered

| Option | Trade-off | Why not chosen |
| --- | --- | --- |
| 현재처럼 두 화면이 각각 polling 구현을 유지 | 단기 변경이 없음 | API 키·변경 감지 범위가 계속 표류할 수 있다. |
| 새 백엔드 통합 endpoint를 만든다 | 프런트 요청 수를 묶을 수 있음 | 백엔드는 이미 공통 store와 snapshot API를 제공하며, 화면 변경 없는 통합에 불필요한 서버 변경이다. |
| 전역 싱글턴 브라우저 store를 만든다 | 향후 동시 화면 공유 가능 | 현재 라우팅상 메인과 모니터링은 동시에 마운트되지 않아 추가 상태 복잡성만 생긴다. |
| 공통 훅을 화면별 데이터·주기 설정으로 재사용 | 설정 가능한 경계가 필요함 | 선택됨. 기존 화면과 데이터 요구를 보존하면서 중복만 제거한다. |

## Open Questions

- 없음. 현재 모니터링의 선행 요청 범위와 사용자 설정 갱신 주기를 보존하는 것으로 범위를 확정한다.
