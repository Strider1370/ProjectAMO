// 고도 슬라이더에 겹쳐 그릴 브리핑 위험(설계 §3.4·§2.1). 판정은 서버 ribbon이 하고 여기서는 고도 범위만 뽑는다.
// - 모델 위험 = 칠함: 순항 중이면 내 고도(꽉 찬 색), 상승·강하 중이면 다른 고도(빗금)
// - 예보관 발표(SIGMET) = 테두리: 내 고도 실선, 다른 고도 점선
// - 고도 없는 위험(대류 점수·태풍)은 축에 그리지 않고 슬라이더 위 "대류 · 전 고도"
// - 비행 범위 = SFC~순항 상자
import { phenomenonKo } from '../../../shared/weather/phenomenonKo.js'
import { formatAltitudeFt, hazardLineColor } from './mapBriefingModel.js'

const RANK = { SEV: 2, MOD: 1 }

export function briefingAltitudeMarks(ribbon, { cruiseAltitudeFt = null } = {}) {
  const bands = []
  const allAltitude = new Map()
  for (const row of ribbon?.rows ?? []) {
    row.model.forEach((segment, index) => {
      if (!segment.altitudeFt) { allAltitude.set(row.key, { key: row.key, text: `${row.label} · 전 고도`, level: segment.level, color: hazardLineColor(row.key, segment.level) }); return }
      const { from, to } = segment.altitudeFt
      bands.push({
        key: `${row.key}:model:${index}`, kind: 'model', row: row.key, label: row.label, level: segment.level,
        lowFt: Math.min(from, to), highFt: Math.max(from, to), mine: segment.phase === 'cruise', color: hazardLineColor(row.key, segment.level),
      })
    })
    row.frames.forEach((frame, index) => {
      if (frame.source === 'TYPHOON') { allAltitude.set('typhoon', { key: 'typhoon', text: '태풍 · 전 고도', level: 'SEV', color: hazardLineColor('typhoon', 'TC') }); return }
      if (!Number.isFinite(frame.bandFt?.highFt)) return
      bands.push({
        key: `${row.key}:frame:${index}`, kind: 'frame', row: row.key, label: `${frame.source} ${phenomenonKo(frame.code) ?? frame.label ?? ''}`.trim(), level: 'SEV',
        lowFt: frame.bandFt.lowFt ?? 0, highFt: frame.bandFt.highFt, mine: Boolean(frame.mine), source: frame.source,
      })
    })
  }
  return {
    bands,
    allAltitude: [...allAltitude.values()],
    flight: Number.isFinite(cruiseAltitudeFt) && cruiseAltitudeFt > 0 ? { lowFt: 0, highFt: cruiseAltitudeFt } : null,
  }
}

// 고도(ft)에서 걸리는 가장 센 위험 한 줄. 기압면 고도와 위험 고도가 딱 맞지 않으므로 ±tolerance 안을 본다.
export function hazardAtAltitude(marks, altitudeFt, { toleranceFt = 1000 } = {}) {
  if (!Number.isFinite(altitudeFt)) return null
  const hits = (marks?.bands ?? []).filter((band) => altitudeFt >= band.lowFt - toleranceFt && altitudeFt <= band.highFt + toleranceFt)
  if (!hits.length) return null
  const best = hits.reduce((a, b) => ((RANK[b.level] ?? 0) > (RANK[a.level] ?? 0) || ((RANK[b.level] ?? 0) === (RANK[a.level] ?? 0) && b.kind === 'frame' && a.kind !== 'frame') ? b : a))
  return { text: best.kind === 'model' ? `${best.label} ${best.level}` : best.label, level: best.level, color: best.color ?? null }
}

// 손잡이 말풍선: "순항 FL250 → 지도 FL240" + 그 기압면의 위험.
export function altitudeBubbleNote(marks, { mapAltitudeFt, mapLabel }) {
  const cruise = marks?.flight?.highFt
  const hazard = hazardAtAltitude(marks, mapAltitudeFt)
  const cruiseText = Number.isFinite(cruise) ? `순항 ${formatAltitudeFt(cruise)}${mapLabel ? ` → 지도 ${mapLabel}` : ''}` : null
  return { text: [cruiseText, hazard?.text].filter(Boolean).join(' · ') || null, hazard }
}
