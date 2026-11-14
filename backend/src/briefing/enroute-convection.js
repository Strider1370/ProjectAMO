import { readKimAciIndex, readKimAciField } from '../processors/kim-aci-store.js'
import { ACIM_DISPLAY_MIN_FL, acimDisplayFl } from '../../../shared/acim.js'
import { missingIntervals, thresholdIntervals } from './enroute-model.js'

// 위험 막대의 대류 줄: KIM ACIM 예상 운정고도(FL)를 경로 축 샘플마다 읽어 구간으로 만든다.
// 지도와 같은 운정 FL별로 구간을 나눈다. 운정고도는 난류·착빙의 MOD/SEV 강도가 아니다.
function classifyTop(topFl) { return topFl >= ACIM_DISPLAY_MIN_FL ? `FL${topFl}` : null }

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

function topAt(field, lon, lat) {
  const g = field.grid
  const dx = (g.lonMax - g.lonMin) / (g.nx - 1)
  const dy = (g.latMax - g.latMin) / (g.ny - 1)
  const x = Math.round((lon - g.lonMin) / dx)
  const y = Math.round((lat - g.latMin) / dy)
  if (x < 0 || x >= g.nx || y < 0 || y >= g.ny) return null
  const i = y * g.nx + x
  // 지도와 같은 표시 기준. FL250 미만은 0, 결측은 null.
  return acimDisplayFl(field.topFl?.[i])
}

const UNAVAILABLE = { status: 'unavailable', intervals: [], missing: [], run: null }

// status: found(MOD 이상 구간 있음) · none(MOD 이상 없음) · unavailable(자료 없음·영역 밖·읽기 실패).
export function buildEnrouteConvection({ root, axis, etd, domain = 'ea', readIndex = readKimAciIndex, readField = readKimAciField } = {}) {
  if (!root || !axis?.samples?.length) return UNAVAILABLE
  try {
    const time = nearestTime(readIndex(root, domain)?.times ?? [], etd)
    if (!time) return UNAVAILABLE
    const field = readField({ root, domain, tmfc: time.tmfc, hf: time.hf, revision: time.revision })
    const series = axis.samples.map((sample) => ({ distanceNm: sample.distanceNm, value: topAt(field, sample.lon, sample.lat) }))
    if (!series.some((point) => point.value != null)) return UNAVAILABLE
    const intervals = thresholdIntervals(series, classifyTop).map(({ level, ...interval }) => ({ ...interval, topFl: Number(level.slice(2)) }))
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
