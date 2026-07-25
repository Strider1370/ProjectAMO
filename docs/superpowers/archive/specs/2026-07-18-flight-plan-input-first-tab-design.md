# 비행계획 입력 — 첫 번째 탭 설계

작성: 2026-07-18 · 상태: 승인됨, 구현 전

## 목적

첫 번째 탭은 기본 비행계획을 만들고 고치는 유일한 작업 공간이다. 두 번째 탭의 대체 경로 설계·비교는 기본 경로를 복제한 뒤에만 다루며, 이 문서의 구현 범위가 아니다.

## 화면 순서

1. IFR / VFR 선택
2. 출발 공항, 도착 공항
3. SID, STAR 절차 선택 버튼 (초기에는 선택 안 함). IAP는 기존처럼 STAR 선택에 연동한다.
4. FIX·항공로를 입력하는 큰 en-route 문자열 편집 칸
5. `자동 생성`, `지도 클릭`, `그리기` 도구
6. 순항속도, ETD, ETA

RNAV/ATS 선택은 화면에서 제거한다. 입력된 항공로 데이터가 필요한 분류를 결정한다. 교체공항은 이 첫 번째 탭의 경로 작성 흐름에서 숨기며, 브리핑 준비 단계에서만 다룬다.

두 공항이 선택된 직후 지도에는 출발–도착 직선 기준선만 표시한다. 절차와 en-route 문자열은 비어 있다. 공항·비행 규칙·절차를 바꿔도 자동 생성을 예약하거나 실행하지 않는다.

## 경로 원본과 적용

en-route 문자열은 `FIX airway FIX`와 `DCT`를 쓰는 사람이 읽는 원본이다. SID/STAR/IAP와 공항은 문자열에 넣지 않고 별도 데이터로 둔다. 전체 계획은 읽기 전용으로 별도 표시한다.

문자열 입력은 초안이다. `경로 적용` 또는 Ctrl+Enter 때만 한 번 검증·계산·지도 갱신한다. 오류면 기존 확정 경로를 유지한다. 지도 편집이 적용되면 같은 문자열을 갱신하고, 바뀐 조각을 잠시 강조한다. 입력칸 바로 아래에는 `예: OSPAT Y711 GONA DCT KALOD` 형식 안내를 둔다.

### 단일 원본과 세 상태

기본 경로가 적용된 뒤의 단일 소유자는 `기본 경로` 설계안 하나다. 별도의 적용 경로 사본을 만들지 않는다. 화면에서 이전 호환을 위해 보이는 경로 결과는 선택한 설계안에서 파생한 값일 뿐, 독립적으로 수정하지 않는다.

첫 번째 탭은 다음 세 상태를 구분한다.

| 상태 | 뜻 | 고도·브리핑·대체안 비교에 전달 |
|---|---|---|
| 기준선 | 공항 두 개를 잇는 옅은 직선 | 아니오 |
| 경로 초안 | 사용자가 타이핑·자동 생성·지도 제안으로 만든 미적용 값 | 아니오 |
| 적용 기본 경로 | `경로 적용` 또는 확인 카드 `적용`을 누른 값 | 예 |

공항·비행 규칙·절차 변경은 기준선과 초안만 바꾼다. 이미 적용한 기본 경로는 자동으로 덮지 않는다. 기존 적용 경로가 있을 때 자동 생성·초기화·공항 변경을 확정하려면 먼저 변경 확인을 받는다. 기본 경로를 적용해도 첫 번째 탭에 머물며, 사용자가 두 번째 탭을 직접 열 때만 대체 경로 비교로 이동한다.

경로 초안은 `{ routeForm, procedures, enroute }`를 소유하고, 적용 기본 경로도 같은 세 입력의 독립 복사본을 소유한다. SID/STAR/IAP 선택 UI는 초안만 바꾸며, `적용` 때만 기본 경로에 복사한다. 지도·거리·고도·브리핑은 적용 기본 경로의 절차만 읽는다.

공항 또는 비행 규칙 변경 확인에서 사용자가 `계속`을 고르면, 기존 기본 경로와 그 복제 대체안은 모두 폐기하고 새 공항의 기준선·빈 초안으로 전환한다. 확인 전에는 어떤 경로, 요청, 절차도 지우지 않는다.

