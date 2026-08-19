function legKey(leg) {
  const startNm = Number(leg?.startNm)
  const endNm = Number(leg?.endNm)
  if (!leg?.from || !leg?.to || !Number.isFinite(startNm) || !Number.isFinite(endNm)) return null
  return `${leg.from}-${leg.to}-${startNm.toFixed(2)}-${endNm.toFixed(2)}`
}

function mergeLegs(legs = [], patches = []) {
  const byKey = new Map(patches.map((patch) => [patch.key, patch]))
  return legs.map((leg) => {
    const patch = byKey.get(legKey(leg))
    return patch ? { ...leg, wind: patch.wind, temp: patch.temp, icing: patch.icing, turbulence: patch.turbulence } : leg
  })
}

export function mergeNavlogNwpPatch(enroute = {}, patch = {}) {
  const procedurePatches = new Map((patch.procedures ?? []).map((procedure) => [`${procedure.type}:${procedure.id}`, procedure.legs]))
  return {
    ...enroute,
    legs: mergeLegs(enroute.legs, patch.legs),
    procedures: (enroute.procedures ?? []).map((procedure) => ({
      ...procedure,
      legs: mergeLegs(procedure.legs, procedurePatches.get(`${procedure.type}:${procedure.id}`)),
    })),
  }
}
