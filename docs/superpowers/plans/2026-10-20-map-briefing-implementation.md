# 지도형 브리핑 구현 계획

- 작성: 2026-10-20
- 설계: [specs/2026-10-20-map-briefing-design.md](../specs/2026-10-20-map-briefing-design.md) (최종 시안 v8)
- 진행 기록: [status/2026-10-20-map-briefing.md](../status/2026-10-20-map-briefing.md)
- 상태: 계획 작성, 구현 전

## 0. 전제

### 보기 전환
- 폭 1280 이상: 브리핑 결과를 **지도형이 기본**으로 연다. 패널의 "문서형 보기"를 누르면 지금의 `BriefingView`가 그대로 뜨고, 문서형에서는 "지도형 보기"로 돌아온다.
- 폭 1280 미만(휴대폰 포함): 지금처럼 문서형만.
- 고른 보기는 브라우저에 기억한다(`localStorage`, 실패해도 기본값으로 동작).

### 코드 확인 후 정한 것 (2026-10-20, spec에 반영)
| 항목 | 시안 | 결정 | 이유 |
|---|---|---|---|
| 고도 슬라이더 | SFC~FL450 연속, 손잡이 = 순항고도 | 눈금은 FL로 표시, 위험 표시는 실제 고도 위치에 그림. 손잡이는 **가장 가까운 KIM 기압면**에 붙고 말풍선에 "FL250 → 지도 FL265(350hPa)"처럼 실제 그려지는 고도를 같이 적음. 브리핑 중에는 KIM 레이어가 꺼져 있어도 슬라이더를 보임 | 지도 KIM 레이어는 기압면 단계(…400·350hPa…)로만 그려짐 |
| 대류 모델 막대 | "MOD 대류영역 · FL250" | 대류영역(실험) 점수를 경로를 따라 뽑아 **0.5 이상 MOD, 0.75 이상 SEV**(지도 색 구간과 같음). 고도 없음 → 막대 라벨에 고도 대신 "전 고도", 슬라이더에는 태풍처럼 축 밖 "대류 · 전 고도" | ACI는 평면 자료(0~1 점수), 고도 구분 없음 |
| 시간 막대 | 범위 고정 + 움직이는 손잡이 | 지금 `TimelineRail`(가운데 손잡이 고정, 눈금이 흐름)을 그대로 쓰고 **ETD~ETA 창만 추가** | 조작법이 다른 화면과 같게 유지, 새로 만들 필요 없음 |

### 시안 검토에서 나온 작은 수정
- "단면 자료 없음" 상태에서 라벨 열이 좁아 "착빙"이 세로로 꺾임 → 상태 칩은 짧은 글("불가")로, 긴 설명은 툴팁.
- 접근 구간 위험의 구간 이름이 "RKPC → RKPC"로 나옴 → 이름 붙은 지점 사이가 아니면 가장 가까운 앞뒤 지점(TOD 포함)으로 "TOD → RKPC".
- 경로 끝 근처 짧은 막대의 글자가 잘림 → 글자를 막대 안쪽(왼쪽)으로 붙이고, 너무 짧으면 강도만.

### 다른 작업과의 관계
- 공항 카드의 TAF 표시는 아직 커밋하지 않은 TAF 개편 작업(`backend/src/parsers/taf-forecast.js` 등, 검토 대기)과 겹친다. **공항 카드(6단계)는 TAF 개편이 정리된 뒤** 시작한다. 그 전 단계들은 TAF 파일을 건드리지 않는다.
- F4(지금 시각 난류가 하루 전 예보) 원인 확인은 이 계획 밖. 막대를 눌러 켠 난류 레이어가 이 영향을 받으므로 3·4단계 확인 때 함께 본다.

## 1단계 — 총 거리 통일 (F3, 선행) — 완료 594ff465

**문제**: `shared/route-planning/routePlanner.js:420`(IFR 수동)·`:448`(VFR)·`:531`(자동)의 `totalDistanceNm`이 SID·STAR 대신 공항↔첫/끝 지점 직선을 쓴다. ETA는 이 값으로 계산된다(`useRouteBriefing.js:236` `plannedEtaDistanceNm`, IFR 브리핑 ETA `:2756`). 브리핑 생성용 `plannedDistanceNm`(`:2624`, `buildIfrDistanceBreakdown`)만 SID·STAR를 더해서 화면마다 값이 다르다.

