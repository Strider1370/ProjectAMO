// E) 본문 문자열 → 문형·좌표·크기. 지오메트리는 모른다(notam-geometry.js가 만든다).
// 원문은 일정 폭에서 개행되며 좌표 한가운데가 끊긴다(`36242` + 개행 + `4N1262847E`).
// 그래서 판정 전에 공백을 모두 제거한다 — 이걸 빼면 실측 80건에서 좌표 84개를 놓친다.

const M_PER_NM = 1852
const COORD = /\d{6}(?:\.\d+)?[NS]\d{7}(?:\.\d+)?[EW]/g

export function extractEBody(rawText) {
  const m = String(rawText || '').match(/E\)([\s\S]*?)(?:\n\s*[FG]\)|$)/)
  return m ? m[1] : ''
}

// DDMMSS[.s]N/S DDDMMSS[.s]E/W — 자리수가 고정이라 끊어 읽는 지점이 모호하지 않다.
export function dmsToDecimal(token) {
  const m = String(token || '').match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/)
  if (!m) return null
  const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (m[4] === 'N' ? 1 : -1)
  const lon = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (m[8] === 'E' ? 1 : -1)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

function toMeters(value, unit) {
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  const u = String(unit).toUpperCase()
  return u === 'NM' ? v * M_PER_NM : u === 'KM' ? v * 1000 : v
}

const none = (defective = false) => ({ kind: null, coords: [], radiusM: null, bufferNm: null, approximated: false, defective })

export function parsePositionText(rawText) {
  const tight = extractEBody(rawText).replace(/\s+/g, '').toUpperCase()
  const coords = (tight.match(COORD) || []).map(dmsToDecimal).filter(Boolean)
  // 호·반원·제외구역이 섞이면 형상을 그대로 못 그린다 — 넓게 덮되 근사임을 알린다.
  // `\b`를 쓰지 않는다: 교대(|)는 가장 느슨하게 묶여 `\b`가 ARC에만 걸리는데,
  // 공백을 모두 지운 뒤에는 단어 경계가 사실상 없어 죽은 조건이 된다(실측: 9건 모두 false).
  const approximated = /ARC|SEMICIRCLE|EXC/.test(tight) && coords.length > 0

  // 순서가 중요하다. 넓은 개념부터 걸러야 안쪽에 박힌 단어(EXC A CIRCLE 등)에 낚이지 않는다.
  if (/EITHERSIDE/.test(tight) && coords.length >= 2) {
    const m = tight.match(/(\d+(?:\.\d+)?)(NM|KM|M)EITHERSIDE/)
    const width = m ? toMeters(m[1], m[2]) : null
    return { kind: 'corridor', coords, radiusM: null, bufferNm: width == null ? null : width / M_PER_NM, approximated, defective: false }
  }
  if (/BOUNDEDBY/.test(tight)) {
    const key = (p) => `${p.lat},${p.lon}`
    // 닫는 점(마지막 == 첫째)은 정상이므로 빼고 본다.
    const body = coords.length > 1 && key(coords[0]) === key(coords[coords.length - 1]) ? coords.slice(0, -1) : coords
    const uniq = body.filter((p, i) => body.findIndex((q) => key(q) === key(p)) === i)
    // 중복이 남아 있으면 발행 과정에서 꼭짓점이 소실된 것이다(E3296/26). KML도 같은 결함이라
    // 내려갈 곳이 없다 — resolveNotamGeometry가 Q줄 원으로 넓게 덮는다.
    // 개수가 아니라 중복을 신호로 쓴다: 정당한 삼각형과 꼭짓점 잃은 사각형은 개수로 구별되지 않는다.
    if (uniq.length !== body.length) return none(true)
    if (uniq.length < 3) return none(true)
    return { kind: 'polygon', coords: uniq, radiusM: null, bufferNm: null, approximated, defective: false }
  }
  if (/CIRCLE|RADOF/.test(tight) && coords.length >= 1) {
    const m = tight.match(/RADIUS[:：]?(\d+(?:\.\d+)?)(NM|KM|M)/) || tight.match(/(\d+(?:\.\d+)?)(NM|KM|M)RAD(?:IUS)?OF/)
    return { kind: 'circle', coords, radiusM: m ? toMeters(m[1], m[2]) : null, bufferNm: null, approximated, defective: false }
  }
  // PSN이 여러 번 나오면 중심이 여럿이다(크레인 2기 등). coords를 전부 넘겨 MultiPolygon으로 만든다.
  if (/PSN[:：]/.test(tight) && /RADIUS[:：]?\d/.test(tight) && coords.length >= 1) {
    const m = tight.match(/RADIUS[:：]?(\d+(?:\.\d+)?)(NM|KM|M)/)
    return { kind: 'circle', coords, radiusM: m ? toMeters(m[1], m[2]) : null, bufferNm: null, approximated, defective: false }
  }
  // 좌표가 있어도 위 문형에 안 걸리면 쓰지 않는다.
  // Z0479/26의 좌표는 대체 웨이포인트지 이 NOTAM의 위치가 아니다.
  return none()
}

export default { parsePositionText, extractEBody, dmsToDecimal }
