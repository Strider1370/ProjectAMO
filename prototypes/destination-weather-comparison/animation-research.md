# 터미널 목적지 날씨 화면 애니메이션 조사

## 이번 비교안

### 1. Split-flap / Flip board

- 과거 공항·기차역 출발 안내판처럼 한 정보 단위가 앞뒤로 뒤집히며 바뀌는 방식이다.
- 공항이라는 장소의 인상이 강하고, 변경이 드문 편명·목적지·게이트에 잘 어울린다.
- 패널·구분선과 `출발 예정`, `탑승구`, `운항 상태` 같은 고정 라벨은 움직이지 않는다. 도시명·편명·시간·게이트 번호·상태값·날씨값처럼 실제로 변경되는 정보만 뒤집힌다.
- 여러 값이 동시에 뒤집히면 읽기 어려우므로 목적지 → 편명 → 출발 정보 → 상태 → 현재 날씨 → 예보 순서로 짧게 시차를 둔다.
- 1안의 `FLAP / 뒤집기` 버튼으로 비교할 수 있다.

### 2. Vertical roll / Reel transition

- 사용자가 말한 “새 글자가 위에서 아래로 내려오는” 방식이다. `masked vertical slide`라고도 표현할 수 있다.
- 패널과 구분선은 고정하고, 도시명·공항코드·편명·시간·게이트·온도·예보처럼 실제로 바뀌는 정보 조각만 기존 내용은 아래로 빠지고 새 내용은 위에서 내려온다.
- 정보 조각 사이에는 18 ms, 행 사이에는 140 ms의 시차를 두어 한꺼번에 떨어지는 대신 위에서 아래로 흐르게 한다.
- 3D 회전이 없어 split-flap보다 글자 형태가 안정적이고, 승객이 멀리서 읽는 화면에는 이쪽이 더 무난하다.
- 1안의 `ROLL / 세로 롤` 버튼으로 비교할 수 있다.

### 3. Wipe / Masked reveal

- 패널은 그대로 둔 채 새 정보가 왼쪽에서 오른쪽으로 마스크를 벗으며 나타난다.
- 바뀌는 영역의 경계가 분명하고 split-flap보다 단정하다.
- 목적지 → 편명 → 출발 정보 → 상태 → 날씨 → 예보 순서로 행마다 시차를 둔다.
- 1안의 `WIPE / 마스크` 버튼으로 비교할 수 있다.

### 4. Crossfade / Dissolve

- 기존 정보가 흐려지는 동안 새 정보가 같은 위치에서 선명해진다.
- 방향성이 없어 가장 차분하고 판독이 안정적이지만, 공항 화면만의 개성은 가장 약하다.
- 1안의 `FADE / 겹침` 버튼으로 비교할 수 있다.

## 함께 검토할 만한 전환 종류

| 종류 | 동작 | 이 화면에 맞는 용도 |
|---|---|---|
| Staggered cascade | 행이나 열마다 짧은 시간차를 두고 순서대로 시작 | 목적지부터 예보까지 읽는 순서를 안내 |
| Wipe / masked reveal | 고정된 레이아웃 위로 마스크가 지나가며 새 내용을 노출 | 숫자·짧은 상태 문구를 안정적으로 교체 |
| Push / directional slide | 기존 영역이 빠지는 방향으로 새 영역이 뒤따라 진입 | 카드나 전체 구역 단위 전환 |
| Crossfade / dissolve | 기존 내용과 새 내용을 겹쳐 투명도로 교체 | 움직임을 최소화해야 하는 기본 대체안 |
| 3D flip / rotate | X축 또는 Y축으로 면을 회전 | split-flap의 공항 감성을 강조할 때 제한적으로 사용 |
| Full-page slide | 화면 전체가 이동하고 다음 화면이 뒤따라 진입 | 운영 화면과 이미지 안내 화면처럼 성격이 다른 페이지 전환 |

## 적용 판단

