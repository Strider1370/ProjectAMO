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

**실제로 한 것 (계획과 달라진 점)** — 자세한 결정은 spec §2.2.
- 4번 "위쪽 손잡이로 높이 조절, 높이 기억"은 만들었다가 뺐다. 대신 독 전체 접기 탭. 단면 높이는 화면 30%(최소 280) 고정.
- 4번 "연직단면도를 그대로 넣는다"는 지도형에 한해 압축 모드로 바꿨다(머리 한 줄, 범례 가운데, 레이어는 왼쪽 칸, 미니맵·범례 줄·비교 고도 줄 없음). `VerticalProfileViewer`에 `compact`·`compactTitle`·`compactActions`·`compactLegendExtra`·`plotPaddingLeft`·`onRangeChange`, `VerticalProfileChart`에 `plotPaddingLeft`·`compactRail`·`showWaypointRail` 추가.
- 5번 위험 막대: 막대 글자 없음, 범례 색 통일, 빈 줄 숨김, AIRMET 제외, 자료 없음 빗금, SIGMET 구간별 틀. "폭 1280~1919는 라벨 열 144"는 칩이 잘려 모든 폭 240으로.
- 2단계 자료도 함께 바꿨다: `hazard-ribbon.js` 빈 줄 제외·AIRMET 제외·`missing`·`partial`, `hazard-section.js` `routeRunsNm`, `geo-time-match.js` `routeRunsInGeometry`, `enroute-model.js` `missing`·착빙 300hPa 위 = 없음.
- 계획에 없던 것: 독을 뜬 카드로, 시간 막대 28px, 현재 시각 줄 숨김, 재생 버튼 숨김, 범례·기본지도·확대 버튼 위치, 시간 조절 창 위치(문서형 포함).
- 커밋: faec3ff9 · d53c025f · ba707a8f · ac4656b8 · 341fc5a8 · 728ef38c · bc3fdc77 · 7b2fbbcd · f39fe499 · 15eb168c · c0aeb656 · 59baef15 · d29e2499 · f93cc9c7 · c89631f3 · a65ed7e4 · eeb79d9c.

## 4단계 — 지도 연동

1. **경로 위 위험 색 띠**: 내 고도 모델 구간을 `rangeCoordinates`(`legHighlight.js`)로 잘라 경로선 위에 SEV 빨강·MOD 노랑·태풍 보라로 그린다.
2. **막대에 마우스 올림**: 해당 구간 미리보기 강조(`syncLegHighlight`).
3. **막대 누름**: 구간 강조 + 시작·끝 이름표, 팝오버(강도·출처·내 고도 여부·구간·통과 시각·고도·자료 시각·강하 구간 안내), 해당 레이어가 꺼져 있으면 켜고 안내 띄움("난류(KIM GKTG) 레이어를 켰습니다 · FL250 · 09:45 KST [끄기]"), 기상정보 버튼에 개수 배지. 고도·시간은 바꾸지 않는다.
   - 막대 → 레이어: 난류→`turbulence`, 착빙→`cloudIcing`/`icing`, 대류→`aciExperiment`, 예보관 틀→`sigmet`/`airmet`, 태풍→`typhoon`. `hazardLayers.js`에 막대 단위 함수를 추가하고(기존 `hazardMapLayers`는 문서형용으로 유지), 레이어 id가 `MET_LAYERS`에 있는지 테스트가 확인한다.
4. **"지도·슬라이더를 이 구간으로"**: 누를 때만 지도를 그 구간으로 옮기고 시간·고도 손잡이를 맞춘다.

5. **SIGMET 마우스 올림 강조 (2026-10-21 추가)**: 연직단면도에서 SIGMET·AIRMET 상자가 겹치면 구분이 어렵다. 단면도 상자에 마우스를 올리면 그 발표의 상자들(같은 발표가 여러 구간이면 전부)을 강조하고 나머지는 흐리게, 지도 위 같은 SIGMET 면도 함께 강조한다. 위험 막대의 SIGMET 틀에 올려도 같은 강조. 지도형·문서형 단면도 모두.

