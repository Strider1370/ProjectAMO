const PROCEDURE_ORDER = ['SID', 'STAR', 'IAP']

function waypointRow(waypoint, key) {
  return { kind: 'waypoint', waypoint, key }
}

function baseLegRows(legs, keyPrefix = '') {
  const rows = []

  legs.forEach((leg, index) => {
    if (index === 0 || legs[index - 1]?.to !== leg.from) {
      rows.push(waypointRow(leg.from, `${keyPrefix}waypoint-${index}-from`))
    }

    rows.push({ kind: 'leg', leg, index, key: `${keyPrefix}leg-${index}` })
    rows.push(waypointRow(leg.to, `${keyPrefix}waypoint-${index}-to`))
  })

  return rows
}

function mergeArrivalProcedures(procedures) {
  if (!procedures.length) return null
  const first = procedures[0]
  const last = procedures.at(-1)
  const rawDistances = procedures.map((procedure) => procedure.distanceNm)
  const hasCompleteDistance = rawDistances.every((value) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)))
  const distanceNm = hasCompleteDistance
    ? Math.round(rawDistances.reduce((sum, value) => sum + Number(value), 0) * 100) / 100
    : null
  return {
    type: 'ARRIVAL',
    id: procedures.map((procedure) => procedure.id).join(' · '),
    procedureIds: procedures.map((procedure) => procedure.id),
    from: first.from,
    to: last.to,
    startNm: first.startNm,
    endNm: last.endNm,
    distanceNm,
    legs: procedures.flatMap((procedure) => procedure.legs ?? []),
  }
}

export function buildNavlogRows(legs = [], procedures = []) {
  if (!procedures.length) return baseLegRows(legs)

  const orderedProcedures = PROCEDURE_ORDER.flatMap((type) => procedures.filter((procedure) => String(procedure?.type ?? '').toUpperCase() === type))
  const arrival = mergeArrivalProcedures(orderedProcedures.filter((procedure) => ['STAR', 'IAP'].includes(String(procedure.type).toUpperCase())))
  const routeItems = [
    ...orderedProcedures.filter((procedure) => String(procedure.type).toUpperCase() === 'SID').map((procedure) => ({ kind: 'procedure', procedure })),
    ...legs.map((leg, index) => ({ kind: 'leg', leg, index })),
    ...(arrival ? [{ kind: 'procedure', procedure: arrival }] : []),
  ]
  const rows = []

  routeItems.forEach((item, routeIndex) => {
    const from = item.kind === 'procedure' ? item.procedure.from : item.leg.from
    const to = item.kind === 'procedure' ? item.procedure.to : item.leg.to
    if (rows.at(-1)?.kind !== 'waypoint' || rows.at(-1)?.waypoint !== from) {
      rows.push(waypointRow(from, `route-${routeIndex}-from`))
    }

    if (item.kind === 'procedure') {
      rows.push({ kind: 'procedure', procedure: item.procedure, key: `procedure-${item.procedure.type}-${item.procedure.id}` })
    } else {
      rows.push({ kind: 'leg', leg: item.leg, index: item.index, key: `leg-${item.index}` })
    }
    rows.push(waypointRow(to, `route-${routeIndex}-to`))
  })

  return rows
}
