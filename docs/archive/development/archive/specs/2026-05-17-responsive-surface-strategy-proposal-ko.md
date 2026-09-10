# 반응형 화면 전략 변경 제안서

> 상태: 검토용 제안서입니다. 구현 계획이 아닙니다.
> 작성일: 2026-05-17
> 브랜치 맥락: `codex/responsive-layout-system`

## 1. 목적

이전 반응형 작업에서는 패널 폭, 레이아웃 토큰, viewport smoke check, 일부 overflow 문제를 개선했습니다. 이제 남은 질문은 단순히 "화면이 깨지지 않는가"가 아닙니다.

더 중요한 질문은 이것입니다.

- 조종사, 관제사, 운항 담당자, 운영자가 이 화면을 빠르게 읽을 수 있는가?
- 현재 상태와 위험 신호를 몇 초 안에 판단할 수 있는가?
- 지도와 기상정보가 서로 도와주는가, 아니면 서로 공간을 뺏고 있는가?

이 제안서는 앞으로의 반응형 검토를 다음 세 가지 화면 환경으로 나누자는 제안입니다.

- 모바일 폰
- 태블릿
- 데스크탑 웹

중요한 점은, 지금 당장 어느 하나를 "1급 타깃"으로 확정하자는 뜻이 아닙니다. 핵심은 폰과 태블릿을 같은 "모바일"로 묶어 판단하지 말자는 것입니다. 두 환경은 화면 크기, 사용 맥락, 지도와 정보의 동시 표시 필요성이 다릅니다.

## 2. 현재 문제

### 2.1 폰, 태블릿, 데스크탑이 한 묶음으로 섞여 있음

현재 검토 문서나 이슈에서 "모바일"이라고 말할 때 실제로는 서로 다른 화면이 섞여 있습니다.

- 폰 크기: `390x844`
- 태블릿 세로: `820x1180`
- 태블릿 가로: `1180x820`

이렇게 묶으면 제안이 흐려집니다.

예를 들어 폰에서는 지도와 정보를 분리하는 것이 맞을 수 있습니다. 하지만 태블릿에서는 지도와 핵심 기상정보를 함께 보는 것이 더 자연스러울 수 있습니다. 반대로 데스크탑에서 괜찮은 다중 패널 구조를 폰에 그대로 줄이면 너무 답답해집니다.

### 2.2 기술적으로 맞는 것과 운영상 읽기 쉬운 것은 다름

최근 캡처에서는 여러 화면에서 page-level horizontal scroll이 없었습니다. 이것은 좋은 신호입니다. 하지만 그것만으로 충분하지 않습니다.

예시:

- Monitoring의 `390x844` 화면은 가로 스크롤은 없지만, 기상정보와 지도가 둘 다 좁게 눌려 있습니다.
- 메인 지도에서 MET/weather, Aviation, Route Briefing 패널을 열면 패널은 보이지만 지도는 사실상 배경처럼 됩니다.
- Airport panel은 모바일 TAF table clipping은 개선됐지만, 여전히 데스크탑 side drawer를 좁은 화면에 맞춘 느낌이 강합니다.

문제는 단순한 clipping이 아닙니다. 운영자가 현재 상태, 경고, 다음 변화 지점을 빠르게 찾을 수 있느냐가 더 중요합니다.

### 2.3 태블릿은 별도로 검토해야 함

태블릿은 단순히 "큰 폰"이 아닙니다. 항공 업무에서는 조종사가 태블릿을 EFB처럼 들고 다니며 실제 비행 준비나 운항 중 참고하는 경우가 많습니다.

여기서 말하는 EFB 관점은 "태블릿을 무조건 최우선 타깃으로 확정하자"는 뜻이 아닙니다. 태블릿을 검토할 때 다음 맥락을 잊지 말자는 뜻입니다.

- 지도 맥락이 계속 필요할 수 있음
- 공항 상태와 핵심 기상정보를 너무 많은 탭 없이 볼 수 있어야 함
- 태블릿 가로와 세로는 서로 다르게 느껴질 수 있음
- 데스크탑보다 터치 조작과 빠른 시선 이동이 중요함

