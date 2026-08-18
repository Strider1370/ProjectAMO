// 저장 브리핑의 기본 이름. 같은 노선을 여러 번 저장하는 것이 정상 사용이라(같은 구간을 반복
// 비행하는 조종사가 많다), 목록에서 구분되려면 이름에 ETD와 순항고도가 있어야 한다.
const TRANSITION_ALTITUDE_FT = 14000 // 국내 전이고도. 이 위는 FL, 아래는 ft.

const hhmmZ = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

const altitudeLabel = (ft) => {
  const value = Number(ft)
  if (!Number.isFinite(value) || value <= 0) return null
  return value >= TRANSITION_ALTITUDE_FT
    ? `FL${String(Math.round(value / 100)).padStart(3, '0')}`
    : `${value.toLocaleString('en-US')} ft`
}

export function defaultBriefingName({ departureAirport, arrivalAirport, etd, cruiseAltitudeFt } = {}) {
  const route = [departureAirport, arrivalAirport].filter(Boolean).join(' → ')
  const time = hhmmZ(etd)
  return [route || '브리핑', time && `ETD ${time}`, altitudeLabel(cruiseAltitudeFt)]
    .filter(Boolean)
    .join(' · ')
}

export default { defaultBriefingName }
