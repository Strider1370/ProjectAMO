# UI/UX 디자인 누락 방지 체크리스트

조사일: 2026-10-25. 사용자가 제시한 12개 항목을 유지하고, 화면 배치·컴포넌트 상태·입력·조작에서 추가로 빠뜨리기 쉬운 24개 항목을 조사했다. 개발 아키텍처·데이터 수집·CI 항목은 제외했다.

이 문서는 조사·체크리스트 초안이다. 현재 프로젝트 규칙의 정본은 [디자인 헌법](../policies/design/design-language.md)이다. 아래 해결법과 체크 기준은 공식 문서를 바탕으로 정리한 프로젝트 적용 제안이며, 모두가 외부 표준의 의무 사항인 것은 아니다.

## 사용자가 제시한 기존 항목 — 유지

- [ ] 최대 너비 제한 (Max-width Container)
- [ ] 콘텐츠 영역 가림 방지 (Header / Footer Offset)
- [ ] 텍스트 오버플로우 처리 (Text Overflow / Ellipsis)
- [ ] 안전 영역 확보 (Safe Area Inset)
- [ ] 터치 타깃 영역 확보 (Touch Target Size)
- [ ] 입력 폼 모바일 키보드 가림 방지 (Keyboard Obstruction)
- [ ] 모달/드로어의 다양한 닫기 방식 (Multi-dismiss Pattern)
- [ ] 데이터 없음·오류 상태 (Empty / Error State)
- [ ] 클릭 커서·누름 피드백 (Cursor Pointer / Pressed State)
- [ ] 중복 클릭 방지·로딩 버튼 (Loading Button / Debounce)
- [ ] 포커스 링 (Focus Ring)
- [ ] 모션 감소 배려 (Prefers-reduced-motion)

## 추가 조사 항목

### 1. 레이아웃·스크롤에서 추가할 항목

#### UX01. 동적 화면 높이 (Dynamic Viewport Units)

- **놓치는 부분:** 모바일 주소창이 나타나거나 사라질 때 100vh 패널의 하단 버튼이 화면 밖으로 밀림.
- **해결법:** 전체 높이 패널의 목적에 맞춰 dvh/svh를 선택하고, 내용이 길면 내부 스크롤을 허용한다. 키보드 가림은 별도로 확인한다.
- [ ] **체크 기준:** 주소창 표시·숨김, 가로 화면에서도 마지막 내용과 닫기/확인 버튼에 도달한다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length)

#### UX02. 스크롤 전파 방지 (Scroll Chaining / Overscroll Behavior)

- **놓치는 부분:** 드로어 목록 끝까지 스크롤하면 뒤 페이지나 지도가 함께 움직임.
- **해결법:** 독립 스크롤 영역에 overscroll-behavior를 검토하고, 모달 배경의 스크롤을 잠근다. 닫은 뒤 정상 복구한다.
- [ ] **체크 기준:** 목록의 위·아래 끝에서 계속 스크롤해도 배경이 의도치 않게 움직이지 않는다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)

#### UX03. 스크롤바 공간 확보 (Scrollbar Gutter)

- **놓치는 부분:** 목록 길이 변화나 모달 열기로 스크롤바가 사라지면서 전체 화면이 좌우로 흔들림.
- **해결법:** 일반 스크롤바 환경에서 scrollbar-gutter: stable 등으로 공간을 확보한다. 별도 스크롤 잠금 처리와 중복 보정하지 않는다.
- [ ] **체크 기준:** 짧은/긴 목록 전환과 모달 열기/닫기 전후에 본문·버튼이 좌우로 튀지 않는다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter)

#### UX04. 스크롤 이동 여백 (Scroll Padding / Scroll Margin)

- **놓치는 부분:** 목차나 오류 항목으로 이동하면 대상이 sticky 헤더 바로 뒤에 숨음.
- **해결법:** 스크롤 컨테이너의 scroll-padding 또는 대상의 scroll-margin으로 이동 시 필요한 여백을 정한다.
- [ ] **체크 기준:** 목차·오류 링크로 이동한 항목의 제목과 입력창이 헤더 아래에서 보인다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-padding-top)

#### UX05. 레이어 겹침 순서 (Stacking Context / Z-index Scale)