## 3. 제안하는 화면 환경 구분

### 3.1 모바일 폰

폰은 작고 집중된 task-based 화면으로 보는 것이 맞습니다.

예상 사용:

- 빠른 확인
- 보조 조회
- 간단한 상태 확인
- 기상, 경고, 공항 상태를 급히 확인

설계 방향:

- 한 화면에 하나의 주요 작업을 두는 방향을 우선 검토합니다.
- 지도, 상세 기상 카드, 설정, dense table을 억지로 한 화면에 같이 넣지 않습니다.
- 동시에 보여줄 때 둘 다 약해진다면 작업 단위로 분리합니다.
- 현재 상태와 경고로 가는 경로를 가장 짧게 둡니다.

후보 구조:

- `기상정보`: 공항명, 경고 상태, 비행 가능 상태, METAR 핵심값, 다음 TAF 변화
- `지도`: 지도 중심 화면
- `설정`: 작은 overlay가 아니라 독립된 설정 화면

주의:

이것은 아직 승인된 구현안이 아닙니다. 폰에서 task 분리가 실제 흐름에 맞는지는 추가 검토가 필요합니다.

### 3.2 태블릿

태블릿은 폰보다 큰 화면이 아니라 별도의 사용 환경으로 봐야 합니다.

예상 사용:

- 비행 전 브리핑
- 조종석 근처에서의 확인
- 지도와 기상정보를 함께 대조
- 공항 상태와 route weather 판단

설계 방향:

- 지도와 정보의 동시 표시를 중요한 후보로 유지합니다.
- 폰식 task tab 구조를 태블릿에 바로 적용하지 않습니다.
- 태블릿 세로와 가로를 따로 검토합니다.
- 터치 가능한 컨트롤 크기를 유지합니다.
- 현재 상태와 다음 변화가 너무 많은 탭 없이 보여야 합니다.

태블릿 가로 후보:

- 의미 있는 지도 영역을 유지합니다.
- 옆 또는 위에 작지만 읽기 쉬운 기상/상태 패널을 둡니다.
- 공항명, 경고, 비행 가능 상태, METAR 핵심값, 다음 TAF 변화를 우선합니다.
- 설정, dense table, 세부정보는 한 단계 뒤로 둡니다.

태블릿 세로 후보:

- 지도와 정보를 함께 볼 수 있다면 우선 유지합니다.
- 지도가 너무 좁은 strip이 되거나 정보 패널이 너무 답답해지면 부드러운 mode split을 검토합니다.
- 근거 없이 바로 폰 모델로 점프하지 않습니다.

주의:

태블릿이 완전히 별도 UI를 가져야 한다는 뜻은 아닙니다. 정보 구조와 컴포넌트는 공유하되, 배치, 밀도, interaction만 다르게 가져가는 방향이 더 현실적입니다.

### 3.3 데스크탑 웹

데스크탑은 operations dashboard 성격을 유지하는 것이 자연스럽습니다.

예상 사용:

- 사무실 monitoring
- 운항/운영 검토
- 여러 패널 비교
- 레이어, route, table, 설정 작업

설계 방향:

- 다중 패널 표시를 유지합니다.
- 폰이나 태블릿보다 높은 정보 밀도를 허용합니다.
- panel width와 density는 기존 responsive layout token 체계를 계속 사용합니다.
- map occlusion, awkward wrapping, scan speed 문제는 계속 검토합니다.

주의:

데스크탑은 많은 정보를 동시에 보여줄 수 있지만, 정보가 많다고 좋은 것은 아닙니다. 핵심 상태가 빠르게 읽히도록 우선순위가 분명해야 합니다.

## 4. 영역별 변경 제안

### 4.1 Monitoring

#### 문제

Monitoring 화면은 좁은 viewport에서도 기상 카드와 지도를 동시에 보여주려 합니다. 폰에서는 기상정보 영역과 지도 영역이 둘 다 좁아집니다. 태블릿 세로에서는 조금 낫지만, 지도 영역이 긴 strip처럼 느껴질 수 있습니다.

리뷰어가 추가로 확인한 문제:

- `ui-qa-reviewer`는 monitoring dashboard root가 viewport보다 길어질 수 있는데 document 높이는 viewport에 묶여 있어, 폰과 태블릿 세로에서 하단 콘텐츠 접근이 어렵거나 불가능할 수 있다고 지적했습니다.

증거:

- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/mobile-monitoring-ops.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/mobile-monitoring-ground.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/tablet-portrait-monitoring-ops.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/tablet-portrait-monitoring-ground.png`

#### 왜 중요한가

Monitoring은 운영 상태를 빠르게 읽는 화면입니다. 사용자는 빠르게 다음 질문에 답할 수 있어야 합니다.

- 지금 어떤 공항을 보고 있는가?
- 경고가 있는가?
- 현재 상태가 VFR, IFR, 제한 상태 중 무엇인가?
- 다음에 바뀌는 중요한 기상 요소는 무엇인가?
- 지금 필요한 것은 지도인가, 기상 카드인가?

지도와 정보가 둘 다 좁아지면 강한 지도도 아니고 강한 상태 요약도 아닌 애매한 화면이 됩니다.

#### 개선 방향

폰:

- 작업 분리를 강한 후보로 둡니다.
  - `기상정보`
  - `지도`
  - `설정`
- 기본 진입은 `기상정보`로 둡니다.
- 공항명, 경고, 비행 가능 상태, METAR 핵심값, 다음 TAF 변화를 상단에 둡니다.

태블릿:

- 폰의 task-tab 모델을 바로 복사하지 않습니다.
- 먼저 지도와 기상정보가 더 나은 태블릿 레이아웃에서 함께 살아날 수 있는지 확인합니다.
- 가로에서는 지도와 핵심 상태 동시 표시를 우선 후보로 둡니다.
- 세로에서는 다음 후보를 비교합니다.
  - 지도 + compact status panel
  - 상태 정보 우선 + 지도 유지
  - 공존이 약할 때만 mode split

데스크탑:

- dashboard-style monitoring을 유지합니다.
- density, overflow, map occlusion, 정보 우선순위를 계속 검토합니다.

#### 열어둘 결정

- 태블릿 세로에서 지도와 기상정보를 계속 함께 보여줄 것인가?
- 태블릿 가로를 주요 태블릿 참고 화면으로 볼 것인가?
- 폰에서 설정을 modal이 아니라 top-level task로 둘 것인가?
- ops/ground는 `기상정보` 내부 mode로 둘 것인가, 별도 단계로 둘 것인가?

## 5. 메인 지도와 상세 패널

### 문제

폰 크기에서 Aviation, MET/weather, Route Briefing 패널을 열면 지도는 보이지만 실제 사용성은 약합니다. 패널이 사실상 주 화면이 되고 지도는 배경처럼 남습니다.

증거:

- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/mobile-main-map-aviation-panel.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/mobile-main-map-met-panel.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/mobile-main-map-route-panel.png`
- `artifacts/responsive-screenshots/mobile-ux-review/2026-05-17_0152_review/tablet-portrait-main-map-met-panel.png`

### 왜 중요한가

지도 기반 작업은 공간 맥락이 중요합니다. 그런데 상세 패널이 지도 대부분을 덮으면, 화면은 지도와 상세를 동시에 지원하는 것처럼 보이지만 실제로는 그렇지 않습니다.

사용자는 혼란스러울 수 있습니다.

- 지도는 보이지만 제대로 쓸 수 없습니다.
- 지도 컨트롤과 패널 컨트롤이 시각적으로 경쟁합니다.
- 지금 지도 확인 모드인지, 설정/상세 모드인지 분명하지 않습니다.

### 개선 방향

폰:

- 지도와 상세를 별도 task mode로 보는 방향을 검토합니다.
- 패널을 열면 집중된 상세/설정 화면처럼 보여줍니다.
- 다시 지도 확인으로 돌아가는 경로를 명확하게 둡니다.

태블릿:

- 지도와 상세 패널 공존을 후보로 유지합니다.
- 태블릿 가로에서는 지도 영역을 충분히 남기는 side panel을 검토합니다.
- 태블릿 세로에서는 compact panel, overlay, mode split 중 무엇이 맞는지 비교합니다.

