// 첫 사용자 온보딩 투어 스텝 정의 (데이터 전용).
// target: 스포트라이트 구멍을 뚫을 CSS 셀렉터(기존 aria-label·클래스 재사용).
// mapAirport: 지도 마커(canvas)를 좌표 투영해 원형·클릭형 스포트라이트.
// 진행은 전부 수동([다음]) — 사용자가 열린 패널/상세를 볼 시간을 갖도록. 클릭은 하되 자동진행 없음.
// 스펙: docs/superpowers/specs/2026-07-14-first-run-onboarding-tour.md
export const TOUR_STEPS = [
  {
    id: 'advisory',
    target: '[data-tour="advisory"]',
    text: '위험(SIGMET·경보)은 여기 상시 요약됩니다.',
    optional: true, // 활성 위험 0이면 배지 바 미렌더 → 이 스텝만 auto-skip(다른 스텝은 항상 표시).
  },
  {
    // 색 설명 + 실제 마커 클릭을 한 스텝으로. 구멍 클릭 시 RKSI 선택(패널 열림)하되 자동진행 안 함.
    // 패널이 열리면(revealSelector) 스포트라이트가 마커→열린 공항 패널로 이동(패널이 마커·툴팁을 가리므로).
    id: 'airport',
    mapAirport: 'RKSI',
    revealSelector: '.airport-panel',
    text: '마커 색이 기상 심각도입니다(녹색 정상 · 앰버 주의 · 적색 위험). RKSI를 눌러 METAR·TAF·경보를 열어 보고, 다 보시면 다음을 누르세요.',
  },
  {
    id: 'met',
    target: '[aria-label="기상정보"]',
    revealSelector: '.layer-tile-groups', // 열린 기상 레이어 패널(동시 하나만 열림)
    text: '기상정보를 눌러 레이더·위성·바람 오버레이를 켜 보세요. 다 보시면 다음을 누르세요.',
  },
  {
    id: 'aviation',
    target: '[aria-label="항공정보"]',
    revealSelector: '.layer-tile-groups', // 열린 항공 레이어 패널
    text: '항공정보를 눌러 공역·항로·ADS-B 레이어를 살펴보세요. 다 보시면 다음을 누르세요.',
  },
  {
    id: 'route',
    target: '[aria-label="비행 전 브리핑"]',
    revealSelector: '.route-check-panel', // 열린 경로 확인 패널
    text: '비행 전 브리핑을 눌러 항로 이륙 가부(Go/No-go)를 확인해 보세요. 다 보시면 다음을 누르세요.',
  },
]

export const TOUR_STORAGE_KEY = 'amo.tour.v1.done'
