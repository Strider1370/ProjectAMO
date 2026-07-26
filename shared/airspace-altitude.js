// AIP 공역 차트의 고도 라벨 텍스트를 피트로 정규화한다. 프론트(지도 매칭)와 백엔드(브리핑 저촉 판정)가
// 같은 규칙을 써야 해서 공유 모듈에 둔다 — 특히 FL 환산은 한 곳에서만 정의한다.
//
// 입력 예: "6 000 AMSL", "3 000 AGL", "FL 400", "UNL", "GND", "SFC"
// notamBandToFt()는 밴드당 unit이 하나뿐인데 MOA는 상한 FL/하한 AMSL이 섞여 나오므로(MOA 12E)
// 여기서 FL을 ft로 펴놓지 않으면 혼합 밴드를 표현할 방법이 없다.

const FL_TO_FT = 100

// FL은 기압고도라 AMSL/AGL 기준면 라벨이 없고 100ft 단위다(FL400 = 40 000ft).
// 숫자만 뽑으면 400ft가 되어 순항고도가 구역 위에 있다고 오판 → 저촉을 놓친다.
function labelToFt(text) {
  const t = String(text || '').trim().toUpperCase()
  const digits = t.replace(/[^\d]/g, '')
  if (!digits) return null
  return t.startsWith('FL') ? Number(digits) * FL_TO_FT : Number(digits)
}

export function parseCeilingFt(text) {
  const t = String(text || '').trim().toUpperCase()
  if (!t || t === 'UNL') return { value: null, ref: null }
  const ref = t.includes('AMSL') ? 'AMSL' : t.includes('AGL') ? 'AGL' : null
  return { value: labelToFt(t), ref }
}

export function parseFloorFt(text) {
  const t = String(text || '').trim().toUpperCase()
  if (!t || t === 'GND' || t === 'SFC') return 0
  return labelToFt(t) ?? 0
}

export function zoneAltitude(ceilingText, floorText) {
  const ceiling = parseCeilingFt(ceilingText)
  return { lower: parseFloorFt(floorText), upper: ceiling.value, unit: 'FT', ref: ceiling.ref }
}

export default { parseCeilingFt, parseFloorFt, zoneAltitude }
