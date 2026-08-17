# 1단계 저장 경로 기하 — 상태

**계획:** [2026-08-17-saved-route-geometry.md](../plans/2026-08-17-saved-route-geometry.md) · **스펙:** [2026-08-17-saved-route-briefing-and-push-design.md](../specs/2026-08-17-saved-route-briefing-and-push-design.md)

**상태: 1단계 완료, 관문 통과.** 브랜치 `feat/saved-route-geometry`.

## 관문 결과 (2026-08-17)

일반 사용자 계정(`test`, role=pilot, 브라우저 UI)으로 실제 저장 → 비행 알림 등록 → 스케줄러 1회 평가.

```
감시창 안 활성 비행: [ { id: 2, etd: '2026-08-17T14:35:00Z' } ]
  route 2 buildBriefingRequest → { dep: 'RKSS', arr: 'RKPC', coords: 38, alt: 28000 }
runTick → { evaluated: 1, fired: 0, skipped: 0 }
```

**반사실 대조** — 같은 행에서 `routeGeometry`/`enrouteGeometry`만 제거하면 `buildBriefingRequest`가 `null`. 이번 변경 전이라면 이 비행은 조용히 건너뛰어졌다.

`fired: 0`은 정상이다. 첫 평가는 baseline(직전 스냅샷이 없어 비교 대상이 없음).

## 실제 저장 payload (RKSS → RKPC, IFR)

| 항목 | 값 |
|---|---|
| payload 크기 | **2,721 B** (상한 20,000 B) |
| `routeGeometry` 좌표 | 38 (절차 포함 최종선) |
| `enrouteGeometry` 좌표 | 11 (절차 제외 스켈레톤) |
| `airacCycle` | `2026-06-25` |
| `alternateAirport` | `null` (사용자가 미설정 — 예상된 값) |
| `base.routeForm` | `{flightRule: IFR, departureAirport: RKSS, entryFix: BULTI, exitFix: DOTOL, arrivalAirport: RKPC, routeType: ALL}` |

스펙 실측 추정(국내 단거리 IFR 둘 다 저장 시 2,175 B)과 같은 자릿수. 절차가 붙어 최종선(38)이 스켈레톤(11)보다 길고, 둘이 실제로 다르므로 이중 저장 판정이 의도대로 동작한다.

## 구현 커밋

| 커밋 | 내용 |
|---|---|
| `89509bc` | `loadNavdata()`가 `publicationId` 노출 |
| `fe802e7` | `routeSaveGeometry.js` — 저장용 기하 추출 (순수, 테스트 4건) |
| `6ff3f04` | `routeStore`가 새 최상위 필드 4종 보존 |
| `9727e04` | `buildBriefingRequest`가 `base.routeForm`을 읽음 |
| `5fd5f24` | 기하 없음으로 건너뛸 때 로그 + `skipped` 카운트 |
| `999ff48` | `handleSaveCurrentRoute`가 기하·AIRAC·교체공항 저장 |

테스트: 백엔드 836 통과(1 스킵 — 레이더 픽스처 없음, 기존), 프론트엔드 1376 통과, 프론트엔드 빌드 성공.

## 계획에서 벗어난 점

**스펙의 "백엔드는 손대지 않는다"는 틀렸다.** 구현 중 두 번째 계약 어긋남을 발견했다.

`buildBriefingRequest`는 `payload.routeForm`을 최상위에서 읽었으나 실제 저장 payload는 `payload.base.routeForm`이다. 그리고 `routes`의 `dep`/`dest`/`altn`/`rules` 컬럼은 저장(`me/routes.js:52`)·알림등록(`me/alerts.js:62`) 어느 쪽도 채우지 않아 폴백도 없었다. 기하만 저장해도 출발·도착 공항이 `null`이 되어 브리핑이 성립하지 않았다.

기존 테스트(`alert-scheduler.test.js`의 `mk()`)가 `dep`/`dest` 컬럼을 채운 가짜 행을 써서 이 어긋남을 가리고 있었다. `9727e04`에 실제 모양(컬럼 비움, `base.routeForm`) 테스트를 추가했고, 그 테스트는 수정 전 `null !== 'RKSI'`로 실패했다.

## 남은 위험

- **해외 IFR은 아직 검증되지 않았다.** 관문은 국내(RKSS → RKPC)로만 통과했다. 해외 IFR의 `No RNAV route path`는 2단계(재검색 제거)에서 다뤄진다.
- **옛 저장분 없음.** DB에 저장 경로가 0개였으므로 마이그레이션 부담이 없었다. 이제 새 방식 저장분만 존재한다.
- **`airacCycle`은 기록만 한다.** 화면에 쓰지 않는다. 오래된 경로 경고는 별도 작업.
- **`alternateAirport` 경로는 미검증.** 사용자가 교체공항을 설정한 경로로 저장해 본 적이 없다. 2단계 검증 시 포함할 것.
- 테스트용 계정 `test`/`test1234`(role=pilot, status=active)를 개발 DB에 만들었다. 배포 DB에는 없다.

## 다음

2단계 — 불러올 때 재검색하지 않기. 계획 미작성. 스펙의 "2단계" 절이 요구사항이다.
