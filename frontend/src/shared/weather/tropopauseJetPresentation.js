// 권계면·제트 지도와 범례가 공유하는 표현값. 계산 자료(KIM 원 격자)는 바꾸지 않는다.
// 권계면은 낮을수록 진한 파랑 5단계(검증된 순차 단계 250~650), FL450 이상은 칠하지 않는다.
export const TROP_CAP_FL = 450
// 평활된 FL450 평탄부의 수치 꼬리를 잘라 내는 표시 경계(20 ft 허용).
// 면의 투명 전환과 TROP 450 선에 같은 값을 쓴다.
export const TROP_CLEAR_FL = TROP_CAP_FL - 0.2
export const TROP_BANDS = Object.freeze([
  { from: -Infinity, to: 300, color: '#104281', label: '<300' },
  { from: 300, to: 340, color: '#1c5cab', label: '300' },
  { from: 340, to: 380, color: '#2a78d6', label: '340' },
  { from: 380, to: 420, color: '#5598e7', label: '380' },
  { from: 420, to: TROP_CAP_FL, color: '#86b6ef', label: '420' },
])
export const TROP_EDGE_LEVELS = Object.freeze([300, 340, 380, 420, TROP_CAP_FL])
export const TROP_LABEL = Object.freeze({ fill: '#e8f1fc', stroke: '#1c5cab', text: '#104281' })
// 제트 표기는 SIGWX HIGH와 같은 검정 잉크·흰 테두리.
export const JET_INK = Object.freeze({ ink: '#111111', halo: '#ffffff' })
export const JET_MIN_KT = 80