**확인**: `hazardLayers.test.js` 확장, 지도 연동 단위 테스트(구간 → 좌표, 막대 → 레이어), 브라우저 계약에 "막대 누름" 하나 추가. 레이어가 실제로 그려지는 모습은 사용자 확인으로 넘긴다.

**실제로 한 것 (2026-10-21, 계획과 달라진 점)**
- 색 띠: `map-briefing/briefingMapLayers.js`. 모델 구간 + 태풍 틀만(SIGMET 틀은 띠 없음), 경로선 아래 폭 11·불투명 .6, SEV가 MOD 위. 색은 `hazardLineColor`(위험 막대와 같은 GKTG·착빙·대류 원천, 태풍 보라). 막대 거리 → 좌표는 연직단면도 경로 축(`verticalProfile.axis.samples`, SID·STAR 포함)을 따라 자른다(`ribbonRangeCoordinates`). 처음엔 지도 preview 선을 길이 비율로 잘랐는데, 그 선은 절차가 빠진 직선이라 출발 구간이 경로 밖에 그려졌다(사용자 발견, 10-21). 눈 아이콘으로 숨긴 줄은 띠도 숨김.
- 미리보기·고정 강조는 NAVLOG 강조와 같은 파란 선(별도 소스). 누르면 "시작 X"·"끝 Y" 이름표.
- **틀이 모델 막대를 덮어 겹친 곳의 막대를 누를 수 없던 문제**: 마우스는 줄이 위치로 고른다(`pickRibbonTarget` — 틀 이름표·위아래 테두리 = 틀, 가운데 = 모델 막대, 없으면 틀). 막대·틀 버튼은 키보드용으로 남기고 툴팁은 줄에 옮겨 단다.
- 레이어 켜기: `hazardLayers.js` `ribbonItemLayers`(착빙은 `cloudIcing`+`icing`, SIGMET 틀은 `sigmet`/`sigmet_intl`). 계획의 AIRMET은 막대에서 빠져(3단계) 해당 없음. 레이더·낙뢰는 켜지 않는다. 안내는 지도에 실제 그려지는 기압면·예보 시각을 쓴다(5단계 전이라 순항고도가 아닐 수 있음). 8초 뒤 사라지고 [끄기]는 켠 것만 끈다. 기상정보 배지는 새로 켠 레이어가 있으면 갈색으로 강조, 기상정보를 열면 해제.
- 팝오버: `HazardPopover.jsx`, 내용은 `selectionDetail`. "이 구간으로"는 지도 맞춤 + 시간 = 통과 가운데 시각 + 고도 = 가장 가까운 기압면(`pressureLevelModel.js` `nearestPressureLevelForAltitude`; 모델 = 구간 가운데 고도, 내 고도 SIGMET = 순항고도, 다른 고도 = 발표 고도대 가운데).
- SIGMET 강조: 단면 상자에 마우스(겹치면 가장 작은 상자) → 같은 발표 상자 전부 강조·나머지 흐림, 위험 막대 틀 강조, 지도 면 강조(`advisoryLayers.js` `promoteId: 'id'` + feature-state `highlight`). 문서형 단면도는 단면 안 강조만(지도 면 연동은 지도형만).
- MapView에는 `useBriefingMapLink` 호출과 콜백만 추가.
- 사용자 검토 후: 브리핑 중 기상·항공 레이어 패널이 독(+범례 줄) 위에서 끝나고 안쪽 스크롤(4e8b2c2e). 막대 누름 시 지도 확대·고도 변경은 하지 않기로 재확인.
- 브라우저 계약 2개(막대 누름·SIGMET 마우스 올림)는 아직 없음 — status "남은 것" 참고.