- **놓치는 부분:** 드롭다운이 카드 뒤로 숨거나, 툴팁이 모달의 반투명 배경 아래에 깔림.
- **해결법:** 메뉴·팝오버·모달·토스트의 레이어 순서를 정하고 부모의 stacking context와 잘림을 함께 확인한다.
- [ ] **체크 기준:** 화면 가장자리와 스크롤 패널 안에서도 열린 메뉴가 온전히 보이고 조작된다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context)

#### UX06. 콘텐츠 비율·공간 예약 (Aspect Ratio / Reserved Space)

- **놓치는 부분:** 이미지나 미리보기가 로딩된 순간 카드 높이가 바뀌어 누르려던 버튼이 이동함.
- **해결법:** 미디어 영역에 aspect-ratio 또는 크기를 지정하고, 스켈레톤도 실제 콘텐츠와 비슷한 공간을 차지하게 한다.
- [ ] **체크 기준:** 로딩 전후 주요 버튼과 읽던 문단의 위치가 갑자기 밀리지 않는다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/aspect-ratio)

### 2. 텍스트·가독성에서 추가할 항목

#### UX07. 긴 문자열 줄바꿈 (Overflow Wrap / Word Break)

- **놓치는 부분:** 공백 없는 URL·긴 영문명 때문에 카드가 화면보다 넓어짐. 말줄임만 적용하면 필요한 원문을 읽지 못함.
- **해결법:** 전체를 읽어야 하는 내용은 overflow-wrap 등으로 줄바꿈하고, 한글·영문·식별자의 의미가 부자연스럽게 끊기지 않도록 구분한다.
- [ ] **체크 기준:** 긴 한글명·URL·공백 없는 문자열을 넣어도 페이지 가로 스크롤이 생기지 않고 필요한 원문을 읽을 수 있다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-wrap)

#### UX08. 숫자 고정폭 (Tabular Numerals)

- **놓치는 부분:** 시간·풍속 숫자가 바뀔 때 열이 흔들리거나 세로 비교가 어려움.
- **해결법:** 숫자 표에는 지원 글꼴의 font-variant-numeric: tabular-nums를 검토하고 숫자 정렬·소수점·단위 위치를 통일한다.
- [ ] **체크 기준:** 111과 888, 음수와 소수 값이 섞여도 열이 안정되고 비교가 쉽다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric)

#### UX09. 비텍스트 대비 (Non-text Contrast)

- **놓치는 부분:** 글자는 읽히지만 입력 테두리·체크 표시·슬라이더 손잡이가 배경과 구분되지 않음.
- **해결법:** 조작이나 상태를 알아보는 데 필요한 시각 요소는 인접 색과의 대비를 확인한다. WCAG 해당 요소는 3:1 기준과 예외를 따른다.
- [ ] **체크 기준:** 입력 위치·체크 상태·필수 아이콘을 흐린 화면에서도 구분하고, 해당 요소의 대비 기준을 충족한다.
- 근거: [공식 지침/자료](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

#### UX10. 색상 외 상태 단서 (Non-color Indicators)

- **놓치는 부분:** 초록/빨강이나 회색/파랑 차이만으로 정상·경고·선택 상태를 표시함.
- **해결법:** 상태명·아이콘·윤곽·패턴을 함께 써서 색을 구별하지 않아도 의미가 전달되게 한다.
- [ ] **체크 기준:** 색을 제거해 보아도 위험 등급과 선택 상태를 알아볼 수 있다.
- 근거: [공식 지침/자료](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)

### 3. 컴포넌트 상태·피드백에서 추가할 항목

#### UX11. 선택 상태와 누름 상태 구분 (Selected State vs Pressed State)

- **놓치는 부분:** 탭·토글이 눌리는 순간만 반응하고, 손을 떼면 현재 선택을 알 수 없음.
- **해결법:** 순간적인 pressed 피드백과 지속적인 selected 표시를 별도로 디자인한다. 선택 상태를 hover에 의존하지 않는다.
- [ ] **체크 기준:** 마우스를 치우거나 터치를 끝낸 뒤에도 현재 탭과 켜진 옵션이 식별된다.
- 근거: [공식 지침/자료](https://m2.material.io/go/design-states/)

#### UX12. 비활성화 사유 안내 (Disabled State Explanation)

- **놓치는 부분:** 버튼이 회색인데 왜 사용할 수 없는지, 무엇을 해야 활성화되는지 알 수 없음.
- **해결법:** 비활성 상태뿐 아니라 필요한 조건을 버튼 주변의 보조 문구로 설명한다. 비활성 버튼의 hover 툴팁에만 이유를 넣지 않는다.
- [ ] **체크 기준:** 버튼을 누르지 않아도 비활성 이유와 활성화 방법을 알 수 있다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/button/usage)

#### UX13. 스켈레톤 로딩 (Skeleton Loading)

- **놓치는 부분:** 로딩 중 콘텐츠 영역이 텅 비거나 실제 화면과 무관한 막대가 보여 구조를 예측하기 어려움.
- **해결법:** 구조가 알려진 카드·목록에 실제 배치와 비슷한 스켈레톤을 쓰고, 긴 작업은 별도의 진행 표시를 선택한다.
- [ ] **체크 기준:** 로딩 중 무엇이 들어올 자리인지 알 수 있고, 완료 후 구조가 크게 바뀌지 않는다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/skeleton/usage)

