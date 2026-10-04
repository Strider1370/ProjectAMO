const data = window.CONTROL_DESIGN_DATA
const plans = [
  { id: 'A', title: '한 줄 버튼', location: '발표·유효시각 바로 아래', description: '구름·착빙을 한 번 눌러 켜고 끕니다. 등온선 버튼만 짧은 선택 메뉴를 엽니다.', tradeoff: '추천 · 세 항목의 상태가 항상 보이고 조작이 바로 됩니다.' },
  { id: 'B', title: '접힌 버튼 하나', location: '발표·유효시각 바로 아래', description: '평소에는 표시 버튼 하나만 둡니다. 누를 때만 같은 세 버튼이 펼쳐집니다.', tradeoff: '지도 점유가 가장 작습니다. 구름·착빙 조작에 한 번 더 눌러야 합니다.' },
  { id: 'C', title: '고도 레일 옆 세로 버튼', location: '오른쪽 고도 레일 왼편', description: '같은 세 버튼을 세로로 놓습니다. 고도 선택과 현상 전환을 한곳에서 합니다.', tradeoff: '중앙을 비웁니다. 오른쪽에 조작 요소가 모입니다.' },
]
const states = Object.fromEntries(plans.map(p => [p.id, { cloud: true, icing: true, temp: 1, level: '500hPa', hf: data.times[0].hf, open: false, menu: false, master: true }]))
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const validLabel = hf => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.times.find(t => t.hf === hf).validTime))
const tempLabel = state => ['등온선 끔', '0 / −20°C', '0 / −10 / −20°C'][state.temp]

document.querySelector('#app').innerHTML = `<header><div><div class="eyebrow">PROJECTAMO · 지도 위 조작 비교</div><h1>체크박스 없이, 지도에서 바로</h1><p>같은 A안·같은 보관 KIM 자료에 조작 위치만 바꾼 세 안입니다.</p></div><button id="reset">세 안 초기화</button></header>
<div class="source">보관 KIM · 발표 ${data.tmfc.slice(0, 4)}-${data.tmfc.slice(4, 6)}-${data.tmfc.slice(6, 8)} ${data.tmfc.slice(8)} UTC · 최신 예보 아님 · 제품 미적용</div>
<section class="cards" aria-label="지도 위 조작 세 안">${plans.map(p => `<article class="card" data-plan="${p.id}"><div class="card-head"><div><h2>${p.id} · ${p.title}</h2><p>${p.location}</p></div><button data-focus="${p.id}" aria-label="${p.id}안 크게 보기">크게 보기</button></div><div class="stage"><div class="map-art"></div><button class="master" data-action="master" aria-pressed="true">구름·착빙</button><div class="time-card"></div><div class="floating ${p.id === 'C' ? 'vertical' : ''}" role="group" aria-label="구름·착빙 표시">${p.id === 'B' ? '<button class="disclosure" data-action="open" aria-expanded="false">표시 ▾</button>' : ''}<div class="chips"><button data-action="cloud" aria-pressed="true">구름</button><button data-action="icing" aria-pressed="true">착빙</button><button data-action="temp" aria-haspopup="menu" aria-expanded="false" class="temperature-control">등온선 ▾</button></div><div class="temperature-menu" role="menu" aria-label="등온선 선택" hidden><button data-temperature="0" role="menuitemradio">숨김</button><button data-temperature="1" role="menuitemradio">0 / −20°C</button><button data-temperature="2" role="menuitemradio">0 / −10 / −20°C</button></div></div><div class="pressure" role="group" aria-label="보관 기압층"><span>hPa</span>${data.levels.map(l => `<button data-level="${l}" aria-pressed="${l === '500hPa'}">${parseFloat(l)}</button>`).join('')}</div><div class="map-legend"><span class="cloud-key">구름</span><span class="ice-key lgt">LGT</span><span class="ice-key mod">MOD</span><span class="ice-key sev">SEV</span><span class="temp-key">0 / −20°C</span></div><div class="timeline" role="group" aria-label="보관 예보시간">${data.times.map(t => `<button data-hf="${t.hf}" aria-pressed="${t.hf === data.times[0].hf}">F+${t.hf}</button>`).join('')}<span>보관 예보</span></div></div><div class="card-foot"><p>${p.description}</p><strong>${p.tradeoff}</strong></div></article>`).join('')}</section>
<div class="notes"><p>파란 버튼은 표시 중, 회색 버튼은 숨김입니다. 기압층·예보 버튼도 저장된 자료 사이에서 동작합니다. 지도 이동·확대와 실제 서비스 화면은 이 시안에 포함하지 않았습니다.</p><p>등온선 메뉴에 −10°C를 넣어 별도 체크박스를 없앴습니다. 설정 패널·긴 안내문은 지도 위에 추가하지 않습니다.</p><p>레퍼런스: <a href="https://docs.mapbox.com/mapbox-gl-js/example/toggle-layers/">Mapbox · 지도 위 레이어 켬/끔</a> / <a href="https://developers.google.com/maps/documentation/javascript/examples/control-custom">Google Maps · 지도 상단 버튼</a>. 세 배치는 이 프로젝트에 맞춘 제안입니다.</p></div>`