## 5단계 — 고도 슬라이더와 시간 막대

1. **고도 슬라이더**(`NwpSliderBar`/`PressureLevelSlider`/`LevelSliderPanel`): 브리핑 중에는 KIM 레이어가 꺼져 있어도 보이게 하고, 기본 손잡이 = 순항고도에 가장 가까운 기압면. 축 위에 모델 위험(칠함, 내 고도 꽉 참·다른 고도 빗금)·예보관 발표(테두리, 실선/점선), 비행 범위 상자, 축 밖 "태풍·전 고도"/"대류·전 고도", 말풍선 "FL250 → 지도 FL265(350hPa) · 난류 SEV". 기압면 위치에 FL을 맞추는 계산은 `pressureLevelModel.js`에 둔다.
2. **시간 막대**(`TimelineRail`): ETD~ETA 테두리 창과 "ETD 09:45 → ETA 10:29" 글만 추가. 브리핑을 열 때 손잡이를 ETD(지났으면 지금)로 한 번 맞춘다. 그 뒤로는 사용자가 끌 때만 바뀐다.

**확인**: `NwpSliderBar.test.js`·`useTimelineRail.test.js` 확장(FL↔기압면 위치, 창 위치), 브리핑 밖 화면에서 두 컨트롤이 그대로인지 회귀.

**실제로 한 것 (2026-10-22, 계획과 달라진 점)**
- 4단계 보완 — 막대 팝오버 정리(사용자 검토 "조잡하다" → 한 번 배지·이름 칸을 다 뺐다가 "줄 간격·배지가 없어 오히려 안 읽힌다"로 되돌림, 10-22): 머리 = 강도 배지(막대 색) · 현상 이름(20px) · 출처 배지("KIM GKTG 모델"/"SIGMET"), 본문 = 이름 칸(통과·구간·고도) + 값 16px(통과는 20px 굵게), 줄 간격 8px, 고도 옆 "내 고도"(파랑 테두리)/"다른 고도"(회색) 배지 — 빨강은 SEV·SIGMET 내 고도에만. 상승·강하 안내 상자, 테두리 버튼 "지도·고도·시간 맞추기"(설계의 "지도·슬라이더를 이 구간으로"와 같은 동작), 아래 옅은 두 줄 = 회차·유효 시각과 NM·바람 미반영.
- 고도 슬라이더: 기존 `PressureLevelSlider`에 브리핑 표시를 얹었다. 표시 자료는 `AltitudeMarksContext`(weather-overlays/lib)로 넘긴다 — MapView → 레일 → 슬라이더로 속성을 네 단계 내려보내지 않으려고. `LevelSlider`에 `decorations`(축 위 구간)·`valueNote`(값 아래 한 줄), `LevelSliderPanel`에 `header`(축 위 "전 고도" 칩).
  - 표시 규칙(`map-briefing/briefingAltitudeModel.js`): 모델 = 칠함(순항 단계면 꽉 찬 색, 상승·강하는 빗금), SIGMET = 테두리(내 고도 실선·다른 고도 점선), 비행 범위 SFC~순항 상자, 대류(고도 없음)·태풍은 축 위 칩. 위치는 `pressureLevelModel.js` `altitudePositionPct`(눈금이 기압면 간격이라 이웃 기압면 사이를 표준대기 고도로 보간).
  - 말풍선: "순항 FL250 → 지도 FL240 · SIGMET 심한 난기류"(그 기압면 ±1,000ft에서 가장 센 위험).
  - KIM 레이어가 모두 꺼져 있으면 레이어 색인이 없어 기압면 목록이 없다 → `BriefingLevelRail`이 고정 목록 `KIM_PRESSURE_LEVELS`(백엔드 `KIM_NWP_LEVELS`의 기압면과 같음)로 슬라이더를 띄운다. 고른 기압면은 레이어를 켜면 그대로 쓰인다.
