import { createContext } from 'react'

// 고도 슬라이더 위에 겹쳐 그릴 표시(지도형 브리핑의 위험 고도·비행 범위). 값이 없으면 슬라이더는 그대로다.
// { bands: [{ key, lowFt, highFt, kind: 'model'|'frame', mine, color, label, level }], allAltitude: [{ key, text, color }],
//   flight: { lowFt, highFt } | null, noteFor(altitudeFt, mapLabel) → { text, hazard } }
export const AltitudeMarksContext = createContext(null)
