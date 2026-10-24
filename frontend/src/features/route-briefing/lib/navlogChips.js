import { phenomenonKo } from '../../../shared/weather/phenomenonKo.js'

// NAVLOG 위험기상 칸과 표 위 요약 줄. 위험 막대와 같은 기준으로 MOD 이상만 칩으로 낸다 —
// 서버는 난류가 없는 구간에도 'none'(착빙은 0)을 보내므로 "값이 있다"로 거르면 '난류 none' 칩이 생긴다.

const ICING_LEVEL = { 2: 'MOD', 3: 'SEV' }
const TURBULENCE_LEVEL = { moderate: 'MOD', severe: 'SEV' }
const TURBULENCE_RANK = { none: 0, light: 1, moderate: 2, severe: 3 }

function modelChip(key, name, level) {
  if (!level) return null
  return { key, label: `${name} ${level}`, level: level === 'SEV' ? 'red' : 'amber' }
}

export function icingChip(peakLevel) {
  return modelChip('icing', '착빙', ICING_LEVEL[Number(peakLevel)])
}

export function turbulenceChip(peakLevel) {
  return modelChip('turb', '난류', TURBULENCE_LEVEL[peakLevel])
}

// 구간에 걸린 SIGMET 등 발표. 고도를 알 수 없는 발표는 확인할 거리라 회색으로 남긴다.
function advisoryChips(hazards = [], keyPrefix = 'h') {
  return hazards.map((hazard, i) => {
    const unknown = hazard.verticalStatus === 'unknown'
    return {
      key: `${keyPrefix}${i}`,
      label: phenomenonKo(hazard.code) || hazard.label || hazard.code,
      note: unknown ? '고도 판정 불가' : null,
      level: unknown ? 'gray' : 'red',
    }
  })
}

export function legHazardChips(leg) {
  return [icingChip(leg?.icing?.peakLevel), turbulenceChip(leg?.turbulence?.peakLevel), ...advisoryChips(leg?.hazards)].filter(Boolean)
}

// 절차(SID·STAR+IAP)는 안쪽 구간들의 최고 강도 하나씩 + 겹치지 않는 발표.
export function procedureHazardChips(procedure) {
  const legs = procedure?.legs ?? []
  const icingPeak = Math.max(0, ...legs.map((leg) => Number(leg.icing?.peakLevel) || 0))
  const turbulencePeak = legs.reduce((peak, leg) => (TURBULENCE_RANK[leg.turbulence?.peakLevel] ?? 0) > (TURBULENCE_RANK[peak] ?? 0) ? leg.turbulence.peakLevel : peak, null)
  const seen = new Set()
  const advisories = legs.flatMap((leg, i) => advisoryChips(leg.hazards, `p${i}-`))
    .filter((chip) => {
      const id = `${chip.label}-${chip.note}-${chip.level}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  return [icingChip(icingPeak), turbulenceChip(turbulencePeak), ...advisories].filter(Boolean)
}

// 표 위 한 줄: 거리 가중 평균 바람성분, 가장 센 맞바람 구간, ISA 편차 범위. 자료가 없으면 그 항목은 null.
export function navlogSummary(legs = []) {
  const winds = legs.filter((leg) => Number.isFinite(leg?.wind?.meanComponentKt) && Number(leg.distanceNm) > 0)
  const totalNm = winds.reduce((sum, leg) => sum + Number(leg.distanceNm), 0)
  const meanComponentKt = totalNm > 0 ? Math.round(winds.reduce((sum, leg) => sum + leg.wind.meanComponentKt * Number(leg.distanceNm), 0) / totalNm) : null
  const strongestHead = winds.filter((leg) => leg.wind.meanComponentKt < 0)
    .reduce((worst, leg) => (!worst || leg.wind.meanComponentKt < worst.wind.meanComponentKt ? leg : worst), null)
  const isa = legs.map((leg) => leg?.temp?.isaDevC).filter(Number.isFinite)
  return {
    meanComponentKt,
    maxHeadwind: strongestHead ? { kt: Math.abs(strongestHead.wind.meanComponentKt), from: strongestHead.from, to: strongestHead.to } : null,
    isaRange: isa.length ? { min: Math.min(...isa), max: Math.max(...isa) } : null,
  }
}