- 기본값: 브리핑을 열 때 **한 번만**(브리핑 ribbon이 바뀔 때) 고도 = 순항고도에 가장 가까운 기압면, 시간 = ETD(지났으면 **지금 시각**). 이후 사용자 조작만. `useBriefingMapLink`. 처음엔 지났으면 실시간(null)으로 뒀는데, 실시간 손잡이는 마지막 관측 프레임에 붙어 브리핑 직후 ETD~ETA 창이 화면 밖에 있었다(사용자 발견, 10-22).
- 시간 막대: `TimelineRail` `flightWindow` — 띠 안은 ETD·ETA 세로선과 옅은 칠, 글은 **각 선 바로 위**(띠와 독 사이 틈) "ETD 20:30"은 선 왼쪽으로·"ETA 21:14"는 오른쪽으로 펼친다. 처음엔 한 줄 글을 상자 오른쪽에 몰았는데 어느 선이 무엇인지 읽기 어렵다는 사용자 검토로 바꿨다(10-22).
- 4단계 보완: "이 구간으로"에서 순항 단계 모델 막대는 가운데 고도가 아니라 순항고도로(상승 끝에서 시작하는 막대가 FL210으로 가던 것).
- 겹침 대응(사용자 결정, 10-22): 확대·현재 위치·방위·기본지도 버튼은 원래 자리에 고정(독이 펼쳐지면 가림), 고도 슬라이더 높이 = `clamp(160px, 100vh − 240px − 독 높이, 400px)`. 1080·900·768 높이에서 슬라이더·독·버튼 겹침 없음 확인.
- 확인: 단위 테스트(`briefingAltitudeModel.test.js`, `pressureLevelModel.test.js`), 운영 자료 화면(`.artifacts/map-briefing-check/`, git 무시). 브라우저 계약은 4단계 것과 함께 미작성.

## 6단계 — 공항 카드 (TAF 개편 정리 후)

> **2026-10-22 사용자 결정 (spec §2.3)**: 카드는 접힌 3줄 요약 + 자리 계산 + 깃발까지만. "상세"는 기존 공항 패널을 연다(펼친 카드·AMOS·이륙예보 상세는 만들지 않음). 아래 2번 "펼침"은 이 결정으로 대체된다. 백엔드 ±1h TAF 구간(1번)은 그대로. 카드 TAF 한 줄만 TAF 개편과 맞물리고, 공항 패널 TAF 탭에 ETD/ETA 시각을 넘기는 연결이 추가된다.

1. **백엔드**: 출발 공항도 ETD±1h TAF 구간을 만든다(`taf-window.js`를 출발·도착·교체 공통으로). 구간 안 다른 변화 수("앞뒤 변화 n건")도 같이.
2. **카드**(`AirportBriefingCard.jsx`): 공항 옆 지시선, 경로·다른 카드를 피하는 자리 계산(`airportCardPlacement.js`, 순수 함수로 테스트), 넘치면 최대 높이 안 스크롤.
   - 접힘: 머리(역할·ICAO·공항명·비행등급·깃발) + METAR 한 줄 + TAF ±1h 한 줄.
   - 펼침: 경보 띠, METAR, TAF(±1h 표 / 전문 / 원문), NOTAM 1건, 상세(AMOS·이륙예보, METAR–AMOS 차이 한 줄).
   - 공항경보·윈드시어·AMOS·이륙예보·공항 NOTAM은 이미 응답에 있다(`sections.current.airports[].amos`·`takeoffFcst`, `adverse.hazards`의 `airportScope`, `routeNotams`).

**확인**: 자리 계산 단위 테스트(남북형·동서형), ±1h 구간 테스트, 브라우저 계약에 "카드 펼침" 하나.

