// TAF 해석 규칙의 한 곳. 국내(IWXXM)·해외(원문) 파서가 같은 base + change_groups를 만든 뒤 여기서 해석한다.
//
// - partialMerge: 변화군이 적은 요소만 앞 상태에 덮는다(CAVOK·NSW·NSC 포함).
// - buildTafForecast: 표시용 해석.
//     prevailing — 주 예보 구간. FM은 시작 시각에, BECMG는 변화 시간대 끝에 적용한다.
//                  BECMG 구간은 change(그 BECMG의 start~end)로 "이 사이 어느 때 바뀜"을 함께 준다.
//     temporary  — TEMPO/PROB. 주 예보에 섞지 않고, 그 시각 주 예보에 덮은 상태와 실제로 바꾼 요소를 준다.
//   기존 timeline(TEMPO를 덮은 시각별 상태)은 교체공항·미니마 판정처럼 보수적으로 봐야 하는 곳이 그대로 쓴다.
import { pickPrimaryWeatherIcon } from './parse-utils.js'

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function partialMerge(current, change) {
  const next = deepClone(current)
  if (change.wind != null) next.wind = change.wind
  if (change.vis != null) {
    next.vis = change.vis
    if (change.vis !== 9999) next.cavok_flag = false
  }
  if (change.wx_touched === true) {
    next.wx = change.wx
    next.nsw_flag = change.nsw_flag === true
    if (!change.cavok_flag) next.cavok_flag = false
  }
  if (change.clouds_touched === true) {
    next.clouds = change.clouds
    next.cavok_flag = false
    next.nsc_flag = change.nsc_flag === true
  }
  if (change.cavok_flag === true) {
    next.cavok_flag = true
    next.nsc_flag = false
    next.vis = 9999
    next.wx = []
    next.clouds = []
    next.nsw_flag = false
  }
  return next
}

export function formatDisplay(state) {
  const weatherList = state.wx || []
  return {
    wind: state.wind?.raw || null,
    visibility: String(state.vis ?? '//'),
    weather: state.cavok_flag ? '' : weatherList.map((w) => w.raw).join(' '),
    clouds: (state.cavok_flag || state.nsc_flag) ? 'NSC' : (state.clouds || []).map((c) => c.raw).join(' '),
    weather_icon: state.cavok_flag ? 'CAVOK' : pickPrimaryWeatherIcon(weatherList),
    weather_intensity: weatherList[0]?.intensity || null,
  }
}

const isTemporary = (type) => /TEMPO|PROB/.test(type)

function probabilityOf(type) {
  const m = /^PROB(\d{2})/.exec(type)
  return m ? Number(m[1]) : null
}

function iso(ms) {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

function stateView(state) {
  return {
    wind: state.wind ?? null,
    visibility: { value: state.vis ?? null, cavok: state.cavok_flag === true },
    weather: state.wx || [],
    clouds: state.clouds || [],
    display: formatDisplay(state),
  }
}

// 변화군이 실제로 적은 요소. 표시 단에서 "이 TEMPO가 바꾸는 줄"만 그리는 데 쓴다.
function changedElements(group) {
  const out = []
  if (group.wind != null) out.push('wind')
  if (group.vis != null || group.cavok_flag) out.push('visibility')
  if (group.wx_touched || group.cavok_flag) out.push('weather')
  if (group.clouds_touched || group.cavok_flag) out.push('clouds')
  return out
}

export function buildTafForecast({ base, change_groups: changeGroups = [], valid_start: validStart, valid_end: validEnd }) {
  const vs = Date.parse(validStart)
  const ve = Date.parse(validEnd)
  if (!base || !Number.isFinite(vs) || !Number.isFinite(ve) || ve <= vs) return null

  const indexed = changeGroups.map((group, index) => ({ group, index }))
  // 주 예보를 바꾸는 시각: FM은 시작, BECMG는 변화 시간대 끝
  const persistent = indexed
    .filter(({ group }) => group.type === 'FM' || group.type === 'BECMG')
    .map(({ group, index }) => ({ group, index, at: Date.parse(group.type === 'FM' ? group.start : (group.end || group.start)) }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at || a.index - b.index)

  const prevailing = []
  let state = deepClone(base)
  let change = null
  let from = vs
  const push = (until) => {
    if (until <= from) return
    const view = stateView(state)
    const last = prevailing.at(-1)
    if (last && !change && JSON.stringify(last.display) === JSON.stringify(view.display)) { last.end = iso(until); return }
    prevailing.push({ start: iso(from), end: iso(until), ...view, change, _state: deepClone(state) })
  }
  for (const p of persistent) {
    const at = Math.max(vs, Math.min(p.at, ve))
    if (at > from) { push(at); from = at; change = null }
    state = p.group.type === 'FM' ? deepClone(p.group) : partialMerge(state, p.group)
    change = { index: p.index, type: p.group.type, start: p.group.start, end: p.group.type === 'FM' ? p.group.start : p.group.end }
  }
  push(ve)

  const stateAt = (ms) => (prevailing.find((period) => Date.parse(period.start) <= ms && ms < Date.parse(period.end)) ?? prevailing.at(-1))._state
  const temporary = indexed
    .filter(({ group }) => isTemporary(group.type))
    .map(({ group, index }) => ({
      index,
      type: group.type,
      probability: probabilityOf(group.type),
      start: group.start,
      end: group.end,
      changed: changedElements(group),
      ...stateView(partialMerge(stateAt(Date.parse(group.start)), group)),
    }))

  return { prevailing: prevailing.map(({ _state, ...period }) => period), temporary }
}

export default { partialMerge, formatDisplay, buildTafForecast }