데스크탑:

- 현재 multi-panel map workflow를 유지합니다.
- density와 occlusion을 계속 점검합니다.

### 열어둘 결정

- 어느 폭부터 패널이 overlay가 아니라 별도 task view가 되어야 하는가?
- Route Briefing은 layer panel과 다르게 동작해야 하는가?
- 태블릿 세로는 폰에 가까운가, 태블릿 가로에 가까운가, 아니면 중간 구조가 필요한가?

## 6. Airport Panel

### 문제

Airport panel은 기계적인 문제는 많이 개선됐습니다. 이전 모바일 TAF table clipping 문제도 수정됐습니다. 하지만 모바일 읽기 모델은 여전히 side tab이 있는 데스크탑 drawer에 가깝습니다.

증거:

- `artifacts/responsive-screenshots/airport-drawer-tabs/2026-05-17_0026_task5-followup-postfix/mobile-metar.png`
- `artifacts/responsive-screenshots/airport-drawer-tabs/2026-05-17_0026_task5-followup-postfix/mobile-taf-table.png`
- `artifacts/responsive-screenshots/airport-drawer-tabs/2026-05-17_0026_task5-followup-postfix/mobile-warning.png`
- `artifacts/responsive-screenshots/airport-drawer-tabs/2026-05-17_0026_task5-followup-postfix/mobile-airport-info.png`

### 왜 중요한가

공항 상세는 우선순위가 높은 읽기 작업입니다. 사용자는 먼저 다음 질문에 답해야 합니다.

- 이 공항은 지금 괜찮은가?
- 현재 category는 무엇인가?
- 시정, 운고, 바람, warning은 어떤가?
- 다음 forecast 변화는 무엇인가?

이 질문에 답하기 전에 여러 동등한 tab을 먼저 훑어야 한다면, 빠른 판단에 방해가 됩니다.

### 개선 방향

폰:

- full-screen step flow를 강한 후보로 둡니다.
- 추천 순서:
  1. 요약
  2. METAR
  3. TAF
  4. Warnings
  5. supporting airport/weather information
- dense TAF table/grid는 전문가용 세부 보기로 유지하되, 첫 화면의 기본 읽기 경로로 두지는 않습니다.

태블릿:

- 폰의 full-screen flow가 자동으로 정답이라고 보지 않습니다.
- 지도 맥락을 유지할 수 있는 넓은 drawer 또는 panel 구조를 후보로 둡니다.
- 첫 화면에서 summary, METAR, TAF, warning 상태가 더 빨리 읽히도록 개선합니다.

데스크탑:

- 더 풍부한 tabbed/detail behavior를 유지합니다.
- table density, 긴 텍스트, panel width를 계속 점검합니다.

### 지금 명시적으로 제외할 것

현재 세션 방향에 따라 다음은 우선 후보로 보지 않습니다.

- Airport panel의 mobile bottom tab
- Airport panel의 segmented-control 대안

나중에 다시 검토할 수는 있지만, 그때는 별도 제품 결정으로 다루는 것이 좋습니다.

### 열어둘 결정

- 폰과 태블릿에서 Airport panel 구조를 다르게 가져갈 것인가?
- 태블릿에서 Airport detail을 열 때 지도 맥락을 유지할 것인가?
- warning과 airport info는 데이터가 있을 때만 step으로 보여줄 것인가?
- METAR/TAF 상세 전에 꼭 보여줘야 하는 summary 값은 무엇인가?

## 7. 아직 결정하지 말아야 할 것

추가 태블릿 evidence와 사용자 검토 전에는 다음을 확정하지 않는 것이 좋습니다.

- 어떤 화면을 단일 "1급 타깃"으로 선언하지 않습니다.
- 태블릿을 폰 task-tab 모델로 고정하지 않습니다.
- 태블릿을 데스크탑 drawer 모델로 고정하지 않습니다.
- 정확한 breakpoint를 지금 정하지 않습니다.
- 폰 task tab 구현을 지금 승인하지 않습니다.
- Airport full-screen flow 구현을 지금 승인하지 않습니다.
- 폰과 태블릿의 완전 다른 구조를 지금 승인하지 않습니다.