**실제로 한 것 (2026-10-22)**
- 백엔드: `taf-window.js` `tafWindow` — 기준 시각(출발 ETD, 도착·교체 ETA)의 우세 예보 한 줄 + 앞뒤 1시간 안 다른 예보(TEMPO·PROB·BECMG 변화군, 시간별 우세 예보가 바뀌는 시각). 새 TAF가 아직 발효 전이면(예: 11Z 발표 · 12Z부터, ETD 11:30Z) 그 시각에 유효한 **직전 발표**(`taf.previous`)를 쓰고 표시한다. 직전 발표 보관본은 display가 없어 원시 값으로 글을 만든다. `sections.current.airports[].tafWindow`. TAF 파서·개편 파일은 건드리지 않음.
- 카드(`map-briefing/AirportCards.jsx`, 모델 `airportCardModel.js`, 자리 `airportCardPlacement.js`): 320×140, 네 줄 — 머리(역할 · ICAO 18px · 공항명 · 비행등급 칩 오른쪽) / METAR·TAF 두 줄(왼쪽 이름 칸 "METAR 20:00"·"TAF ETD±1h", 본문 14px, "변화 n" 툴팁에 목록) / 깃발(윈드시어·공항경보 n·NOTAM n) + "상세". 처음 한 줄 12px 묶음은 "작고 위계가 없다"는 사용자 검토로 바꿨다(10-22). 자리는 공항 둘레 여섯 곳 중 경로선·브리핑 패널·독·슬라이더·자료 시각 카드·위쪽 버튼·열린 공항 패널·다른 카드를 피하는 곳, 점선 지시선. 지도 이동·화면 구성 변화(공항 패널 열림 등)마다 다시 놓는다. 좌표는 앱 공항 목록(국내 + 해외 navdata).
- "상세" = 기존 공항 패널(지도에서 공항 기호를 누른 것과 같은 `onAirportSelect`). 목록에 없는 공항은 버튼 비활성.
- 공항 패널(브리핑 중만): 오른쪽 전체 높이 서랍 → 지도 영역 안 떠 있는 카드(폭 600~760 = 1920에서 약 730, 위 12 ~ 독 위 12, 둥근 모서리). 560은 사진·탭 칸이 눌려 어설프고, 원래 폭(화면 절반)은 지도를 너무 가린다는 사용자 검토로 중간값(10-22).
- 카드 접기(사용자 요청, 10-22): 머리 오른쪽 끝 ⌄ → 같은 자리·같은 지시선 끝에 칩(색 띠 = 비행등급 · ICAO · 비행등급 칩 · 공항경보/윈드시어면 빨간 점 · ⌃), 칩 어디를 눌러도 펼침. 역할(출발·도착·교체)로 브라우저에 기억. 브리핑 패널 아래 "공항 카드 모두 접기/펼치기". 지시선은 흰 테두리 진한 실선 + 공항 쪽 점(점선 회색은 지도 위에서 안 보였다). 공항 패널이 열려 있는 동안 공항 카드는 숨긴다(패널에 반쯤 가려 어지러웠다). 공항 패널 파일은 손대지 않고 `MapBriefing.css`의 `.app.is-map-briefing .airport-panel`로. 독 높이는 `:root --mb-dock-h-app`(MapBriefingView).
- 브리핑 중에는 공항 패널이 열려도 위쪽 [항공정보·기상정보·브리핑] 버튼을 남긴다(`App.jsx` 조건에 `mapBriefingActive`).
- 남은 것: 공항 패널 TAF 탭에 ETD/ETA 표시(TAF 개편 정리 후), 브라우저 계약 "카드 → 상세 → 공항 패널".

## 7단계 — METAR·TAF 과거 보기

> **2026-10-22 사용자 결정 (spec §2.3)**: 과거 보기는 카드가 아니라 **공항 패널**(METAR·TAF 탭)에 넣는다. API(1번)는 그대로, 2번 "카드 ◀▶"는 공항 패널 탭에서. TAF 탭과 겹치므로 TAF 개편이 정리된 뒤에 한다.

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
