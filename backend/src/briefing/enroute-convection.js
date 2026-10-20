import { readKimAciIndex, readKimAciField } from '../processors/kim-aci-store.js'
import { ACI_MISSING, ACI_SCORE_SCALE } from '../../../shared/aci.js'
import { missingIntervals, thresholdIntervals } from './enroute-model.js'

// 위험 막대의 대류 줄: KIM 대류영역(실험) 점수를 경로 축 샘플마다 읽어 구간으로 만든다.
// 점수는 고도 구분이 없는 0~1 값이라 지도 색 구간과 같은 0.5(MOD)·0.75(SEV)로 나눈다.
const MOD_SCORE = 0.5
const SEV_SCORE = 0.75

function classifyScore(score) { return score >= SEV_SCORE ? '심' : score >= MOD_SCORE ? '중' : null }

// ETD에 가장 가까운 유효시각. ETD가 없으면 첫 시각.
function nearestTime(times, etd) {
  const etdMs = Date.parse(etd)
  if (!Number.isFinite(etdMs)) return times[0] ?? null
  let best = null
  for (const time of times) {
    const ms = Date.parse(time?.validTime)
    if (!Number.isFinite(ms)) continue
    if (!best || Math.abs(ms - etdMs) < best.delta) best = { time, delta: Math.abs(ms - etdMs) }
  }
  return best?.time ?? null
}

function scoreAt(field, lon, lat) {
  const g = field.grid
  const dx = (g.lonMax - g.lonMin) / (g.nx - 1)
  const dy = (g.latMax - g.latMin) / (g.ny - 1)
  const x = Math.round((lon - g.lonMin) / dx)
  const y = Math.round((lat - g.latMin) / dy)
  if (x < 0 || x >= g.nx || y < 0 || y >= g.ny) return null
  const raw = field.score[y * g.nx + x]
  return raw == null || raw === ACI_MISSING ? null : raw * ACI_SCORE_SCALE
}

const UNAVAILABLE = { status: 'unavailable', intervals: [], missing: [], run: null }

// status: found(MOD 이상 구간 있음) · none(MOD 이상 없음) · unavailable(자료 없음·영역 밖·읽기 실패).
export function buildEnrouteConvection({ root, axis, etd, domain = 'ea', readIndex = readKimAciIndex, readField = readKimAciField } = {}) {
  if (!root || !axis?.samples?.length) return UNAVAILABLE
  try {
    const time = nearestTime(readIndex(root, domain)?.times ?? [], etd)
    if (!time) return UNAVAILABLE
    const field = readField({ root, domain, tmfc: time.tmfc, hf: time.hf, revision: time.revision })
    const series = axis.samples.map((sample) => ({ distanceNm: sample.distanceNm, value: scoreAt(field, sample.lon, sample.lat) }))
    if (!series.some((point) => point.value != null)) return UNAVAILABLE
    const intervals = thresholdIntervals(series, classifyScore)
    return {
      status: intervals.length ? 'found' : 'none',
      intervals,
      missing: missingIntervals(series),
      run: { tmfc: time.tmfc, hf: Number(time.hf), validTime: time.validTime ?? null, domain },
    }
  } catch {
    return UNAVAILABLE
  }
}

export default { buildEnrouteConvection }