지금 결정할 수 있는 범위는 이 정도입니다.

- 폰, 태블릿, 데스크탑을 구분해서 검토합니다.
- 태블릿에서는 지도와 정보의 동시 표시를 중요한 후보로 유지합니다.
- 구조를 정하기 전에 evidence를 더 모읍니다.

## 8. 다음 검토 batch 제안

### Batch 1: 태블릿 중심 Monitoring

캡처/비교 대상:

- `1180x820` 태블릿 가로 ops
- `1180x820` 태블릿 가로 ground
- `820x1180` 태블릿 세로 ops
- `820x1180` 태블릿 세로 ground
- settings open
- mode switch usage
- exit control visibility

검토 질문:

- 공항 상태와 지도를 함께 읽을 수 있는가?
- 지도 영역이 실제로 유용할 만큼 넓은가?
- 핵심 기상 상태가 스크롤 없이 보이는가?
- mode, settings, exit control이 명확한가?

### Batch 2: 태블릿 메인 지도와 패널

캡처/비교 대상:

- no panel
- Aviation panel
- MET/weather panel
- Route Briefing panel
- basemap switcher
- weather timeline/advisory states when available

검토 질문:

- 패널이 지도 영역을 충분히 남기는가?
- 패널 위치가 지도 컨트롤이나 중요한 weather overlay를 막는가?
- 태블릿 세로는 가로와 다른 동작이 필요한가?

### Batch 3: Airport Panel by Surface

비교 대상:

- 폰 current drawer
- 태블릿 세로 current drawer
- 태블릿 가로 current drawer
- 데스크탑 current drawer

검토 질문:

- 현재 drawer가 잘 작동하는 화면은 어디인가?
- 첫 상태 판단을 느리게 만드는 화면은 어디인가?
- full-screen flow는 폰 전용 해결책인가?
- 태블릿 첫 화면에는 무엇이 보여야 하는가?

## 9. 나중에 승인받아야 할 질문

구현 계획을 쓰기 전에는 다음 질문에 답해야 합니다.

1. 폰 Monitoring에서 명시적인 task 분리를 사용할 것인가?
2. 태블릿은 기본적으로 지도와 정보를 함께 보여줄 것인가?
3. 태블릿 세로는 폰에 가깝게 볼 것인가, 태블릿 가로에 가깝게 볼 것인가, 아니면 중간 구조를 둘 것인가?
4. Airport Panel은 폰과 태블릿에서 다른 구조를 허용할 것인가?
5. 공항과 Monitoring의 첫 화면 summary에 반드시 필요한 값은 무엇인가?
6. 태블릿 기준 viewport는 `1180x820`, `820x1180`, 또는 둘 다 동등하게 볼 것인가?

## 10. 요약

수정된 제안은 다음과 같습니다.

- 폰: task-based. 한 화면에 하나의 주요 작업.
- 태블릿: 별도 surface. 지도와 정보의 동시 표시를 중요한 후보로 유지.
- 데스크탑: operations dashboard. 높은 정보 밀도와 다중 패널 허용.

이 문서만으로 구현을 시작하면 안 됩니다. 다음 단계는 태블릿 중심 evidence를 더 모으고, 지도와 정보의 동시 표시가 태블릿에서 실제로 좋은지 사용자와 함께 검토하는 것입니다.

## 11. Accepted / Deferred / Rejected

- Accepted: Phone Monitoring task tabs prototype for 390x844 only. Tablet remains evidence-only with no structural task-tab adoption.
- Accepted: Airport Panel phone horizontal top tabs and compact header prototype for 390x844 only. Tablet drawer/tab rail remains unchanged.
- Deferred: Monitoring settings as a true inline phone task. Current prototype opens the existing settings modal.
- Accepted: Airport compact header cap. Post-review capture uses max-height: 112px on phone only and keeps airport identity readable.
- Deferred: Route Briefing split layout implementation. Architecture review confirms Mapbox ownership needs a separate parent-owned map slot or map viewport mode.
- Rejected for this batch: fake Route Briefing map placeholder and production RouteBriefingPanel.jsx / RouteBriefing.css changes.
