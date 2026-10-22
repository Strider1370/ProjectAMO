// 첫 사용자 온보딩 투어 스텝 정의 (데이터 전용).
// target: 스포트라이트 구멍을 뚫을 CSS 셀렉터(기존 aria-label·클래스 재사용).
// mapAirport: 지도 마커(canvas)를 좌표 투영해 원형·클릭형 스포트라이트.
// title·text: 설명, action: 대상을 열기 전 할 일, revealedText: 대상(패널)이 열린 뒤 안내.
// 진행은 전부 수동([다음]) — 사용자가 열린 패널/상세를 볼 시간을 갖도록. 클릭은 하되 자동진행 없음.
// 스펙: docs/superpowers/specs/2026-07-14-first-run-onboarding-tour.md
export const TOUR_STEPS = [
  {
    // 첫 화면: 대상 없이 가운데 카드. 시험용 프로토타입 소개 + 실제 운항에 쓰지 말라는 주의(사용자 결정, 2026-10-22).
    id: 'welcome',
    center: true,
    hero: '/images/tour-welcome-sky.webp',
    badge: '항공기상청 ProjectAMO팀',
    title: 'ProjectAMO 사용 안내',
    text: 'ProjectAMO는 항공기상정보 통합 제공 방식의 시험 운영을 위한 프로토타입 웹페이지입니다.',
    features: [
      { icon: 'map', title: '통합 표출', text: '관측·예보·SIGMET 등 항공기상정보를 지도 기반 단일 화면에 통합 표출합니다.' },
      { icon: 'route', title: '비행 전 기상브리핑', text: '비행경로(출발지-항로-목적지)를 입력하면 해당 경로를 기준으로 기상브리핑을 생성합니다.' },
    ],
    caution: '본 웹페이지는 기상청 공식 서비스가 아닙니다. 공개 API(기상청 API허브 등) 자료를 수집·가공하여 표출하므로 자료가 지연·누락되거나 오류가 있을 수 있습니다.',
    cautionEmphasis: '실제 운항 판단에는 항공기상청 공식 자료와 정식 브리핑을 기준으로 하시기 바랍니다.',
    note: '‘안내 시작’을 누르면 주요 기능을 단계별로 소개합니다.',
    nextLabel: '안내 시작',
  },
  {
    // 사이드바 전체를 강조 — 접고 펴면 폭이 바뀌어도 구멍이 따라간다.
    id: 'sidebar',
    target: '.sidebar',
    title: '메뉴',
    text: '왼쪽 사이드바에서 비행 전 브리핑, 내 지도, NOTAM, ADS-B 등 주요 메뉴로 이동합니다.',
    action: '왼쪽 위 ☰ 버튼을 누르면 사이드바를 접고 펼 수 있습니다.',
  },
  {
    id: 'advisory',
    target: '[data-tour="advisory"]',
    title: '위험기상 요약',
    text: '발표 중인 SIGMET·AIRMET·공항경보를 지도 상단에 상시 요약하여 표시합니다.',
    action: '배지를 누르면 발표 목록이 열립니다.',
    // 발표된 것이 없으면 요약 막대가 아예 없다 → 같은 자리에 예시 배지를 띄워 보여 준다(TourOverlay).
    demo: 'advisory',
    demoText: '현재 발표된 정보가 없어 예시로 표시합니다.',
  },
  {
    // 색 설명 + 실제 마커 클릭을 한 스텝으로. 구멍 클릭 시 RKSI 선택(패널 열림)하되 자동진행 안 함.
    // 패널이 열리면(revealSelector) 스포트라이트가 마커→열린 공항 패널로 이동(패널이 마커·툴팁을 가리므로).
    id: 'airport',
    mapAirport: 'RKSI',
    revealSelector: '.airport-panel',
    title: '공항 기상',
    text: '공항 마커 색상은 비행등급을 나타냅니다. 마커를 누르면 공항경보·METAR·TAF·AMOS·NOTAM을 공항 단위로 확인할 수 있습니다.',
    legend: 'flightCategory', // 마커와 같은 색 견본(TourOverlay)
    action: 'RKSI 마커를 눌러 보세요.',
    revealedText: '공항 패널이 열렸습니다. 확인 후 ‘다음’을 누르세요.',
  },
  {
    id: 'met',
    target: '[aria-label="기상정보"], [aria-label="기상정보 레이어"]',
    // 열린 기상 레이어 패널 전체(머리 포함). 안쪽 목록(.layer-tile-groups)을 잡으면 패널보다 길어 강조가 밖으로 삐져나왔다.
    revealSelector: '.layer-drawer[aria-label="기상 레이어 토글"]',
    title: '기상 레이어',
    text: '레이더·위성·낙뢰 관측과 수치예보 레이어를 지도 위에 겹쳐 표시합니다. 하단 시간 막대를 옮기면 해당 시각의 자료로 바뀝니다.',
    action: '‘기상정보’를 눌러 레이어 목록을 열어 보세요.',
    revealedText: '레이어를 켜고 끄며 확인한 뒤 ‘다음’을 누르세요.',
  },
  {
    id: 'aviation',
    target: '[aria-label="항공정보"], [aria-label="항공정보 레이어"]',
    revealSelector: '.layer-drawer[aria-label="항공 레이어 토글"]',
    title: '항공 레이어',
    text: '공역·항공로·항행시설 등 항공정보를 지도 위에 겹쳐 표시합니다.',
    action: '‘항공정보’를 눌러 레이어 목록을 열어 보세요.',
    revealedText: '레이어를 켜고 끄며 확인한 뒤 ‘다음’을 누르세요.',
  },
  {
    id: 'route',
    target: '[aria-label="비행 전 브리핑"]',
    revealSelector: '.route-check-panel', // 열린 경로 확인 패널
    title: '비행 전 브리핑',
    text: '출발·도착 공항과 경로를 입력하면 경로상 위험기상, 연직단면도, 공항 기상을 지도 위에 모아 브리핑을 생성합니다.',
    action: '‘비행 전 브리핑’을 눌러 경로 입력 화면을 열어 보세요.',
    revealedText: '경로를 입력해 브리핑을 만들어 볼 수 있습니다. 안내를 마치려면 ‘완료’를 누르세요.',
  },
]

export const TOUR_STORAGE_KEY = 'amo.tour.v1.done'