첫 번째 탭으로 들어올 때 `projectBaseForSettings()`가 선택 design을 `base`로 바꾸고, route result·절차 projection·지도 preview를 모두 base로 동기화한다. 따라서 사용자가 두 번째 탭에서 대체안을 선택했더라도 첫 번째 탭은 base 입력과 base 지도만 함께 보인다. 두 번째 탭으로 돌아가도 선택은 base에서 시작한다. 첫 번째 탭에서 적용한 새 기본 경로는 base를 교체하고, 모든 대체안을 하나의 상태 전환으로 폐기한다.

### en-route 데이터와 수동 경로 결과

en-route는 단순 `viaFixes` 목록이 아니라, 순서 있는 `FIX`, `항공로`, `DCT`, `사용자 waypoint` 토큰과 설계안별 사용자 waypoint 좌표 목록으로 보존한다.

- 화면 문자열의 `WP1`은 현재 설계안의 `{ id, name, lat, lon }` 사용자 waypoint를 가리킨다.
- 외부 호환 문자열은 `WP1` 같은 지역 이름 대신 `N3721.4E12712.8` 단일 좌표 토큰을 쓴다.
- 이름은 `WP1`, `WP2`부터 시작하며 사용자가 바꿀 수 있다. 빈 이름, 대소문자를 무시한 중복, `DCT`, 항공로명, 좌표 형식과 충돌하는 이름은 허용하지 않는다. 번호는 해당 설계안에서 삭제 뒤 재사용하지 않는다.
- 공개 FIX와 항공로 중간 FIX, 사용자 waypoint를 모두 좌표·표시명·편집 가능 여부가 있는 하나의 수동 경로 결과로 표현한다. DCT leg는 항공로 segment가 아닌 사용자가 지정한 직선 구간이다.
- 거리, 지도 geometry, 전체 계획 표시, 외부 문자열, route model, 노출·고도·브리핑은 이 수동 경로 결과의 geometry를 공유한다. 사용자 waypoint를 navdata FIX로 위장하지 않는다.
- 기존 노출·고도·브리핑 경로 모델에 전달할 adapter는 공개 항공로 leg와 DCT leg를 모두 명시적으로 표현한다. DCT leg에는 `routeId: null`, 좌표 endpoint, route-segment geometry를 제공한다. DCT 포함 경로도 노출·연직단면·브리핑 요청까지 유효하게 전달돼야 한다.

수동 경로에는 두 기하를 구분한다. `enrouteGeometry`는 편집 문자열의 point/leg만 잇는 선이며 문자열·지도 편집·leg 식별의 기준이다. `finalRouteGeometry`는 선택된 SID/STAR/IAP preview를 en-route 양끝에 이어 붙인 전체 선이며 노출·연직단면·브리핑의 기준이다. route model은 `finalRouteGeometry` 위에 en-route leg를 정렬한다. 절차 끝과 en-route endpoint가 이어지지 않으면, 절차가 아니라 en-route 입력이 잘못 연결된 것으로 보고 적용 전체를 거부한다.

저장 형식은 snapshot v2다. `base`에는 적용 `routeForm`, `procedureIds`(SID/STAR/IAP의 객체가 아닌 안정 key), `enroute.tokens`, `enroute.userWaypoints`, 다음 사용자 waypoint 번호, `etaMode`와 수동 ETA를 저장한다. 별도 `flight`에는 `cruiseAltitudeFt`, `tasKt`, `etd`, `alternateAirport`를 저장한다. 교체공항은 첫 번째 탭에서 숨겨도 기존 저장값을 버리지 않는다. TAS·ETD는 자동 ETA 계산의 입력이므로 수동 ETA와 함께 round-trip되어야 한다. 초안과 pending 편집은 저장하지 않고 불러올 때 적용 base에서 새 초안으로 복제한다. v1 저장값은 기존 `routeForm`·flight 값·VFR waypoint를 v2로 이행하고, 없는 절차 key는 선택 안 함으로 처리한다. 저장/불러오기, import, undo는 VFR의 `id`, `uid`, `lon`, `lat`, `fixed`, `altitudeFt`, `named`를 잃지 않는다.

`FIX airway FIX`는 해당 항공로의 중간 FIX를 내부적으로 확장한다. 문자열에는 시작·항공로·끝만 유지한다. 지도에 보이는 항공로 내부 FIX는 직접 삭제할 수 없으며, 누르면 `항공로 내부 지점은 직접 삭제할 수 없습니다`라고 안내한다. 항공로 내부를 바꾸려면 사용자가 문자열에서 해당 항공로 구간을 다른 구간으로 바꾼다.

