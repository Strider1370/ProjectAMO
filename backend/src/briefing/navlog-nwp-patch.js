function legKey(leg) {
  const startNm = Number(leg?.startNm)
  const endNm = Number(leg?.endNm)
  if (!leg?.from || !leg?.to || !Number.isFinite(startNm) || !Number.isFinite(endNm)) return null
  return `${leg.from}-${leg.to}-${startNm.toFixed(2)}-${endNm.toFixed(2)}`
}

function nwpLeg(leg) {
  const key = legKey(leg)
  return key ? {
    key,
    wind: leg.wind ?? null,
    temp: leg.temp ?? null,
    icing: leg.icing ?? null,
    turbulence: leg.turbulence ?? null,
  } : null
}

export function buildNavlogNwpPatch({ legs = [], procedures = [] } = {}) {
  return {
    legs: legs.map(nwpLeg).filter(Boolean),
    procedures: procedures.map((procedure) => ({
      type: procedure.type,
      id: procedure.id,
      legs: (procedure.legs ?? []).map(nwpLeg).filter(Boolean),
    })),
  }
}
