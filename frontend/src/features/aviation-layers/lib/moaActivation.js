// 활성화 NOTAM ↔ 정적 MOA 폴리곤 매칭(순수 함수). 시간 판정은 하지 않는다 —
// 호출부가 deriveNotamTime()으로 결정한다(발효중/조건부/예정 구분은 NOTAM 뷰모델의 책임).
//
// 실측 근거(2026-07-25 라이브 NOTAM 376건 대조):
//  - 활성화 NOTAM은 두 형태로 온다. 본문에 구역명이 있는 것("CATA 7H ACT")과
//    좌표만 나열하는 것("TEMPO RESTRICTED AREA ACT AS FLW"). 한쪽만 보면 절반을 놓친다.
//  - 같은 구역의 저층/고층은 경계 좌표가 동일하다(75개 중 26개). 좌표만으로는 층을 못 고른다.
//  - AIP·NOTAM 모두 같은 원본에서 나와 좌표가 소수점 4자리까지 일치한다.
import { parseCeilingFt, parseFloorFt } from '../../../../../shared/airspace-altitude.js'

// 코드만으로는 유일하지 않다(MOA 5가 저·고층 두 개). 코드+상한+하한이면 75개 전부 유일하다.
export function moaMatchKey(props) {
  const p = props ?? {}
  return `${p.moa_lbl_1 ?? ''}|${p.moa_lbl_2 ?? ''}|${p.moa_lbl_3 ?? ''}`
}

export function geometryBbox(geometry) {
  if (!geometry?.coordinates) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
      return
    }
    for (const child of c) walk(child)
  }
  walk(geometry.coordinates)
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null
}

// NOTAM은 임시 구역을 자유롭게 그리므로 좌표가 딱 떨어지지 않는 게 정상이다.
// 같은 AIP 원본에서 나온 구역은 소수점 4자리까지 맞으므로 약 1km(0.01°)면 넉넉하다.
const BBOX_TOLERANCE_DEG = 0.01

function bboxNear(a, b, tol = BBOX_TOLERANCE_DEG) {
  if (!a || !b) return false
  return a.every((v, i) => Math.abs(v - b[i]) <= tol)
}

// 밴드가 조금이라도 겹치면 매칭. NOTAM 고도가 없으면 층을 가릴 근거가 없으므로 통과시킨다
// (미상=저촉 간주, notam-briefing.js의 보수적 안전 규칙과 동일 방향).
function altitudeOverlaps(notamAltitude, props) {
  if (!notamAltitude) return true
  const zoneLow = parseFloorFt(props.moa_lbl_3)
  const zoneHigh = parseCeilingFt(props.moa_lbl_2).value ?? Infinity
  const unit = String(notamAltitude.unit || '').toUpperCase()
  const toFt = (v) => (unit === 'FL' ? Number(v) * 100 : Number(v))
  const low = notamAltitude.lower == null ? 0 : toFt(notamAltitude.lower)
  const high = notamAltitude.upper == null ? Infinity : toFt(notamAltitude.upper)
  if (!Number.isFinite(low) && !Number.isFinite(high)) return true
  // 부등호가 strict인 이유: 저층과 고층은 경계 고도를 공유한다(CATA 7L 상한 = 7H 하한 = 2 500ft).
  // 경계에 닿기만 한 걸 겹침으로 치면 2 500~5 000ft NOTAM이 아래층까지 켜버린다.
  return low < zoneHigh && high > zoneLow
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "MOA 5"가 "MOA 50"에 걸리지 않도록 경계를 잡는다. 코드에 공백이 있어 \b만으로는 부족해
// 뒤에 숫자·영문이 이어지지 않는지 직접 확인한다.
function textMentionsCode(text, code) {
  if (!code) return false
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(code.toUpperCase())}(?![A-Z0-9])`).test(text)
}

export function matchMoaActivation(notamItems, moaFeatures) {
  const features = (moaFeatures ?? []).filter((f) => f?.properties && f?.geometry)
  const zones = features.map((f) => ({ props: f.properties, bbox: geometryBbox(f.geometry) }))
  const out = []
  const seen = new Set()

  for (const item of (notamItems ?? [])) {
    if (!item) continue
    const text = `${item.summary ?? ''} ${item.rawText ?? ''}`.toUpperCase()
    const byCode = zones.filter((z) => textMentionsCode(text, z.props.moa_lbl_1))
    // 이름이 있으면 이름이 우선 — 좌표가 같은 쌍둥이 층을 잘못 켜는 걸 막는다.
    const via = byCode.length ? 'code' : 'geometry'
    const candidates = byCode.length
      ? byCode
      : (item.geometry ? zones.filter((z) => bboxNear(geometryBbox(item.geometry), z.bbox)) : [])

    for (const z of candidates) {
      if (!altitudeOverlaps(item.altitude, z.props)) continue
      const key = moaMatchKey(z.props)
      const dedupe = `${item.id}::${key}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({ key, code: z.props.moa_lbl_1, via, notam: item })
    }
  }
  return out
}

export default { moaMatchKey, geometryBbox, matchMoaActivation }