**할 일**
1. 거리 하나를 계산하는 공용 함수: 경로 결과 + 선택된 SID·STAR(·IAP) → 총 거리. `buildIfrDistanceBreakdown`의 계산을 `shared/route-planning/`로 옮겨 프론트·백엔드가 같이 쓴다(백엔드는 프론트 코드를 import하지 않는다는 규칙 때문에 shared에 둔다).
2. ETA를 계산하는 모든 곳(`useRouteBriefing.js` 236·1246·1474·1481·1714·2183·2217·2225·2364, `planRoute.js` `buildAppliedRouteInputs`)이 이 값을 쓰게 한다. 절차가 아직 정해지지 않은 단계(경로 비교)는 해당 공항의 기본 SID·STAR 기준으로 계산하고, 그렇다고 표시한다.
3. 기상이(AI): `backend/src/ai/route-context.js`, `tools/plan-route.js`, `tools/get-route-briefing.js`가 같은 값을 쓰게 한다.

**확인**: RKSI→RKPC 자동 경로에서 경로 비교·브리핑 준비·NAVLOG 합계·기상이 답의 거리가 같음(시험 때 329.87NM), ETA = ETD + 거리/TAS. 단위 테스트(`routePlanner.*.test.js`, `routeBriefingModel.test.js`, `etaCalc.test.js`, AI 도구 테스트) 추가·갱신.

## 2단계 — 위험 막대 자료 (백엔드) — 완료

브리핑 응답에 `sections.enroute.ribbon`을 새로 넣는다. 화면은 이 값만 그린다(판정 로직을 프론트에 두지 않음).

1. **현상별 자료 유무**: `enroute-model.js` `summarizeEnrouteModel`이 현상마다 `status: 'found' | 'none' | 'unavailable'`을 내게 한다. 지금은 KIM은 있고 GKTG만 빠진 경우가 "없음"과 구분되지 않는다.
2. **대류 구간**: 새 모듈 `backend/src/briefing/enroute-convection.js`. ETD에 가장 가까운 ACI 장(`readKimAciIndex`/`readKimAciField`, `kim-aci-store.js`)을 경로 축 샘플에서 읽어 0.5/0.75 기준으로 구간을 만든다. 자료 없으면 `unavailable`.
3. **줄 구성**: 새 모듈 `backend/src/briefing/hazard-ribbon.js`
   - 줄: 난류·착빙·대류(항상), 태풍(걸릴 때), 시정·운고(해당 AIRMET 있을 때).
   - 모델 구간: `{ startNm, endNm, level: MOD|SEV, altitudeFt: {from,to}, phase: climb|cruise|descent }` — 고도·단계는 `flightPlanProfile`에서.
   - 예보관 틀: `adverse.hazards`에서 SIGMET TURB·MTW→난류, ICE→착빙, TS 계열→대류, TC→태풍, AIRMET MOD TURB·ICE→해당 줄, 시정·운고·지상풍→시정·운고. `encounter`로 내 고도/다른 고도. 공항경보(`airportScope`)는 넣지 않는다.
   - 구간마다 시작·끝 지점 이름(경로 마커 + TOD, 위 "구간 이름" 규칙), 통과 시각(ETD + 거리/TAS, `windApplied: false`).
   - 패널 요약 1건: 내 고도에서 만나는 가장 센 것(모델·발표 통틀어), 없으면 "MOD 이상 없음", 모델 자료가 없으면 "확인 불가".
4. 문서형 F1 수정: `BriefingView.jsx:424`의 "계획고도에서 조우하는 위험 없음"이 이 요약을 쓰게 한다(모델 SEV가 있으면 "위험 없음"이라고 쓰지 않음).

**확인**: `hazard-ribbon.test.js`(현상→줄 배정, 내 고도/다른 고도, 구간 이름, 통과 시각, 자료 없음), `enroute-model` 상태 테스트, `enroute-convection` 테스트(경계값 0.5·0.75, 영역 밖·자료 없음). 기존 `briefing-composer` 테스트 통과.

## 3단계 — 지도형 화면 틀과 독 — 완료

새 폴더 `frontend/src/features/route-briefing/map-briefing/`. `MapView.jsx`(2,557줄)에는 붙이는 자리와 지도 연동 콜백만 넣는다.

