// 노선 — 상층바람·기온 "원자료" 표 모델 (층×웨이포인트).
// crossSection.levels(T + u/v, m/s) + verticalProfile(markers·flightPlan)로 순수 변환.
// 하이라이트 = 각 웨이포인트에서 실제 비행경로 고도 최근접 층(표를 대각선 관통).

const MS_TO_KT = 1.94384

// u/v(m/s) → 기상풍향(불어오는 방향)/풍속(kt).
export function uvToWind(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  const speedKt = Math.round(Math.hypot(u, v) * MS_TO_KT)
  const dir = Math.round((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360
  return { dir: String(dir).padStart(3, '0'), speedKt }
}

function nearestValue(values, distanceNm) {
  let best = null
  let bestD = Infinity
  for (const v of values ?? []) {
    const d = Math.abs((v.distanceNm ?? 0) - distanceNm)
    if (d < bestD) { bestD = d; best = v }
  }
  return best
}

// 계획고도 프로파일 포인트(distanceNm↑ 정렬) 선형보간.
export function altitudeAtDistance(points, distanceNm) {
  const pts = (points ?? []).filter((p) => Number.isFinite(p.distanceNm) && Number.isFinite(p.altitudeFt))
  if (pts.length === 0) return null
  if (distanceNm <= pts[0].distanceNm) return pts[0].altitudeFt
  for (let i = 1; i < pts.length; i += 1) {
    if (distanceNm <= pts[i].distanceNm) {
      const a = pts[i - 1]
      const b = pts[i]
      const span = b.distanceNm - a.distanceNm
      if (span <= 0) return b.altitudeFt
      const r = (distanceNm - a.distanceNm) / span
      return a.altitudeFt + (b.altitudeFt - a.altitudeFt) * r
    }
  }
  return pts[pts.length - 1].altitudeFt
}

// 마커가 많으면 처음·끝 유지하며 균등 샘플(최대 maxCols).
export function pickColumns(markers, maxCols = 7) {
  const ms = (markers ?? []).filter((m) => Number.isFinite(m.distanceNm))
  if (ms.length <= maxCols) return ms
  const out = []
  const step = (ms.length - 1) / (maxCols - 1)
  for (let i = 0; i < maxCols; i += 1) out.push(ms[Math.round(i * step)])
  return out
}

export function buildRawWindsTable(crossSection, verticalProfile) {
  const levels = (crossSection?.levels ?? []).filter((l) => Number.isFinite(l.altFt))
  const columns = pickColumns(verticalProfile?.markers)
  if (levels.length === 0 || columns.length === 0) return null

  const points = verticalProfile?.flightPlan?.profile?.points ?? []
  const plannedAlt = columns.map((c) => altitudeAtDistance(points, c.distanceNm))

  const rows = levels.map((l) => ({
    fl: `FL${String(Math.round(l.altFt / 100)).padStart(3, '0')}`,
    altFt: l.altFt,
    cells: columns.map((c) => {
      const v = nearestValue(l.values, c.distanceNm)
      const w = v ? uvToWind(v.u, v.v) : null
      return {
        wind: w ? `${w.dir}/${w.speedKt}` : '—',
        temp: v && Number.isFinite(v.t) ? Math.round(v.t) : null,
        highlight: false,
      }
    }),
  }))

  // 각 컬럼: 계획고도 최근접 층 셀 하이라이트.
  plannedAlt.forEach((alt, ci) => {
    if (!Number.isFinite(alt)) return
    let best = -1
    let bestD = Infinity
    rows.forEach((r, ri) => { const d = Math.abs(r.altFt - alt); if (d < bestD) { bestD = d; best = ri } })
    if (best >= 0) rows[best].cells[ci].highlight = true
  })

  return { columns: columns.map((c) => ({ label: c.label, distanceNm: c.distanceNm })), rows }
}

export default { uvToWind, altitudeAtDistance, pickColumns, buildRawWindsTable }