문자열 token으로 명시된 공개 FIX endpoint와 사용자 waypoint만 삭제할 수 있다. endpoint를 삭제해 항공로 token이 고아가 되면, 그 항공로 token과 인접한 중복/불필요 DCT를 함께 제거한 새 초안을 제안한다. 항공로는 routeId로 제한한 방향성 탐색으로 확장하며, 경로가 없거나 여러 경로로 모호하면 전체 적용을 거부하고 기존 경로를 유지한다.

첫·마지막 en-route FIX는 삭제하지 않는다. 중간 token 삭제의 재작성은 결정적이다. `A Y711 B DCT C`에서 `B`를 삭제하면 `A DCT C`, `A DCT B Y711 C`에서 `B`를 삭제하면 `A DCT C`가 된다. 삭제 뒤 남은 token이 두 개 미만이면 적용하지 않고 원래 초안을 유지한다.

좌표 토큰은 대소문자와 무관한 `N|S` + 위도 도분(4자리) + `E|W` + 경도 도분(5자리) 한 토큰만 허용한다. 위도는 00°00.0′~90°00.0′, 경도는 000°00.0′~180°00.0′ 범위여야 하며, 내부 좌표는 소수점 4자리로 반올림한다. 공백 분리 좌표, 부분 좌표, 잘못된 반구·범위는 거부한다.

## 자동 생성

자동 생성은 공항 선택만으로 실행하지 않는다. 사용자가 `자동 생성`을 눌렀을 때 기존 자동 생성 로직을 재사용하여 절차와 en-route 문자열을 채운 **자동 생성 초안**을 만든다. 이미 수동 경로가 있으면 `현재 경로를 자동 생성 초안으로 바꿀까요?` 확인 뒤에만 바꾼다. `검색`, `자동검색`, `추천`처럼 겹치거나 기대를 흐리는 행동명은 첫 번째 탭에서 쓰지 않는다. 추천·안전·최적 표현을 추가하지 않는다.

자동 생성은 기존 절차 선택 로직이 이미 사용하는 METAR 입력을, 사용자가 이 버튼을 누른 경우에만 사용할 수 있다. 새 기상 데이터·위험 판단·추천 순위는 만들지 않으며, 결과는 항상 사용자가 고칠 수 있는 `자동 생성 초안`이다. RNAV/ATS 선택 UI를 없앤 뒤 수동/자동 생성 경로의 내부 항로 필터 기본값은 `ALL`이다.

내부적으로는 기존 로직이 하나의 후보를 거리 기준으로 선택할 수 있지만, 후보 목록·점수·추천 표현은 표시하지 않는다. 자동 생성은 기존 기본 경로를 먼저 지우지 않고 초안만 만든 뒤, 덮어쓰기 확인에서 승인될 때만 적용한다.

## 지도 편집

`지도 클릭` 모드에서만 지도 선택이 경로를 바꿀 수 있다. 활성화 중 지도에는 `FIX 추가 모드 — 지점을 선택하세요`처럼 현재 모드와 다음 행동을 고정 표시한다. 공개 FIX를 누르면 선택한 구간, 없으면 가장 가까운 구간에 삽입할 `A → FIX → B` 미리보기와 적용/취소 카드를 표시한다. FIX가 아닌 빈 위치는 5 NM 안 공개 FIX가 있으면 그 FIX를 제안하고, 없으면 DCT 사용자 지점을 제안한다. 적용 전에는 경로를 바꾸지 않는다.

DCT 사용자 지점은 설계안별 `userWaypoints` 목록에 `{ id, name, lat, lon }`으로 보존한다. 이름은 `WP1`, `WP2`로 시작하며 사용자가 바꿔 저장할 수 있다. AMO 편집 문자열의 `WP1`은 이 설계안의 사용자 지점을 뜻한다. 외부 호환 문자열은 이를 단일 좌표 토큰 `N3721.4E12712.8`로 펼쳐 쓴다. 파서는 이 단일 형식과 현재 설계안의 사용자 지점 이름만 허용한다.

한 항공로를 탈 때 사용자는 시작 FIX·항공로·끝 FIX만 지정한다. 내부 경로와 지도는 중간 FIX를 포함하지만 문자열에는 모두 나열하지 않는다.