1. **보기 전환**: 브리핑이 있을 때 폭 1280 이상이면 `MapBriefingView`, 아니면 `BriefingView`. 서로 전환 버튼. 기존 `routeBriefingMapMode`("지도에 관련 레이어 보기")는 지도형으로 흡수한다.
2. **상단 버튼**: 브리핑 중 [항공정보 · 기상정보 · 브리핑]. 브리핑 = 패널 켜기/끄기. 연직단면도 버튼·상단 SIGMET/AIRMET 칩 숨김.
3. **브리핑 패널**(`MapBriefingPanel.jsx`): 경로·IFR/VFR·공항명·날짜, ETD·ETA·순항, 거리·소요·TAS·시간대, 요약 1건(누르면 해당 막대 선택), 문서형 보기·저장·수정, "브리핑 종료 · 경로 입력으로". 저장은 지금 `handleSaveBriefing`을 쓴다(비로그인 로그인 창 F12는 따로).
4. **독**(`BriefingDock.jsx`): 위쪽 손잡이로 높이 조절, 위험 막대와 연직단면도를 따로 접기, 접힘·높이 기억. 연직단면도는 `VerticalProfileViewer`를 `embedded`로 그대로 넣고, 보이는 범위(`range`)를 밖으로 알려주는 `onRangeChange`만 추가한다.
5. **위험 막대**(`HazardRibbon.jsx`): 2단계 `ribbon`을 그린다. 라벨 열(눈 아이콘·색·이름·상태 칩·발표 칩), 모델 막대(칠함), 예보관 틀(테두리, 내 고도 실선/다른 고도 점선, 이름표), 자료 없음 빗금, 가로축 = 경로 전체. 연직단면도 확대 범위를 테두리 창으로 표시. 폭 1280~1919는 라벨 열 144.

**확인**: 컴포넌트 단위 테스트(줄 높이·칩 문구·접기 상태 기억), 브라우저 계약 `map-briefing.spec.mjs`(데스크톱 1920 하나: 기본·문서형 전환·막대/단면 따로 접기). 문서형 기존 계약 회귀.

## 4단계 — 지도 연동

1. **경로 위 위험 색 띠**: 내 고도 모델 구간을 `rangeCoordinates`(`legHighlight.js`)로 잘라 경로선 위에 SEV 빨강·MOD 노랑·태풍 보라로 그린다.
2. **막대에 마우스 올림**: 해당 구간 미리보기 강조(`syncLegHighlight`).
3. **막대 누름**: 구간 강조 + 시작·끝 이름표, 팝오버(강도·출처·내 고도 여부·구간·통과 시각·고도·자료 시각·강하 구간 안내), 해당 레이어가 꺼져 있으면 켜고 안내 띄움("난류(KIM GKTG) 레이어를 켰습니다 · FL250 · 09:45 KST [끄기]"), 기상정보 버튼에 개수 배지. 고도·시간은 바꾸지 않는다.
   - 막대 → 레이어: 난류→`turbulence`, 착빙→`cloudIcing`/`icing`, 대류→`aciExperiment`, 예보관 틀→`sigmet`/`airmet`, 태풍→`typhoon`. `hazardLayers.js`에 막대 단위 함수를 추가하고(기존 `hazardMapLayers`는 문서형용으로 유지), 레이어 id가 `MET_LAYERS`에 있는지 테스트가 확인한다.
4. **"지도·슬라이더를 이 구간으로"**: 누를 때만 지도를 그 구간으로 옮기고 시간·고도 손잡이를 맞춘다.

**확인**: `hazardLayers.test.js` 확장, 지도 연동 단위 테스트(구간 → 좌표, 막대 → 레이어), 브라우저 계약에 "막대 누름" 하나 추가. 레이어가 실제로 그려지는 모습은 사용자 확인으로 넘긴다.

## 5단계 — 고도 슬라이더와 시간 막대