- 터미널 승객 화면의 기본 후보는 `Vertical roll`이다. 글자의 방향과 형태가 전환 중에도 비교적 예측 가능하다.
- 공항 특유의 인상을 우선하면 `Split-flap`이 더 기억에 남는다.
- 변화 위치를 또렷하게 보여주면서 움직임을 절제하려면 `Wipe`, 가장 보수적이고 조용한 운영 화면에는 `Crossfade`가 적합하다.
- 두 방식 모두 행별 캐스케이드를 사용하되, `Vertical roll`은 행 안에서도 단어·숫자·아이콘 단위로 한 번 더 시차를 둔다. 한 행의 전환이 끝나기 전에 다음 행을 조금 먼저 시작해 전체 전환이 늘어지지 않게 한다.
- 전환 시간은 표시 시간을 침범하지 않는 별도 시간으로 취급한다. 실제 운영에서는 콘텐츠가 완전히 정착한 뒤부터 체류 시간을 계산한다.
- 운영체제에서 동작 줄이기를 선택한 경우 즉시 교체로 대체한다.

## 3안 비교 구현

3안은 상단에서 다음 다섯 방식을 직접 선택하며, 선택 즉시 다음 3편으로 전환해 차이를 비교한다.

| 버튼 | 움직이는 범위 | 고정되는 기준 |
|---|---|---|
| `CASCADE` | 세 항공편 행이 짧은 시차로 왼쪽으로 빠지고 다음 행이 뒤따라 진입 | 헤더·푸터 |
| `FLAP` | 목적지·편명·시각·운항 값·예보 값만 X축으로 뒤집힘 | 고정 라벨·행 경계·타임라인·도착 강조 면 |
| `ROLL` | FLAP과 같은 변경 값만 아래로 빠지고 위에서 진입 | 고정 라벨·행 경계·타임라인·도착 강조 면 |
| `WIPE` | 각 행을 왼쪽에서 오른쪽으로 마스크 공개 | 헤더·푸터 |
| `FADE` | 각 행을 짧은 시차로 교차 페이드 | 헤더·푸터 |

Fluent 2는 큰 최상위 화면 전환에는 빠른 페이드를 권장하고, 움직임은 기능적·짧고·일관되게 제한한다. 따라서 `FADE`를 가장 조용한 대안으로 두고, `FLAP/ROLL`은 위치 변화를 알려야 하는 실제 데이터 요소만 움직인다. 모든 모드는 레이아웃을 다시 계산하는 크기·위치 속성 대신 합성 가능한 `transform`과 `opacity`를 중심으로 사용한다.

## 참고 자료

- [MDN CSS transform](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform) — translate·rotate 기반 구현과 접근성 주의
- [Fluent 2 Motion](https://fluent2.microsoft.design/motion) — 기능적·자연스러운 모션, 최상위 전환의 빠른 fade, 접근 가능한 짧은 움직임
- [MDN CSS performance optimization](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS) — 레이아웃 재계산을 피하는 transform·opacity 중심 애니메이션
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) — 사용자 동작 줄이기 설정 대응
- [Motion stagger](https://motion.dev/docs/stagger) — 여러 요소의 시작 시간을 순차적으로 배치하는 방식
- [SlideShow digital-signage transitions](https://slideshow.digital/documentation/playback/on-screen-formatting/transitions-animations/) — fade, slide, fold, flip, cube 등 사이니지 전환 분류와 시간 범위
- [WireSpring digital-signage motion](https://www.wirespring.com/dynamic_digital_signage_and_interactive_kiosks_journal/articles/Making_great_digital_signage_content__Motion__silhouettes_and_animation-431.html) — 전환 시간과 실제 판독 시간을 분리해야 한다는 사이니지 원칙
- [JMU accessible digital signs](https://www.jmu.edu/accessibility/digital-accessibility/guides/digital-signs.shtml) — 큰 글자와 충분한 읽기 시간 권고
- [Split-flap display overview](https://splitflaptv.com/learn/what-is-a-split-flap-display/) — 공항·역사식 split-flap의 명칭과 특성
