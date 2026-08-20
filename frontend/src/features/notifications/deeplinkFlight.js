// 알림에서 들어온 비행 번호(?flight=<routeId>) — **페이지가 뜰 때 한 번만** 읽어 둔다.
//
// 읽은 뒤 주소에서는 지운다(consumeDeeplinkFlight). 안 지우면 새로고침할 때마다 그 비행이
// 계속 다시 열려서, 브리핑을 닫아도 화면이 되살아난다.
//
// 지워도 이 값은 남으므로 변경점 띠는 "무엇 때문에 불려 왔는지"를 계속 보여줄 수 있다.
// 값의 수명은 딱 이번 페이지다 — 다음 새로고침에는 주소에 없으니 null이 되고, 그래서
// 오래된 쪽지가 엉뚱한 때 엉뚱한 비행을 여는 일이 생기지 않는다.

export function parseFlightId(search) {
  const raw = new URLSearchParams(search ?? '').get('flight')
  const id = Number(raw)
  return raw && Number.isFinite(id) ? id : null
}

// 주소에서 flight만 뺀 나머지. airport 같은 다른 딥링크는 건드리지 않는다.
export function searchWithoutFlight(search) {
  const params = new URLSearchParams(search ?? '')
  params.delete('flight')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

const initialFlightId = typeof window === 'undefined' ? null : parseFlightId(window.location.search)

export function deeplinkFlightId() {
  return initialFlightId
}

// 주소창에서만 지운다 — 페이지를 다시 열지 않으므로 위에서 쥔 값은 그대로 남는다.
export function consumeDeeplinkFlight() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const { pathname, hash } = window.location
  window.history.replaceState(null, '', `${pathname}${searchWithoutFlight(window.location.search)}${hash}`)
}

export default { deeplinkFlightId, consumeDeeplinkFlight, parseFlightId, searchWithoutFlight }
