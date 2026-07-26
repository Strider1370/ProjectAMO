# NOTAM 위치 결정과 발효 시간 판정 Status

Updated: 2026-07-26 15:14 KST
Branch: `agent/notam-geometry`
Spec: `docs/superpowers/specs/2026-07-26-notam-geometry-and-schedule-design.md`
Plan: `docs/superpowers/plans/2026-07-26-notam-geometry-and-schedule.md` (8과제 47단계)

## Resume Point

- 마지막 완료: 계획 검토(reviewer) 지적 반영, 커밋 `3815774`. **코드는 아직 시작 전.**
- 다음: Task 1 — `backend/src/notam/notam-position-text.js` (E) 본문에서 문형과 좌표 읽기)
- 실행 방식: `superpowers:subagent-driven-development`, 과제마다 서브에이전트 + 사이 검토

## 커밋

```
3815774  계획 검토 반영 (껍데기 테스트, 안전 경로 결함)
4662a4d  구현 계획
915ac88  설계 스펙 + 정답표 415건 + KML 스냅샷
```

## 고정 자료 — 수정 금지

```
backend/test/fixtures/notam-2026-07-26.kml                   원본 415건 (2026-07-26 04:31Z)
backend/test/fixtures/notam-geometry-truth-2026-07-26.json   정답표 415건
```

파서를 안 본 상태에서 원문만 읽어 작성. 60건 독립 재작성 교차검증 59건 일치(98.3%). 작성 방법·신뢰도·`knownHard`가 파일 머리말에 있다.

계획의 문법 규칙을 이 정답표로 미리 채점한 결과: 문형 415/415, 좌표 개수 319/320, 반경·폭 236/237. 남는 오차는 `E3260/26`(반원+호) 하나로 수렴하며 Q줄 원 근사로 처리한다.

## 지키기로 한 것

- 정답표 대조(Task 2)를 구현보다 **먼저** 세운다. 나중에 만들면 짠 것에 맞춰 과녁을 그리게 된다.
- **개별 NOTAM 예외 분기로 점수를 올리지 않는다.** 규칙으로 설명 안 되는 건 `knownHard`에 근거를 적고 안전 경로로 보낸다.
- 위치를 못 정한 건을 조용히 빼지 않는다 (`positionStatus: 'unresolved'` + 화면 회색 줄). `route-briefing-source-contract.md` 요구사항.
- D) 해석 실패(`null`)는 발효 중으로 남긴다. 모른다고 꺼진 것으로 치면 경고가 사라진다.
- Q코드 → 분류 매핑(`SUBJECT_CATEGORY`)은 건드리지 않는다. 발행처가 불꽃놀이를 `WM`(사격)으로 낸 것은 우리가 고칠 대상이 아니다.
- `backend/test/notam-parser.test.js`(185줄, 기존)를 **덮어쓰지 않는다**. append만.

## 열린 항목

**`briefing-composer.js`의 두 번째 `matchRouteNotams` 호출** — NOTAM용(약 122행)과 상시 공역용(약 130행) 두 번 불린다. `conflict`에 `positionStatus === 'resolved'` 조건이 들어가므로, `airspaceZones` 자료에 `geometry`가 없으면 저촉이 조용히 사라진다. Task 5 Step 3b에서 확인한다. 문제가 있으면 범위 밖으로 빼되 **반드시 사용자에게 보고**한다.

## 측정된 사실 (요약)

전부 `notam-2026-07-26.kml` 415건 실측. 이 한 스냅샷 기준이며 자료가 바뀌면 다시 재야 한다.

| 사실 | 수치 |
| --- | --- |
| LineString이 경로 판정에서 누락 | 101건, 전부 저촉 대상 분류. 정중앙 관통 시험 **0/101 걸림** |
| KML 25각형 원 = Q줄을 그린 그림 | 중심 오차 중앙값 **0m**, 본문 좌표와는 650m |
| 활주로 윤곽 오배치 | 3건 (불꽃놀이). 출발 0.13NM에서 진입, 계획고도 78ft가 SFC–200ft와 겹쳐 저촉 성립 |
| 본문 문형 | 원 222 · 다각형 85 · 회랑 15 · PSN+RADIUS 3 · 상설구역 38 · 위치서술없음 51 · 단일지점 1 |
| 줄바꿈으로 잘린 좌표 | 80건에서 84개 — 해석 전 공백 제거 필수 |
| D) 시간표 미반영 | 저촉 대상 353건 중 319건에 시간표, 그 319건 전부 유효기간 24시간 초과 |
| `C)PERM` 조용한 탈락 | 4건 |
| 도형이 KML과 달라지는 건 | 411건 중 317건 (92건은 종류까지). 상설구역 38·시설 50·단일지점 1은 그대로 유지 |

## 실측 0건인 안전 경로 (주의)

이 스냅샷에서 한 번도 실행되지 않는 경로다. 테스트로만 덮인다.

- Q줄 검산 거부: 0건
- 위치 확인 불가(`geometry: null`): 0건
- 닫히지 않은 KML LineString: 0건

동작하는지는 손으로 만든 픽스처로만 확인된다. 자료가 바뀌면 언젠가 실제로 지나간다.

## 검증

```bash
npm --prefix backend test
npm --prefix frontend test
npm run dev:contract -- --grep briefing-view
npm run dev:contract -- --grep moa-activation   # D) 시간표를 쓰는 기존 계약
```

브라우저로 보이는 동작은 Playwright 증거 없이 완료라고 하지 않는다.
