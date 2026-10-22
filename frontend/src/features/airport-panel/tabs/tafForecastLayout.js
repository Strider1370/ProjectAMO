// TAF 타임라인의 실측 배치. 칸 폭은 시간에 비례하고 글자 길이는 시간과 무관해서, 그려 본 뒤 재서 정한다.
// React가 관리하는 className은 건드리지 않고 data-fit·data-wrap·style 위치만 바꾼다.
//
// 글자 맞춤(줄마다): 값을 최대한 글자로 보여 준다.
//   전체 값 → 작은 글자 → 줄임 표기(구름: 최저 실링 +층 수, 바람: 돌풍을 아랫줄로) → 작은 글자 → 두 줄 감싸기 →
//   주 예보 조각은 숨김 / TEMPO 칸은 점. TEMPO가 가른 주 예보 칸은 테두리가 한 구간임을 보여 주므로
//   값은 글자가 들어가는 가장 넓은 조각에 한 번만 쓰고, 다 안 들어가면 가장 넓은 조각에 점(바람은 화살표)만 둔다.
// 카드: TEMPO 시간 가운데에 두고, 앞 카드와 겹치면 카드 왼쪽 끝이 그 TEMPO 기둥 왼쪽 끝을 넘지 않는 데까지
//   오른쪽으로 비킨다(기둥이 카드 윗변에 닿아야 한다). 그래도 안 되면 아래 줄로.
// 기둥: TEMPO마다 첫 줄 위에서 그 카드 윗변까지.

const GAP = 4
const PAD = 6
const CARD_GAP = 8
const LANE_TOP = 16

function overflows(el) {
  const kids = [...el.children].filter((c) => c.offsetParent !== null)
  const width = kids.reduce((sum, c) => sum + c.scrollWidth, 0) + Math.max(0, kids.length - 1) * GAP + PAD
  const txt = el.querySelector('.ap-tafx-txt')
  return width > el.clientWidth || (txt ? txt.scrollHeight > el.clientHeight : false)
}

const widest = (list) => list.reduce((a, b) => (b.clientWidth > a.clientWidth ? b : a))

function fitTrack(track) {
  const labels = [...track.querySelectorAll('.ap-tafx-lbl')]
  const cells = [...track.querySelectorAll('.ap-tafx-tempo')].filter((el) => el.querySelector('.ap-tafx-txt'))
  const all = [...labels, ...cells]
  for (const el of all) { el.dataset.fit = 'full'; delete el.dataset.wrap; delete el.dataset.size }
  for (const el of all) {
    if (overflows(el)) el.dataset.size = 'sm'
    if (overflows(el) && el.dataset.short === '1') { el.dataset.fit = 'short'; delete el.dataset.size }
    if (overflows(el) && el.dataset.fit === 'short') el.dataset.size = 'sm'
    if (overflows(el)) el.dataset.wrap = '1'
    if (overflows(el)) el.dataset.fit = el.classList.contains('ap-tafx-tempo') ? 'dot' : 'hidden'
  }
  const groups = new Map()
  for (const el of labels) {
    if (!groups.has(el.dataset.seg)) groups.set(el.dataset.seg, [])
    groups.get(el.dataset.seg).push(el)
  }
  for (const list of groups.values()) {
    const shown = list.filter((el) => el.dataset.fit !== 'hidden')
    if (shown.length) {
      const keep = widest(shown)
      for (const el of shown) if (el !== keep) el.dataset.fit = 'hidden'
    } else {
      const w = widest(list)
      delete w.dataset.wrap
      delete w.dataset.size
      w.dataset.fit = 'dot'
    }
  }
}

function placeCards(root, hours) {
  const lane = root.querySelector('.ap-tafx-lane')
  if (!lane) return
  const cards = [...lane.querySelectorAll('.ap-tafx-card')]
  const W = lane.clientWidth
  const shelves = []
  const heights = []
  for (const card of cards) {
    const s = Number(card.dataset.s), e = Number(card.dataset.e)
    const w = card.offsetWidth
    const want = Math.max(0, Math.min(W - w, ((s + e) / 2 / hours) * W - w / 2))
    const maxLeft = Math.max(want, (s / hours) * W)
    let left = want
    let shelf = shelves.findIndex((right) => {
      const x = Math.max(want, right + CARD_GAP)
      if (x > maxLeft || x + w > W) return false
      left = x
      return true
    })
    if (shelf < 0) { shelf = shelves.length; shelves.push(-Infinity); heights.push(0); left = want }
    shelves[shelf] = left + w
    heights[shelf] = Math.max(heights[shelf], card.offsetHeight)
    card.style.left = `${left}px`
    card.dataset.shelf = String(shelf)
  }
  const tops = heights.map((_, i) => LANE_TOP + heights.slice(0, i).reduce((a, h) => a + h + CARD_GAP, 0))
  for (const card of cards) card.style.top = `${tops[Number(card.dataset.shelf)]}px`
  lane.style.height = tops.length ? `${tops.at(-1) + heights.at(-1) + CARD_GAP}px` : '0px'
}

function drawColumns(root) {
  const tracks = root.querySelectorAll('.ap-tafx-track')
  if (!tracks.length) return
  const first = tracks[0]
  const last = tracks[tracks.length - 1]
  const lane = root.querySelector('.ap-tafx-lane')
  const top = first.offsetTop - 4
  for (const col of root.querySelectorAll('.ap-tafx-col')) {
    const card = lane?.querySelector(`.ap-tafx-card[data-tid="${col.dataset.tid}"]`)
    const bottom = card ? lane.offsetTop + card.offsetTop + 1 : last.offsetTop + last.offsetHeight + 4
    col.style.left = `${first.offsetLeft + Number(col.dataset.l) * first.offsetWidth}px`
    col.style.width = `${Number(col.dataset.w) * first.offsetWidth}px`
    col.style.top = `${top}px`
    col.style.height = `${bottom - top}px`
  }
}

export function layoutTafForecast(root, hours) {
  if (!root) return
  for (const track of root.querySelectorAll('.ap-tafx-track')) fitTrack(track)
  // 좁은 TEMPO 띠는 글자 없이(잘린 글자를 남기지 않는다)
  for (const z of root.querySelectorAll('.ap-tafx-zone')) {
    delete z.dataset.fit
    if (z.scrollWidth > z.clientWidth) z.dataset.fit = 'dot'
  }
  placeCards(root, hours)
  drawColumns(root)
}

// TEMPO 칸·기둥·카드 중 하나에 올리면 같은 TEMPO를 함께 강조
export function bindTafForecastHighlight(root) {
  const set = (tid, on) => {
    for (const el of root.querySelectorAll(`[data-tid="${tid}"]`)) {
      if (on) el.dataset.hl = '1'
      else delete el.dataset.hl
    }
  }
  const over = (event) => { const t = event.target.closest?.('[data-tid]'); if (t) set(t.dataset.tid, true) }
  const out = (event) => { const t = event.target.closest?.('[data-tid]'); if (t) set(t.dataset.tid, false) }
  root.addEventListener('pointerover', over)
  root.addEventListener('pointerout', out)
  return () => {
    root.removeEventListener('pointerover', over)
    root.removeEventListener('pointerout', out)
  }
}
