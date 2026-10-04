// 연직단면도에서 KIM 자료가 없는 영역: 최상층(150 hPa) 위, 그리고 수집 영역 밖 구간.
// 이 경계에서 등온선·등풍속선이 끊기는 이유를 보여 주기 위한 것이며, 값은 만들지 않는다.
export function buildProfileNoDataAreas({ levels = [], xFor, yFor, altFor, yMax, plotLeft, plotRight }) {
  const usable = levels.filter(l => Array.isArray(l.values) && l.values.length)
  if (!usable.length) return []
  const top = usable.reduce((a, b) => (b.pressure < a.pressure ? b : a))
  const areas = []
  const topAlt = altFor(top)
  if (Number.isFinite(topAlt) && topAlt < yMax) {
    areas.push({ key: 'top', x: plotLeft, y: yFor(yMax), w: plotRight - plotLeft, h: yFor(topAlt) - yFor(yMax), label: `자료 없음 (${top.pressure} hPa 위)` })
  }
  // 수집 영역 밖이거나 결측인 구간: 모든 층에서 어떤 값(기온·바람·습도·구름·착빙)도 없는 연속 구간을 전체 높이로 칠한다.
  const values = top.values
  const FIELDS = ['t', 'u', 'v', 'spread', 'moistureSpread', 'cld', 'icing']
  const hasData = (level, i) => FIELDS.some(k => Number.isFinite(level.values[i]?.[k]))
  const missing = (_, i) => !usable.some(level => hasData(level, i))
  let start = null
  values.forEach((v, i) => {
    if (missing(v, i) && start === null) start = i
    if ((!missing(v, i) || i === values.length - 1) && start !== null) {
      const end = missing(v, i) ? i : i - 1
      const x0 = start === 0 ? plotLeft : xFor((values[start - 1].distanceNm + values[start].distanceNm) / 2)
      const x1 = end === values.length - 1 ? plotRight : xFor((values[end].distanceNm + values[end + 1].distanceNm) / 2)
      if (x1 - x0 > 1) areas.push({ key: `side-${start}`, x: x0, y: yFor(yMax), w: x1 - x0, h: yFor(0) - yFor(yMax), label: '자료 없음' })
      start = null
    }
  })
  // 글자 위치: 영역 밖 구간은 세로 가운데, 150 hPa 위 띠는 왼쪽 영역 밖 구간을 피해 그 오른쪽에 둔다.
  const leading = areas.find(a => a.key.startsWith('side') && a.x <= plotLeft + 1)
  for (const area of areas) {
    if (area.key === 'top') { area.labelX = (leading ? leading.x + leading.w : area.x) + 8; area.labelY = area.y + Math.min(area.h / 2, 14) + 4 }
    else { area.labelX = area.x + 8; area.labelY = area.y + area.h / 2 }
  }
  return areas
}
