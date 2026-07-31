import airFrance from '../assets/board-af.png'
import japanAirlines from '../assets/board-jal.png'
import singaporeAirlines from '../assets/board-sq.png'

const genericAirlineMark = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Cpath fill="%23475269" d="M6 25h15l8-15h5l-4 15h12l3 4-3 4H30l4 15h-5l-8-15H6z"/%3E%3C/svg%3E'

const AIRLINE_LOGOS = Object.freeze({
  af: airFrance,
  jal: japanAirlines,
  sq: singaporeAirlines,
  generic: genericAirlineMark,
})

export function airlineLogoFor(logoKey) {
  return AIRLINE_LOGOS[logoKey] || AIRLINE_LOGOS.generic
}
