import { findProcedureByToken, TOKEN_KINDS } from './routeTokens.js'

const fixFor = (proc, kind) => String((kind === 'SID' ? proc?.enrouteFix : proc?.startFix ?? proc?.enrouteFix) ?? '').toUpperCase()

// 항로의 순서와 명시된 구간 방향으로 확인할 수 있을 때만 연결로 표시한다.
function connectedThroughAirway(route, from, to) {
  const sequence = route?.sequence
  if (!Array.isArray(sequence) || sequence.filter((name) => name === from).length !== 1 || sequence.filter((name) => name === to).length !== 1) return false
  const start = sequence.indexOf(from), end = sequence.indexOf(to)
  if (start < 0 || end < 0) return false
  const step = start < end ? 1 : -1
  for (let i = start; i !== end; i += step) {
    const a = sequence[i], b = sequence[i + step]
    const rule = route.segmentRules?.find((item) => (item.from === a && item.to === b) || (item.from === b && item.to === a))
    const allowed = rule?.allowedDirection ?? route.allowedDirection
    if (allowed !== 'both' && allowed !== (step === 1 ? 'sequence' : 'reverse')) return false
  }
  return true
}

function procedureConnection(proc, kind, tokens, at, routes) {
  const fix = fixFor(proc, kind)
  if (!fix) return null
  let index = kind === 'SID' ? at : at - 1
  if (tokens[index]?.kind === TOKEN_KINDS.PROCEDURE) index += kind === 'SID' ? 1 : -1
  const adjacent = tokens[index]
  if (adjacent?.kind === TOKEN_KINDS.FIX && adjacent.text === fix) return fix
  if (adjacent?.kind !== TOKEN_KINDS.AIRWAY) return null
  const anchor = tokens[index + (kind === 'SID' ? 1 : -1)]
  if (anchor?.kind !== TOKEN_KINDS.FIX) return null
  const from = kind === 'SID' ? fix : anchor.text
  const to = kind === 'SID' ? anchor.text : fix
  return connectedThroughAirway(routes[adjacent.text], from, to) ? fix : null
}

/** 위치에 맞는 절차와 일반 항행자료. 연결을 확인하지 못하면 일반 후보로 남긴다. */
export function buildRouteSuggestions({ query, tokens = [], at = 0, flightRule, departure, arrival, sidOptions = [], starOptions = [], lookups = {} }) {
  const q = String(query ?? '').trim().toUpperCase()
  if (!q || /\s/.test(q)) return []
  const routes = lookups.routes ?? {}
  const departureSide = flightRule === 'IFR' && departure && at === 1 && tokens[0]?.text === departure
  const arrivalSide = flightRule === 'IFR' && arrival && at === tokens.length - 1 && tokens.at(-1)?.text === arrival
  const groups = []
  const add = (label, items) => { if (items.length) groups.push({ label, items }) }
  for (const [enabled, kind, options, airport] of [[departureSide, 'SID', sidOptions, departure], [arrivalSide, 'STAR', starOptions, arrival]]) {
    if (!enabled) continue
    const entries = options.filter((proc) => (!proc.airport || proc.airport === airport) && String(proc.name ?? '').toUpperCase().startsWith(q)).map((proc) => ({
      key: `${kind}:${proc.id}`, name: proc.name, value: proc.name, kind,
      connection: procedureConnection(proc, kind, tokens, at, routes),
    })).filter((entry) => entry.value)
    const title = kind === 'SID' ? '출발절차' : '도착절차'
    add(`경로와 연결되는 ${title}`, entries.filter((entry) => entry.connection))
    add(`${entries.some((entry) => entry.connection) ? '다른 ' : ''}${title} · ${kind}`, entries.filter((entry) => !entry.connection))
  }
  const preceding = findProcedureByToken(tokens[at - 1]?.text, sidOptions)
  const following = findProcedureByToken(tokens[at]?.text, starOptions)
  const expected = new Set([fixFor(preceding, 'SID'), fixFor(following, 'STAR')].filter(Boolean))
  const names = new Set([...Object.keys(lookups.navpoints ?? {}), ...(lookups.fixes ?? []), ...(lookups.userWaypoints ?? []).map((p) => p.name).filter(Boolean)])
  const fixes = [...names].map((name) => String(name).toUpperCase()).filter((name) => name.startsWith(q)).sort().map((name) => ({ key: `FIX:${name}`, name, value: name, kind: 'FIX', connection: expected.has(name) ? name : null }))
  add('절차와 연결되는 웨이포인트', fixes.filter((entry) => entry.connection))
  add('웨이포인트', fixes.filter((entry) => !entry.connection))
  if (flightRule === 'IFR') add('항로', Object.keys(routes).filter((name) => name.startsWith(q)).sort().map((name) => ({ key: `AIRWAY:${name}`, name, value: name, kind: 'AIRWAY' })))
  return groups
}
