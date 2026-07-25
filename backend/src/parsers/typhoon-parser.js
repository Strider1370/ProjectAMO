// KMA API Hub 태풍정보(typ_now.php / typ_data.php) 고정폭 텍스트 파서.
// 컬럼: FT YY TYP SEQ TMD TYP_TM FT_TM LAT LON DIR SP PS WS RAD15 RAD25 RAD ED15 ER15 LOC ED25 ER25
// LOC에만 공백이 들어가므로 앞 18개와 마지막 1개를 고정으로 떼고 가운데를 LOC로 되짚는다.

const HEAD_FIELDS = 18
const TAIL_PATTERN = /^[A-Z-]+,-?\d+,?$/

// 결측 센티널이 -999 하나가 아니다. 실측상 RAD가 -9인 행이 흔하다(2018 픽스처 50행 중 40행).
// 이 21개 컬럼 중 정당하게 음수인 필드는 없으므로 음수는 전부 결측으로 본다.
// -9를 숫자로 받으면 판정 반경이 9 km 조용히 줄어든다 — 스펙 §11의 금지사항(결측을 값으로 바꾸기)이다.
function num(token) {
  const value = Number(token)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

function dir(token) {
  return !token || token === '-' ? null : token
}

// "202209050000"(UTC) -> ISO
function toIso(stamp) {
  if (!/^\d{12}$/.test(stamp)) return null
  const [y, mo, d, h, mi] = [stamp.slice(0, 4), stamp.slice(4, 6), stamp.slice(6, 8), stamp.slice(8, 10), stamp.slice(10, 12)]
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString()
}

// 반경이 없으면 링 자체가 없다. 예외 방향/반경은 있을 때만 채운다.
function ring(radius, exceptionDir, exceptionRadius) {
  const radiusKm = num(radius)
  if (radiusKm === null) return null
  return { radiusKm, exceptionDir: dir(exceptionDir), exceptionRadiusKm: num(exceptionRadius) }
}

export function parseTyphoonText(text) {
  const rows = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const tokens = line.split(/\s+/)
    if (tokens.length < HEAD_FIELDS + 1) continue

    const head = tokens.slice(0, HEAD_FIELDS)
    const hasTail = TAIL_PATTERN.test(tokens[tokens.length - 1])
    const tail = hasTail ? tokens[tokens.length - 1].split(',') : []
    const location = (hasTail ? tokens.slice(HEAD_FIELDS, -1) : tokens.slice(HEAD_FIELDS)).join(' ')

    const lat = num(head[7])
    const lon = num(head[8])
    if (lat === null || lon === null) continue

    rows.push({
      forecast: head[0] === '1',
      year: Number(head[1]),
      number: Number(head[2]),
      seq: Number(head[3]),
      leadHours: Number(head[4]),
      analyzedAt: toIso(head[5]),
      validAt: toIso(head[6]),
      lat,
      lon,
      dir: dir(head[9]),
      speedKmh: num(head[10]),
      pressureHpa: num(head[11]),
      maxWindMs: num(head[12]),
      errorRadiusKm: num(head[15]),
      gale: ring(head[13], head[16], head[17]),
      storm: ring(head[14], tail[0], tail[1]),
      location,
    })
  }
  return rows
}

// 스냅샷은 JSON으로 저장·전송되므로 current와 rows 안의 같은 행은 서로 다른 객체가 된다.
// 참조 비교(===)는 언제나 false다. 값으로 비교해야 한다.
export function isSameRow(a, b) {
  return Boolean(a && b)
    && a.validAt === b.validAt
    && a.seq === b.seq
    && Boolean(a.forecast) === Boolean(b.forecast)
}

export function groupByTyphoonNumber(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.number)) grouped.set(row.number, [])
    grouped.get(row.number).push(row)
  }
  return grouped
}

// typ_lst.php?disp=1 — 쉼표 구분. 이름과 진행여부만 쓴다.
// 9번째 REM(설명문)에 쉼표가 들어갈 수 있으므로 앞 8개만 취하고 나머지는 버린다.
// 목록의 SEQ는 발표번호가 아니라 태풍번호다 — 경로 응답의 TYP와 잇는 열쇠.
export function parseTyphoonList(text) {
  const list = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const f = line.split(',')
    if (f.length < 8) continue
    const number = Number(f[1])
    if (!Number.isFinite(number)) continue
    list.push({
      year: Number(f[0]),
      number,
      active: f[2] === '1',       // NOW: 1(진행중), 2(종료)
      name: f[6] || null,
      nameEn: f[7] || null,
    })
  }
  return list
}

export default { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber, isSameRow }
