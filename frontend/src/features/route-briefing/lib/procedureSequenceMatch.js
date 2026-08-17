function normalize(value) {
  return String(value ?? '').trim().toUpperCase()
}

function termName(term) {
  return normalize(term?.kind === 'user-waypoint' ? term?.name : term?.id ?? term?.name)
}

function procedureFixes(procedure) {
  return (procedure?.fixes ?? [])
    .map((fix) => normalize(fix?.id))
    .filter((id) => id && !/^RWY\d{2}[LRC]?$/.test(id))
}

function procedureCoordinates(procedure) {
  return (procedure?.fixes ?? [])
    .filter((fix) => !/^RWY\d{2}[LRC]?$/.test(normalize(fix?.id)))
    .map((fix) => [fix?.coordinates?.lon ?? fix?.lon, fix?.coordinates?.lat ?? fix?.lat])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
}

function matchesAt(terms, fixes, start) {
  return fixes.length > 0
    && start >= 0
    && start + fixes.length <= terms.length
    && fixes.every((fix, index) => termName(terms[start + index]) === fix)
}

function uniqueMatch(procedures, terms, start) {
  const matches = (procedures ?? []).filter((procedure) => matchesAt(terms, procedureFixes(procedure), start))
  return matches.length === 1 ? matches[0] : null
}

function uniqueArrivalMatch(procedures, terms) {
  const matches = []
  for (const procedure of procedures ?? []) {
    const fixes = procedureFixes(procedure)
    for (let start = terms.length - fixes.length; start >= 0; start -= 1) {
      if (matchesAt(terms, fixes, start)) matches.push({ procedure, start, count: fixes.length })
    }
  }
  return matches.length === 1 ? matches[0] : null
}

export function matchImportedProcedures({ terms = [], sidOptions = [], starOptions = [] } = {}) {
  const sid = uniqueMatch(sidOptions, terms, 0)
  const sidCount = procedureFixes(sid).length
  const remainingAfterSid = sid ? terms.slice(sidCount) : terms

  const starMatch = uniqueArrivalMatch(starOptions, remainingAfterSid)
  const star = starMatch?.procedure ?? null
  const procedureSpans = [
    ...(sid ? [{ type: 'SID', procedure: sid, start: 0, count: sidCount }] : []),
    ...(star ? [{ type: 'STAR', procedure: star, start: sidCount + starMatch.start, count: starMatch.count }] : []),
  ]

  return {
    sid,
    star,
    procedureSpans,
    starInsertionIndex: starMatch?.start ?? null,
    terms: star
      ? [...remainingAfterSid.slice(0, starMatch.start + 1), ...remainingAfterSid.slice(starMatch.start + starMatch.count)]
      : remainingAfterSid,
  }
}

// FPL은 절차라는 메타데이터 없이 단일 waypoint 순서만 보낸다. 정확히 맞춘 절차 범위만
// 공식 절차 좌표열로 치환해, 지도·비교·브리핑이 동일한 단일 좌표열을 쓰게 한다.
export function buildImportedProcedureCoordinates({ sourceCoordinates = [], termCoordinateStart = 0, procedureSpans = [] } = {}) {
  const coordinates = [...sourceCoordinates]
  for (const span of [...procedureSpans].sort((a, b) => b.start - a.start)) {
    const replacement = procedureCoordinates(span.procedure)
    if (replacement.length === 0) continue
    coordinates.splice(termCoordinateStart + span.start, span.count, ...replacement)
  }
  return coordinates
}
