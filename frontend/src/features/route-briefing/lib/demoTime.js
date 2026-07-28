export function resolveDemoEtd({ currentEtd, demoOn, lastAppliedDemoNowMs, demoNowMs }) {
  if (!demoOn || !Number.isFinite(demoNowMs) || demoNowMs === lastAppliedDemoNowMs) return currentEtd
  const value = new Date(demoNowMs)
  value.setUTCSeconds(0, 0)
  return value.toISOString().replace('.000Z', 'Z')
}

export function selectEffectiveEtd({ storedEtd, demoOn, demoNowMs, userEdited }) {
  if (!demoOn || userEdited || !Number.isFinite(demoNowMs)) return storedEtd
  return resolveDemoEtd({
    currentEtd: storedEtd,
    demoOn: true,
    lastAppliedDemoNowMs: null,
    demoNowMs,
  })
}