경로 위에 렌더된 기존 FIX를 누르면 삭제 확인을 표시하고, 승인 후에만 삭제한다. 그 외 공개 FIX는 삽입 확인 대상이다. 경로 선을 먼저 누르면 해당 구간을 강조하며, 그 다음 FIX/DCT 추가는 그 구간에 삽입한다. 선택 구간이 없으면 가장 가까운 구간을 쓴다. 확인 카드에는 언제나 `A → P → B`와 문자열 변경 조각을 표시한다. 적용·취소·다른 구간 선택으로 구간 강조를 해제한다. 모든 확정 변경은 되돌릴 수 있다.

지도 hit 우선순위는 다음과 같다.

1. 기존 경로의 편집 가능한 token endpoint 또는 사용자 waypoint: 삭제 제안
2. 이미 선택한 구간: 그 구간에 새 지점 삽입 제안
3. 경로 선: 구간 선택
4. 공개 FIX: 삽입 제안
5. 빈 지도: 5 NM 공개 FIX 제안 또는 DCT 사용자 waypoint 제안

기준선은 hit 대상이 아니며, 기본 상태 지도 클릭은 아무 경로도 바꾸지 않는다.

지도 이벤트는 하나의 hit resolver가 `queryRenderedFeatures`로 위 우선순위를 한 번만 판정해 하나의 의도만 전달한다. point/line/published FIX/background click이 동시에 중복 처리되어 여러 확인 카드가 열리면 안 된다.

### 지도 source와 임시 편집 표시

지도는 기준선, 적용 경로, 적용 전 제안 경로, 자유곡선을 서로 다른 source로 표시한다. 어느 synchronizer도 다른 상태의 source를 덮어쓰지 않는다. `MapView.jsx`에는 새 state나 `useEffect`를 넣지 않고, 기존 binder와 preview synchronizer에 모델/ref/콜백만 전달한다.

source와 소유자는 고정한다.

| source | layer 역할 | 유일한 소유자 | style reload 뒤 복원 |
|---|---|---|---|
| `briefing-route-baseline` | 공항 직선 기준선 | `syncRoutePreviewLayers` | 같은 synchronizer |
| `briefing-route-applied` | 적용 IFR/VFR 경로와 편집 point | `syncRoutePreviewLayers` | 같은 synchronizer |
| `briefing-route-pending` | 적용 전 제안 경로와 선택 구간 | `syncRoutePreviewLayers` | 같은 synchronizer |
| `briefing-route-draw` | 그리는 중인 자유곡선 | `routePreview` binder | binder가 ref의 마지막 선을 재설정 |

기존 source/layer의 이전표도 고정한다.

| 기존 식별자 | 이전 뒤 위치/역할 |
|---|---|
| `briefing-route-preview`, `briefing-route-preview-line`, `briefing-route-preview-line-hit`, `briefing-route-preview-point` | `briefing-route-applied`의 applied route와 editable point. hit layer는 첫 번째 탭 binder만 사용 |
| `briefing-route-design-line`, `briefing-route-design-line-hit` | 기존 두 번째 탭 design 선택·hit 역할을 유지하는 별도 legacy design source. 첫 번째 탭 source로 합치지 않음 |
| `procedure-preview`와 SID/STAR/IAP line·point layer | 유지. 적용 base의 절차만 표시 |
| 기존 VFR circle/label layer | `briefing-route-applied` compositor feature를 읽되, 해당 source를 직접 `setData`하지 않음 |

style.load에는 먼저 synchronizer가 baseline/applied/pending와 procedure/legacy design source를 만들고 마지막 model로 채운 뒤, binder가 draw source와 이벤트를 복원한다. 그 순서 외의 writer는 없다.

기존 `syncVfrWaypointData()`는 `briefing-route-applied`를 직접 덮어쓰지 않는다. VFR point는 적용 source를 만드는 단일 compositor 입력으로 옮긴다.

지도 제안은 현재 초안 또는 적용 기본 경로에서 파생한다. `적용`만 초안과 기본 경로를 갱신한다. `취소`와 실패는 기준선·초안·기본 경로를 보존하고 임시 제안과 구간 선택만 지운다.

`그리기` 모드는 새 경로 입력용이다. 포인터를 따라 임시 선만 즉시 표시하며, 이동 중 항로 계산을 하지 않는다. 손을 뗀 뒤 한 번만 선을 FIX·항공로 후보로 해석해 변경 문자열과 초안을 보여 주고 적용/다시 그리기/취소를 제공한다. 해석하지 못하면 기존 경로를 유지하고 이유를 안내한다.