#### UX14. 피드백 표면 선택 (Toast / Message Bar / Dialog)

- **놓치는 부분:** 복사 완료에도 모달을 띄우거나, 중요한 오류를 금방 사라지는 토스트에만 표시함.
- **해결법:** 짧은 결과는 토스트, 계속 확인해야 하는 상태는 인라인 메시지/메시지 바, 사용자 결정이 필요한 상황은 다이얼로그로 구분한다.
- [ ] **체크 기준:** 메시지의 중요도와 지속 시간이 맞고, 읽거나 대응해야 하는 내용이 먼저 사라지지 않는다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/toast/usage)

#### UX15. 구체적인 행동 라벨 (Action-oriented Labels)

- **놓치는 부분:** 모든 버튼이 확인/예여서 삭제인지 저장인지 누르기 전 결과를 예측하기 어려움.
- **해결법:** 저장, 필터 적용, 경로 삭제처럼 실행할 행동을 버튼명에 쓴다. 위험 행동의 대상·영향도 주변 문구로 알린다.
- [ ] **체크 기준:** 버튼명과 인접 설명만 보고 누른 뒤 일어날 일을 예측할 수 있다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/button/usage)

#### UX16. 점진적 공개 (Progressive Disclosure)

- **놓치는 부분:** 보조 설정까지 한꺼번에 보여 화면이 복잡하거나, 반대로 핵심 상태까지 접힌 영역에 숨김.
- **해결법:** 핵심 내용은 먼저 보여주고 저빈도 상세·고급 옵션을 더보기/아코디언으로 제공한다. 펼침 여부와 숨은 내용의 성격을 표시한다.
- [ ] **체크 기준:** 기본 작업은 상세를 모두 열지 않고 할 수 있고, 추가 정보가 있다는 사실도 발견할 수 있다.
- 근거: [공식 지침/자료](https://www.nngroup.com/articles/progressive-disclosure/)

### 4. 입력 폼에서 추가할 항목

#### UX17. 지속적인 입력 라벨 (Persistent Labels)

- **놓치는 부분:** placeholder를 항목명으로 써서 입력을 시작하면 무엇을 쓰는 칸인지 사라짐.
- **해결법:** 입력칸 밖의 고정 라벨 또는 겹침 없는 floating label을 제공한다. placeholder는 예시로만 쓴다.
- [ ] **체크 기준:** 값 입력·자동완성 후에도 항목명이 보인다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/field/usage)

#### UX18. 보조 문구·단위 표시 (Helper Text / Prefix / Suffix)

- **놓치는 부분:** 시간 형식·허용 범위·수치 단위를 오류가 난 뒤에야 알게 됨.
- **해결법:** 입력 전 필요한 형식·범위를 짧게 안내하고, 단위나 접두·접미 정보는 값과 구분해 지속 표시한다.
- [ ] **체크 기준:** 빈 칸에서도 무엇을 어떤 형식과 단위로 입력할지 알 수 있다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/field/usage)

#### UX19. 인라인 오류와 검증 시점 (Inline Validation / Validation Timing)