1. **고도 슬라이더**(`NwpSliderBar`/`PressureLevelSlider`/`LevelSliderPanel`): 브리핑 중에는 KIM 레이어가 꺼져 있어도 보이게 하고, 기본 손잡이 = 순항고도에 가장 가까운 기압면. 축 위에 모델 위험(칠함, 내 고도 꽉 참·다른 고도 빗금)·예보관 발표(테두리, 실선/점선), 비행 범위 상자, 축 밖 "태풍·전 고도"/"대류·전 고도", 말풍선 "FL250 → 지도 FL265(350hPa) · 난류 SEV". 기압면 위치에 FL을 맞추는 계산은 `pressureLevelModel.js`에 둔다.
2. **시간 막대**(`TimelineRail`): ETD~ETA 테두리 창과 "ETD 09:45 → ETA 10:29" 글만 추가. 브리핑을 열 때 손잡이를 ETD(지났으면 지금)로 한 번 맞춘다. 그 뒤로는 사용자가 끌 때만 바뀐다.

**확인**: `NwpSliderBar.test.js`·`useTimelineRail.test.js` 확장(FL↔기압면 위치, 창 위치), 브리핑 밖 화면에서 두 컨트롤이 그대로인지 회귀.

## 6단계 — 공항 카드 (TAF 개편 정리 후)

1. **백엔드**: 출발 공항도 ETD±1h TAF 구간을 만든다(`taf-window.js`를 출발·도착·교체 공통으로). 구간 안 다른 변화 수("앞뒤 변화 n건")도 같이.
2. **카드**(`AirportBriefingCard.jsx`): 공항 옆 지시선, 경로·다른 카드를 피하는 자리 계산(`airportCardPlacement.js`, 순수 함수로 테스트), 넘치면 최대 높이 안 스크롤.
   - 접힘: 머리(역할·ICAO·공항명·비행등급·깃발) + METAR 한 줄 + TAF ±1h 한 줄.
   - 펼침: 경보 띠, METAR, TAF(±1h 표 / 전문 / 원문), NOTAM 1건, 상세(AMOS·이륙예보, METAR–AMOS 차이 한 줄).
   - 공항경보·윈드시어·AMOS·이륙예보·공항 NOTAM은 이미 응답에 있다(`sections.current.airports[].amos`·`takeoffFcst`, `adverse.hazards`의 `airportScope`, `routeNotams`).

**확인**: 자리 계산 단위 테스트(남북형·동서형), ±1h 구간 테스트, 브라우저 계약에 "카드 펼침" 하나.

## 7단계 — METAR·TAF 과거 보기

1. **API** `GET /api/airports/:icao/history?type=metar|taf`: 보관 스냅샷(METAR 60개, TAF 10개, 내용이 바뀔 때만 저장)에서 그 공항 것만 골라, 같은 내용은 하나로 합쳐 최신순으로 준다. 입력 검증, 읽기 실패 파일은 건너뜀.
2. **카드 ◀▶**: 과거면 주황 띠 "과거 관측 보는 중 · n건 전 [최신으로]", 이전 없으면 ◀ 비활성 + "보관된 이전 자료 없음". TAF 전문의 "직전 발표 대비 변경"도 이 목록으로.

**확인**: API 단위 테스트(공항 없음·파일 깨짐·중복 합치기), 카드 단위 테스트.

## 8단계 — 마무리

- `Architecture.md`(새 폴더·모듈), `docs/policies/verification/contracts.md`(새 계약) 갱신.
- spec 상태를 "구현 완료"로, status 문서 갱신.
- `npm run check`, 데스크톱 브라우저 계약. 4개 화면 폭 확인은 레이아웃 테스트에서만.
- 배포는 의존성 변경이 없으면 빠른 배포. 수집기(KIM) 실행 중인지 먼저 확인.

## 순서와 커밋

| 단계 | 의존 | 커밋 단위 |
|---|---|---|
| 1 총 거리 | — | 1 |
| 2 위험 막대 자료 | 1(통과 시각) | 1~2 (모델 상태·대류 / 줄 구성·F1 문구) |
| 3 화면 틀·독 | 2 | 2 (틀·패널 / 위험 막대·독) |
| 4 지도 연동 | 3 | 1 |
| 5 슬라이더·시간 막대 | 3 | 1 |
| 6 공항 카드 | 3 + TAF 개편 정리 | 1~2 |
| 7 과거 보기 | 6 | 1 |
| 8 마무리 | 전부 | 1 |

각 단계가 끝날 때마다 사용자에게 화면 확인을 받는다. 1~5단계만 끝나도 공항 카드 없이 지도형 브리핑을 쓸 수 있다(카드 자리는 지금 지도 마커로 대신).
