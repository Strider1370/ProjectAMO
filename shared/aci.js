// Experimental three-input score. Thresholds are design choices, not calibration.
export const LEGACY_SETTINGS = Object.freeze({
  capeLow: 0, capeHigh: 1000, rainLow: 0, rainHigh: 5,
  olrLow: 150, olrHigh: 250,
  capeWeight: 1, rainWeight: 1, olrWeight: 1,
})

// Adopted after the expanded-area map comparison; still an experimental score.
export const DEFAULTS = Object.freeze({
  capeLow: 0, capeHigh: 2500, rainLow: 0.2, rainHigh: 5,
  olrLow: 180, olrHigh: 230,
  capeWeight: 0.2, rainWeight: 0.4, olrWeight: 0.4,
})

const clamp = x => Math.max(0, Math.min(1, x))
export function validateSettings(s) {
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(s[key])) throw new Error(`Invalid ${key}`)
  for (const name of ['cape', 'rain', 'olr']) {
    if (s[`${name}Low`] < 0 || s[`${name}High`] <= s[`${name}Low`]) throw new Error(`Invalid ${name} range`)
    if (s[`${name}Weight`] < 0) throw new Error(`Invalid ${name} weight`)
  }
  if (s.capeWeight + s.rainWeight + s.olrWeight <= 0) throw new Error('At least one weight is required')
}
export function calculateScore(input, settings = DEFAULTS) {
  validateSettings(settings)
  const { cape, rainRate, olr } = input
  // Missing input stays missing; never silently substitute zero or reweight it.
  if (![cape, rainRate, olr].every(Number.isFinite) || cape < 0 || rainRate < 0 || olr < 0) return null
  const c = clamp((cape - settings.capeLow) / (settings.capeHigh - settings.capeLow))
  const r = clamp((rainRate - settings.rainLow) / (settings.rainHigh - settings.rainLow))
  const o = clamp((settings.olrHigh - olr) / (settings.olrHigh - settings.olrLow))
  const total = settings.capeWeight + settings.rainWeight + settings.olrWeight
  const contributions = [c * settings.capeWeight / total, r * settings.rainWeight / total, o * settings.olrWeight / total]
  return { score: contributions.reduce((a, b) => a + b, 0), membership: [c, r, o], contributions }
}

export const ACI_SCORE_VERSION = 'aci-3var-v2';
export const ACI_BANDS = Object.freeze([
  { min: 0, color: '#cbd5e1' }, { min: 0.25, color: '#facc15' },
  { min: 0.5, color: '#fb923c' }, { min: 0.75, color: '#ef4444' },
]);
export const ACI_SCORE_SCALE = 0.0001;
export const ACI_MISSING = -32768;
export function packAciScore(input, settings = DEFAULTS) {
  const result = calculateScore(input, settings);
  return result ? Math.floor(result.score * 10000) : ACI_MISSING;
}