- **놓치는 부분:** 입력 첫 글자부터 오류가 뜨거나, 제출 후 멀리 있는 토스트에만 오류가 나옴.
- **해결법:** 항목 특성에 따라 입력 완료·포커스 이탈·제출 시점을 정하고 해당 필드 근처에 원인과 수정 방법을 표시한다. 수정 후 오류를 적절히 해제한다.
- [ ] **체크 기준:** 사용자가 입력하는 중 불필요하게 오류로 몰리지 않고, 실패 시 어디를 어떻게 고칠지 알 수 있다.
- 근거: [공식 지침/자료](https://fluent2.microsoft.design/components/web/react/core/field/usage)

#### UX20. 모바일 입력 최적화 (Input Mode / Autocomplete)

- **놓치는 부분:** 숫자 칸에 문자 키보드가 뜨고, 음수·소수나 필요한 기호를 입력하기 어려움.
- **해결법:** 값의 성격에 맞는 inputmode와 자동완성을 선택한다. 숫자처럼 보여도 식별자인 값은 앞자리 0 등의 보존을 고려한다.
- [ ] **체크 기준:** 모바일에서 필요한 숫자·기호를 쉽게 입력하고 자동완성이 작업을 방해하지 않는다.
- 근거: [공식 지침/자료](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode)

### 5. 팝업·터치·탐색에서 추가할 항목

#### UX21. 툴팁 접근과 유지 (Tooltip: Hover / Focus / Persistence)

- **놓치는 부분:** 마우스를 올려야만 설명이 보이거나, 설명 쪽으로 옮기면 사라져 읽을 수 없음.
- **해결법:** 키보드 포커스로도 열고, 닫기·포인터 이동·읽을 시간을 보장한다. 터치에서 필요한 정보는 정보 버튼/팝오버 등 명시적인 진입점을 준다.
- [ ] **체크 기준:** 마우스·키보드·터치에서 필요한 설명에 접근하고 읽기를 마칠 수 있다.
- 근거: [공식 지침/자료](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)

#### UX22. 모달 포커스 순환·복귀 (Focus Trap / Focus Return)

- **놓치는 부분:** 모달이 떠 있는데 Tab이 뒤 화면으로 가거나, 닫은 후 포커스 위치를 잃음.
- **해결법:** 열 때 내부로 포커스를 이동하고 Tab 순환을 내부에 유지하며, 닫으면 실행 버튼 또는 자연스러운 다음 대상으로 돌려준다.
- [ ] **체크 기준:** 키보드로 열기→내부 이동→닫기→다음 작업이 끊기지 않는다.
- 근거: [공식 지침/자료](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

#### UX23. 드래그 대체 조작 (Drag Alternative)

- **놓치는 부분:** 슬라이더·항목 순서 변경·지도 조작이 정밀한 드래그에만 의존함.
- **해결법:** 이전/다음 버튼·직접 값 입력·이동 메뉴 등 드래그 없는 대안을 제공한다.
- [ ] **체크 기준:** 끌기 동작 없이도 같은 결과를 만들 수 있다.
- 근거: [공식 지침/자료](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

#### UX24. 스크롤 발견성 (Scroll Affordance)

- **놓치는 부분:** 가로 탭·목록이 화면에 딱 맞아 보여 뒤에 항목이 더 있다는 사실을 모름.
- **해결법:** 다음 항목 일부 노출·스크롤바·이동 버튼 등으로 계속되는 내용을 알린다. 색상 범례와 혼동할 장식 효과는 피한다.
- [ ] **체크 기준:** 별도 설명 없이 추가 콘텐츠가 있다는 사실과 이동 방법을 알아볼 수 있다.
- 근거: [공식 지침/자료](https://www.nngroup.com/articles/scrolling-and-scrollbars/)

## 작업에 적용하는 방법

해당 화면에 있는 요소만 검사한다. 각 항목은 통과·수정 필요·해당 없음으로 기록하며, 해당 없음에는 짧게 이유를 남긴다. 기존 항목을 새 항목으로 대체하지 않는다.

- 레이아웃·패널 작업: 기존 배치 항목 + UX01~UX06, UX24.
- 텍스트·표 작업: UX07~UX10.
- 버튼·탭·로딩·메시지 작업: UX11~UX16.
- 입력 폼 작업: 기존 키보드·중복 클릭 항목 + UX17~UX20.
- 모달·툴팁·슬라이더 작업: 기존 닫기·터치·포커스 항목 + UX21~UX23.

이 문서 작성으로 필수 정책이나 자동 검사가 추가되지는 않았다.
