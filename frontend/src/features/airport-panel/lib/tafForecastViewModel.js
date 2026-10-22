import { tafSlotView } from './tafViewModel.js'

// 백엔드가 붙인 taf.forecast(주 예보 구간 + TEMPO/PROB, backend/src/parsers/taf-forecast.js)를
// 공항패널 타임라인의 줄·칸·카드로 바꾼다. 값 판정(비행조건·시정·운고·강풍·강수)은 기존 슬롯 뷰를 그대로 쓴다.
//
// - 주 예보 칸: 줄마다 같은 값이 이어지는 구간. BECMG로 바뀐 칸은 변화 시간대 시작부터 그리고 becmg를 단다.
// - TEMPO/PROB 칸: 그 변화군이 실제로 바꾼 줄에만 둔다. 비행조건 줄은 항상 두되, 그대로면 same.
// - 주 예보 칸 중 TEMPO가 가르는 칸은 pieces(덮이지 않은 조각)로 나누고 split 표시를 단다.
const HOUR = 3600e3

export const TAF_FORECAST_ROWS = [
  { key: 'cat', label: '비행조건', changed: null },
  { key: 'wx', label: '날씨', changed: 'weather' },
  { key: 'wind', label: '바람', changed: 'wind' },
  { key: 'vis', label: '시정(m)', changed: 'visibility' },
  { key: 'cloud', label: '구름(ft)', changed: 'clouds' },
]

const CEILING_AMOUNTS = /^(BKN|OVC|VV)/

function windCell(view) {
  const wind = view.slot?.wind
  const text = view.windText
  const gust = /^(\w{3}\d{2,3})(G\d{2,3}\w+)$/.exec(text)
  return {
    text,
    tone: view.highWind ? 'wind' : null,
    arrow: wind && !wind.calm && !wind.variable && Number.isFinite(wind.direction) ? view.windRotation : null,
    // 좁은 칸: 돌풍을 아랫줄로 내린 두 줄(14018 / G35KT)
    short: gust ? [gust[1], gust[2]] : null,
  }
}

function cloudCell(view) {
  const text = view.cloudText
  const layers = text === 'CAVOK' || text === 'NSC' ? null : text.split(/\s+/).filter(Boolean)
  const tone = view.ceilingCategory?.category && view.ceilingCategory.category !== 'VFR' ? view.ceilingCategory.category.toLowerCase() : null
  if (!layers) return { text, tone, layers: null, short: null }
  // 좁은 칸: 가장 낮은 실링(없으면 첫 층) + 나머지 층 수
  const lowest = layers.find((layer) => CEILING_AMOUNTS.test(layer)) ?? layers[0]
  return { text, tone, layers, short: layers.length > 1 ? { lowest, more: layers.length - 1 } : null }
}

export function forecastCell(view, key) {
  if (key === 'cat') return { text: view.flight.category, tone: `cat-${view.flight.category.toLowerCase()}` }
  if (key === 'wx') return { text: view.weatherText, tone: view.isSpecialWeather ? 'special' : view.hasPrecipitation ? 'precip' : null }
  if (key === 'wind') return windCell(view)
  if (key === 'vis') {
    const category = view.visibilityCategory?.category
    return { text: view.visibilityText, tone: category && category !== 'VFR' ? category.toLowerCase() : null }
  }
  return cloudCell(view)
}

const rowChanged = (row, temporary) => row.key === 'cat' || temporary.changed.includes(row.changed)

// [start,end)에서 covers가 덮은 부분을 뺀 조각
function freePieces(start, end, covers) {
  let pieces = [[start, end]]
  for (const c of covers) {
    pieces = pieces.flatMap(([a, b]) => (c.end <= a || c.start >= b ? [[a, b]] : [[a, Math.max(a, c.start)], [Math.min(b, c.end), b]].filter(([x, y]) => y > x)))
  }
  return pieces
}

export function formatTafForecastType(type) {
  return String(type || '').replace('_', ' ')
}