function mountMap(card, state) {
  const art = card.querySelector('.map-art')
  const key = `${state.hf}:${state.level}`
  if (art.dataset.key === key) return
  art.innerHTML = data.maps[key].svg
  art.dataset.key = key
  const svg = art.querySelector('svg'), prefix = `control-${card.dataset.plan}-`
  const ids = new Map([...svg.querySelectorAll('[id]')].map(node => [node.id, prefix + node.id]))
  for (const node of [svg, ...svg.querySelectorAll('*')]) for (const attr of [...node.attributes]) {
    let value = attr.value
    if (attr.name === 'id') value = ids.get(value) ?? value
    for (const [oldId, newId] of ids) value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`)
    if (value !== attr.value) node.setAttribute(attr.name, value)
  }
  svg.setAttribute('aria-label', `${card.dataset.plan}안 · 보관 KIM ${state.level} F+${state.hf}`)
}
function sizePatterns() {
  for (const card of document.querySelectorAll('.card')) {
    const svg = card.querySelector('.map-art svg'); if (!svg || !svg.getBoundingClientRect().width) continue
    const scale = 720 / svg.getBoundingClientRect().width, spacing = 9 * scale
    for (const p of svg.querySelectorAll('pattern')) {
      p.setAttribute('width', spacing); p.setAttribute('height', spacing)
      const r = p.querySelector('rect'), dot = p.querySelector('circle')
      r.setAttribute('width', spacing); r.setAttribute('height', spacing)
      dot.setAttribute('cx', spacing / 2); dot.setAttribute('cy', spacing / 2); dot.setAttribute('r', .85 * scale)
    }
  }
}
function sync(id) {
  const card = document.querySelector(`.card[data-plan="${id}"]`), state = states[id]
  mountMap(card, state)
  const svg = card.querySelector('.map-art svg'), visible = state.master
  for (const key of ['cloud', 'icing']) svg.querySelector(`[data-layer="${key}"]`).style.display = visible && state[key] ? '' : 'none'
  for (const node of svg.querySelectorAll('[data-temperature]')) node.style.display = visible && state.temp && (state.temp === 2 || Number(node.dataset.temperature) !== -10) ? '' : 'none'
  const floating = card.querySelector('.floating'); floating.hidden = !visible
  card.querySelector('.master').setAttribute('aria-pressed', String(visible))
  for (const key of ['cloud', 'icing']) card.querySelector(`[data-action="${key}"]`).setAttribute('aria-pressed', String(state[key]))
  const temp = card.querySelector('[data-action="temp"]')
  temp.setAttribute('aria-pressed', String(state.temp > 0)); temp.setAttribute('aria-expanded', String(state.menu)); temp.setAttribute('aria-label', `등온선 선택 · ${tempLabel(state)}`)
  card.querySelector('.temperature-menu').hidden = !state.menu
  for (const b of card.querySelectorAll('button[data-temperature]')) b.setAttribute('aria-checked', String(Number(b.dataset.temperature) === state.temp))
  if (id === 'B') { card.querySelector('.chips').hidden = !state.open; card.querySelector('.disclosure').setAttribute('aria-expanded', String(state.open)); card.querySelector('.disclosure').textContent = `표시 ${state.open ? '▴' : '▾'}` }
  for (const b of card.querySelectorAll('[data-level]')) b.setAttribute('aria-pressed', String(b.dataset.level === state.level))
  for (const b of card.querySelectorAll('[data-hf]')) b.setAttribute('aria-pressed', String(Number(b.dataset.hf) === state.hf))
  card.querySelector('.time-card').innerHTML = `<strong>${state.level} · F+${state.hf}</strong><span>${validLabel(state.hf)} KST</span>`
  card.querySelector('.map-legend .cloud-key').hidden = !visible || !state.cloud
  for (const node of card.querySelectorAll('.ice-key')) node.hidden = !visible || !state.icing
  const tempKey = card.querySelector('.temp-key'); tempKey.hidden = !visible || !state.temp; tempKey.textContent = tempLabel(state)
  sizePatterns()
}
function closeMenus(except) {
  for (const id of Object.keys(states)) if (id !== except) { states[id].open = false; states[id].menu = false; sync(id) }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'), card = event.target.closest('.card')
  if (!event.target.closest('.floating')) closeMenus()
  if (!button || !card) return
  const id = card.dataset.plan, state = states[id]
  if (button.dataset.focus) {
    const cards = document.querySelector('.cards'), focused = cards.dataset.focus === id
    cards.dataset.focus = focused ? '' : id
    for (const node of document.querySelectorAll('.card')) node.hidden = !focused && node !== card
    button.textContent = focused ? '크게 보기' : '세 안 비교'; button.setAttribute('aria-label', focused ? `${id}안 크게 보기` : '세 안 비교')
    sizePatterns(); return
  }
  const action = button.dataset.action
  if (action) {
    closeMenus(id)
    if (action === 'temp') state.menu = !state.menu
    else if (action === 'open') { state.open = !state.open; if (!state.open) state.menu = false }
    else if (action === 'master') { state.master = !state.master; state.open = false; state.menu = false }
    else state[action] = !state[action]
  }
  if (button.dataset.temperature !== undefined) { state.temp = Number(button.dataset.temperature); state.menu = false; button.closest('.floating').querySelector('[data-action="temp"]').focus() }
  if (button.dataset.level) state.level = button.dataset.level
  if (button.dataset.hf) state.hf = Number(button.dataset.hf)
  sync(id)
})
document.addEventListener('keydown', event => {
  const card = event.target.closest('.card'), menu = event.target.closest('.temperature-menu')
  if (event.key === 'Escape') { closeMenus(); if (card) card.querySelector(card.dataset.plan === 'B' ? '.disclosure' : '.temperature-control').focus() }
  if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const buttons = [...menu.querySelectorAll('button')], index = buttons.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }
  if (event.target.matches('.temperature-control') && event.key === 'ArrowDown') { event.preventDefault(); states[card.dataset.plan].menu = true; sync(card.dataset.plan); card.querySelector('.temperature-menu button').focus() }
})
document.querySelector('#reset').addEventListener('click', () => {
  for (const id of Object.keys(states)) { Object.assign(states[id], { cloud: true, icing: true, temp: 1, level: '500hPa', hf: data.times[0].hf, open: false, menu: false, master: true }); sync(id) }
})
window.addEventListener('resize', sizePatterns)
for (const id of Object.keys(states)) sync(id)
window.__compactControls = { data, states, sync }
