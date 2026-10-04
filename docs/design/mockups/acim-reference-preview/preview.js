import { calculateAcim, topFeetForAcim, altitudeBand } from '../../../../scripts/lib/acim-calculation.mjs'

const data = window.ACIM_PREVIEW
const colors = ['#fff1bf', '#f3d887', '#dfb960', '#bb9445', '#957135', '#6e502a', '#48361f']
const labels = ['5,000–<10,000', '10,000–<15,000', '15,000–<20,000', '20,000–<25,000', '25,000–<30,000', '30,000–<35,000', '35,000 (상한)']
const $ = id => document.getElementById(id)
const state = { hf: data.live?.hf ?? 6, mode: data.live ? 'live' : 'sample', zone: 'Asia/Seoul', visible: true }
const cache = new Map()
const fmt = instant => new Intl.DateTimeFormat('ko-KR', { timeZone: state.zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
const validAt = hf => new Date(Date.parse(data.runAt) + hf * 3600000).toISOString()

document.getElementById('app').innerHTML = `
  <header><div><div class="brand">ProjectAMO · WEATHER PREVIEW</div><h1>ACIM 예상 대류운 상단고도</h1><p>높이는 지도에서 바로 읽습니다. 단위 ft · 5,000ft 간격</p></div><span id="source" class="source"></span></header>
  <section class="status" aria-label="예보 요약"><div><span>예보시각</span><strong id="valid"></strong></div><div><span>최대 예상고도 · 지도 내</span><strong id="maximum"></strong></div><div><span>표시 기준</span><strong>5,000ft 이상</strong></div></section>
  <section class="map-card" aria-label="대류운 지도">
    <div class="toolbar"><label><input id="visibility" type="checkbox" checked> 대류운 상단고도</label><div class="controls"><label>자료 <select id="mode"><option value="sample">합성 입력 예시</option><option value="live" ${data.live ? '' : 'disabled'}>실제 KIM · 1시각</option></select></label><label>예보 <select id="forecast" aria-label="예보시각"></select></label><label>시간대 <select id="zone"><option value="Asia/Seoul">KST</option><option value="UTC">UTC</option></select></label></div></div>
    <div class="map-stage"><canvas id="map" role="img">대류운 예상 상단고도 지도. 고도 구간은 아래 범례에서 확인할 수 있습니다.</canvas></div>
    <div class="legend" aria-label="고도 범례"><strong>예상 상단고도 · ft</strong><div class="bands">${colors.map((color, i) => `<span><i style="background:${color}"></i>${labels[i]}</span>`).join('')}</div><small>5,000ft 미만은 숨김 · 35,000ft는 원본 변환표의 최상위 등급</small></div>
  </section>
  <p id="message" class="message" role="status" aria-live="polite"></p>
  <details><summary>예시 자료와 검증 상태</summary><p id="provenance"></p><p>계절별 원본 계산식과 고도 변환표를 사용합니다. API 강수량의 시간 기준과 원본 실행파일과의 수치 일치는 아직 검증 전입니다.</p></details>
  <footer>구름 상단의 추정값입니다. 구름 하단고도와 발생확률은 이 지도에 포함하지 않습니다.</footer>`

function sampleFrame(hf) {
  if (cache.has(hf)) return cache.get(hf)
  const grid = { nx: 205, ny: 169, lonMin: 119, latMin: 30, dx: 1 / 12, dy: 1 / 12 }
  const topFt = []
  const c = data.reference.seasons[data.season]
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const lon = grid.lonMin + i * grid.dx, lat = grid.latMin + j * grid.dy
    const blob = (cx, cy, sx, sy) => Math.exp(-(((lon - cx - (hf - 6) * .06) / sx) ** 2) - ((lat - cy) / sy) ** 2)
    const activity = Math.min(1, 1.2 * blob(126.35, 35.15, .78, 1) + .82 * blob(127.5, 37.4, .48, .55) + .68 * blob(125.1, 33.5, .58, .48))
    // Synthetic *input variables*, evaluated by the same source-derived algorithm.
    const olr = 300 - 205 * activity, precc = 3 * activity
    topFt.push(topFeetForAcim(calculateAcim(olr, precc, c), data.reference.table))
  }
  const frame = { grid, topFt, hf, validAt: validAt(hf) }
  cache.set(hf, frame)
  return frame
}

function options() {
  $('forecast').innerHTML = Array.from({ length: 13 }, (_, hf) => `<option value="${hf}" ${state.mode === 'live' && hf !== data.live.hf ? 'disabled' : ''}>${fmt(validAt(hf))} · +${hf}h</option>`).join('')
  $('forecast').value = String(state.hf)
}

function render() {
  const frame = state.mode === 'live' ? data.live : sampleFrame(state.hf)
  const canvas = $('map'), rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#edf0f2'; ctx.fillRect(0, 0, rect.width, rect.height)
  const scale = Math.max(rect.width / 760, rect.height / 520)
  ctx.translate((rect.width - 760 * scale) / 2, (rect.height - 520 * scale) / 2); ctx.scale(scale, scale)
  const px = lon => (lon - 123.3) / 7.5 * 760, py = lat => (38.7 - lat) / 6.8 * 520
  ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#c8cdd0'; ctx.lineWidth = .8
  for (const path of data.land) { const shape = new Path2D(path); ctx.fill(shape); ctx.stroke(shape) }
  ctx.strokeStyle = '#d1d9dd'; ctx.setLineDash([3, 5]); ctx.lineWidth = .5
  for (const lon of [124, 126, 128, 130]) { ctx.beginPath(); ctx.moveTo(px(lon), 0); ctx.lineTo(px(lon), 520); ctx.stroke() }
  for (const lat of [34, 36, 38]) { ctx.beginPath(); ctx.moveTo(0, py(lat)); ctx.lineTo(760, py(lat)); ctx.stroke() }
  ctx.setLineDash([])
  const paths = colors.map(() => new Path2D()), centers = colors.map(() => ({ count: 0, x: 0, y: 0, points: [] })), g = frame.grid
  let maximum = 0, missing = 0
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const lon = g.lonMin + i * g.dx, lat = g.latMin + j * g.dy
    if (lon < 123.3 || lon > 130.8 || lat < 31.9 || lat > 38.7) continue
    const feet = frame.topFt[j * g.nx + i], band = altitudeBand(feet)
    if (band == null) { missing++; continue }
    maximum = Math.max(maximum, feet)
    if (band < 0) continue
    const x = px(lon), y = py(lat), w = 760 / 7.5 * g.dx, h = 520 / 6.8 * g.dy
    paths[band].rect(x - w / 2, y - h / 2, w + .2, h + .2)
    centers[band].count++; centers[band].x += x; centers[band].y += y
    centers[band].points.push([x, y])
  }
  const text = (label, x, y, size = 14, bold = false) => {
    ctx.font = `${bold ? '600' : '400'} ${size / scale}px system-ui, sans-serif`; ctx.lineJoin = 'round'; ctx.lineWidth = 4 / scale; ctx.strokeStyle = '#ffffff'; ctx.strokeText(label, x, y); ctx.fillStyle = '#242424'; ctx.fillText(label, x, y)
  }
  if (state.visible) {
    paths.forEach((shape, band) => { ctx.fillStyle = colors[band]; ctx.fill(shape) })
    // Keep geographic context readable above opaque, discrete height fills.
    ctx.strokeStyle = '#616161'; ctx.lineWidth = .6 / scale
    for (const path of data.land) ctx.stroke(new Path2D(path))
    // Visible labels provide a second channel beyond color; no point interaction.
    for (const band of [1, 3, 5, 6]) {
      const center = centers[band]
      if (center.count > 8) {
        const cx = center.x / center.count, cy = center.y / center.count
        const point = center.points.reduce((best, p) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < (best[0] - cx) ** 2 + (best[1] - cy) ** 2 ? p : best)
        const low = (band + 1) * 5
        text(band === 6 ? '35k ft · 상한' : `${low}–<${low + 5}k ft`, point[0], point[1], 13, true)
      }
    }
  }
  for (const [lon, lat, name] of [[126.45, 37.46, '인천 RKSI'], [126.49, 33.51, '제주 RKPC'], [128.94, 35.17, '부산'], [126.85, 35.16, '광주']]) {
    const x = px(lon), y = py(lat)
    ctx.beginPath(); ctx.arc(x, y, 3 / scale, 0, 2 * Math.PI); ctx.fillStyle = '#334155'; ctx.fill()
    text(name, x + 8 / scale, y - 7 / scale, 13)
  }
  text('서해', px(124.5), py(36.7), 14); text('동해', px(129.65), py(37.4), 14)
  $('source').textContent = state.mode === 'sample' ? '합성 입력 · 화면 예시' : '실제 KIM 입력 · 검증 중'
  $('valid').textContent = `${fmt(frame.validAt)} ${state.zone === 'UTC' ? 'UTC' : 'KST'}`
  $('maximum').textContent = maximum < 5000 ? '표시 대상 없음' : `${maximum.toLocaleString('en-US')} ft${maximum === 35000 ? ' · 상한' : ''}`
  $('message').textContent = !state.visible ? '대류운 레이어를 숨겼습니다.' : state.mode === 'sample' ? '합성한 두 입력 변수에 ACIM 원본 계산식을 적용한 화면 예시입니다.' : missing ? '일부 영역의 자료가 없습니다.' : '실제 KIM 입력으로 계산했습니다. 강수량 시간 기준은 확인 중입니다.'
  canvas.setAttribute('aria-label', `${state.mode === 'sample' ? '합성 입력 예시' : 'KIM 자료'}, ${$('valid').textContent}, 예상 대류운 상단 최대 ${maximum.toLocaleString()}피트. 5,000피트 간격으로 표시. ${state.visible ? '레이어 표시 중' : '레이어 숨김'}.`)
  $('provenance').textContent = data.live ? `모델 발표 ${fmt(data.runAt)}, ${data.season} 계절 계산식. 실제 호출 ${data.probe.tmfc}, +${data.probe.hf}h.` : `실제 KIM 호출 시험: ${data.probe.outcome === 'blocked_before_network' ? '이전 HTTP 403 기록에 따른 프로젝트 자동 차단으로 외부 요청 미전송' : '응답 검증 미완료'}. 실제 자료는 이 파일에 포함되지 않았습니다. ${data.season} 계절 계산식을 사용한 합성 입력입니다.`
}

$('mode').value = state.mode
options()
$('mode').addEventListener('change', event => { state.mode = event.target.value; if (state.mode === 'live') state.hf = data.live.hf; options(); render() })
$('forecast').addEventListener('change', event => { state.hf = Number(event.target.value); render() })
$('zone').addEventListener('change', event => { state.zone = event.target.value; options(); render() })
$('visibility').addEventListener('change', event => { state.visible = event.target.checked; render() })
new ResizeObserver(render).observe($('map'))
render()
// Expose only provenance and calculation results for offline preview verification.
window.acimPreview = { state, colors, labels, sampleFrame, reference: data.reference, probe: data.probe, live: data.live }