## VFR 규칙

VFR도 같은 첫 번째 탭 흐름을 쓴다. 공항 선택 뒤에는 IFR와 마찬가지로 기준선만 보인다. VFR 문자열은 공개 FIX, DCT 좌표, 사용자 waypoint를 허용하지만 항공로 토큰은 허용하지 않는다. 지도 클릭·그리기·삭제는 즉시 확정하지 않고 IFR와 같은 제안 카드와 undo를 거친다. 기존 VFR의 즉시 삽입·드래그 확정은 이 규칙으로 대체한다.

기존 VFR import와 저장 경로는 유지한다. 이전 `vfrWaypoints`는 초안 또는 적용 기본 경로의 수동 route point 목록으로 이행하며, import·undo·저장/불러오기에서 waypoint 순서와 좌표가 보존돼야 한다.

VFR point는 `{ id, uid, lon, lat, fixed, altitudeFt, named }` 전체를 보존한다. `routeStore`, `routeImport`, VFR 고도 편집, undo는 이 필드를 잃지 않는다. IFR의 사용자 waypoint 구조와 VFR point 구조를 하나로 강제하지 않는다.

## 시간 입력

순항속도와 ETD는 입력값이다. ETA는 기본으로 경로 거리·순항속도·ETD에서 계산하며 `자동 계산됨`을 보인다. 사용자가 직접 ETA를 입력하면 `수동 ETA`로 표시해 수동값을 유지하며, `자동 계산`으로 계산값으로 되돌릴 수 있다. 이번 범위에서 이 값들은 기본 비행계획 값이며, 대체안별 분리는 두 번째 탭 설계에서 결정한다.

## 전체 계획 표시와 waypoint 이름 변경

문자열 칸 아래에는 `출발 공항 | SID → en-route → STAR/IAP | 도착 공항` 전체 계획을 읽기 전용으로 보인다. 초안이 있으면 초안 절차·문자열을, 적용 기본 경로가 있으면 적용 값을 표시하고 각각 상태를 함께 밝힌다.

사용자 waypoint 이름 변경은 지도에서 해당 편집 가능한 point를 선택하거나 문자열 아래 waypoint 목록에서 시작한다. 변경은 적용/취소를 제공하며, 적용·이름 변경·삭제 모두 undo와 설계안 복제 독립성의 대상이다.

## 제한

- 기본 경로 포함 최대 4개 설계안, 대체안은 기본 경로 복제 후에만 생성한다.
- 선택 설계안만 절차, 고도 비교, 연직단면, 브리핑으로 전달한다.
- 자동 우회, 추천 순위, 안전 판정, 새 기상 데이터·레이어·점수는 만들지 않는다.
- 기상 레이어 칩은 지도 표시만 바꾼다.
- `MapView.jsx`에 새 state 또는 `useEffect`를 추가하지 않는다.
- 데스크톱과 모바일은 같은 입력 순서·행동 이름·주 행동을 제공한다. 모바일에서 핵심 경로 입력을 숨기지 않는다.
- 공항 선택기는 키보드로 열고 닫고 선택할 수 있으며, 열림 상태·목록·현재 선택을 보조기기에 전달한다.

## 조사 근거

Garmin Pilot의 공식 안내도 지도 편집을 명시적 그래픽 편집·확인 흐름으로 다룬다. Rubber Band 편집은 먼저 leg가 선택 상태가 된 뒤 새 위치로 끌고, 생성된 waypoint를 다시 눌러 수락한다. Freehand는 손가락 궤적에서 항행시설·교차점·공항을 조합해 새 비행계획을 만든다. 항공로는 진입점·항공로·출구점을 선택해 넣고, 내부 waypoint는 확장해 검증할 수 있다. AMO는 이 확인·확장 원칙을 따르되, 자동 회피·안전 판단은 만들지 않는다.

- [Garmin Pilot 지도 편집·Rubber Band·Freehand](https://support.garmin.com/en-MY/?faq=VvyYJYcGBT2wIWeXTjvcY8)
- [Garmin Pilot 항공로 불러오기와 확장 확인](https://support.garmin.com/en-IN/?faq=pdojW6RqZn0H8bsQg6aZO8)