export function buildTafForecastView(taf, icao, nowMs = Date.now()) {
  const forecast = taf?.forecast
  if (!forecast?.prevailing?.length) return null
  const validEnd = Date.parse(taf.header?.valid_end)
  const validStart = Date.parse(taf.header?.valid_start)
  if (!Number.isFinite(validStart) || !Number.isFinite(validEnd)) return null
  // 지난 시간은 그리지 않는다(기존 타임라인과 같이 현재 시각이 든 정시부터)
  const start = Math.max(validStart, Math.floor(nowMs / HOUR) * HOUR)
  const end = validEnd
  if (start >= end) return null
  const clip = (ms) => Math.max(start, Math.min(end, ms))

  const periods = forecast.prevailing.map((p) => ({
    start: Date.parse(p.start),
    end: Date.parse(p.end),
    change: p.change ? { type: p.change.type, start: Date.parse(p.change.start), end: Date.parse(p.change.end) } : null,
    view: tafSlotView(p, icao),
  }))
  const viewAt = (ms) => (periods.find((p) => p.start <= ms && ms < p.end) ?? periods.at(-1)).view

  const temporary = (forecast.temporary ?? [])
    .map((t, id) => ({ id, t, start: Date.parse(t.start), end: Date.parse(t.end) }))
    .filter(({ start: s, end: e }) => Number.isFinite(s) && Number.isFinite(e) && e > start && s < end)
    .map(({ id, t, start: s, end: e }) => {
      const view = tafSlotView(t, icao)
      const main = viewAt(s)
      return {
        id,
        type: formatTafForecastType(t.type),
        probable: /PROB/.test(t.type),
        start: clip(s),
        end: clip(e),
        rawStart: t.start,
        rawEnd: t.end,
        changed: t.changed ?? [],
        view,
        main,
      }
    })

  const rows = TAF_FORECAST_ROWS.map((row) => {
    const covers = temporary.filter((t) => rowChanged(row, t))
    // 값이 같은 주 예보 구간을 잇는다
    const groups = []
    for (const p of periods) {
      const cell = forecastCell(p.view, row.key)
      const last = groups.at(-1)
      if (last && last.cell.text === cell.text) { last.end = p.end; continue }
      groups.push({ start: p.start, end: p.end, cell, change: p.change, view: p.view })
    }
    const segments = []
    groups.forEach((g, i) => {
      // BECMG로 바뀐 값은 변화 시간대 시작부터 그린다. 변화 시간대를 따로 떼면 BECMG가 1~2시간 간격으로
      // 이어지는 TAF에서 칸이 1시간짜리로 잘게 쪼개져 값이 사라지고, 나빠지는 구간(IFR)도 늦게 보인다.
      // 변화 시간대는 becmg로 남겨 칸 설명에 쓴다.
      let segStart = g.start
      let becmg = null
      if (i > 0 && g.change?.type === 'BECMG' && g.change.start < g.start) {
        becmg = { start: g.change.start, end: g.change.end, from: groups[i - 1].cell }
        segStart = g.change.start
        const prev = segments.at(-1)
        if (prev) prev.end = Math.max(prev.start, clip(segStart))
      }
      segments.push({ start: clip(segStart), end: clip(g.end), cell: g.cell, becmg })
    })
    const visible = segments.filter((s) => s.end > s.start).map((s, index) => {
      const overlapping = covers.filter((c) => c.start < s.end && c.end > s.start)
      return { ...s, index, split: overlapping.length > 0, pieces: freePieces(s.start, s.end, overlapping) }
    })
    const tempos = covers.map((t) => {
      const cell = forecastCell(t.view, row.key)
      const mainCell = forecastCell(t.main, row.key)
      return { id: t.id, start: t.start, end: t.end, probable: t.probable, type: t.type, cell, mainCell, same: row.key === 'cat' && cell.text === mainCell.text }
    })
    return { ...row, segments: visible, tempos }
  })

  const cards = temporary.map((t, i) => {
    const lines = [{ key: 'cat', label: '비행조건', cell: forecastCell(t.view, 'cat') }]
    for (const row of TAF_FORECAST_ROWS.slice(1)) {
      if (t.changed.includes(row.changed)) lines.push({ key: row.key, label: row.label.replace(/\(.+\)$/, ''), cell: forecastCell(t.view, row.key) })
    }
    return { id: t.id, n: i + 1, type: t.type, probable: t.probable, start: t.start, end: t.end, rawStart: t.rawStart, rawEnd: t.rawEnd, lines }
  })

  return { start, end, hours: (end - start) / HOUR, rows, cards }
}
