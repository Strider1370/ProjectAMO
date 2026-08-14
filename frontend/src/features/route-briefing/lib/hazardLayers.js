// 위험현상 → 지도 레이어 룰북 (브리핑 도메인 지식).
// 새 규칙은 RULEBOOK에 한 줄 추가하면 됨. 코드 출처: shared/weather/phenomenonKo.js.
// 주의: METAR/TAF/공항경보는 지도 레이어가 아니라 토글 대상이 아님
//       (브리핑 본문 ②현재·④목적지, 상단 위험요약 바 공항경보 칩으로 표시).
// 반환 레이어 id는 MET_LAYERS(features/map/layerActions의 단일 출처)에 존재해야 함 — hazardLayers.test.js가 강제.
const RULEBOOK = [
  { codes: ['SEV_ICE', 'MOD_ICE'], layers: ['icing'] },
  { codes: ['SEV_TURB', 'MOD_TURB'], layers: ['turbulence'] },
  { codes: ['TS', 'EMBD_TS', 'OBSC_TS', 'FRQ_TS', 'SQL_TS'], layers: ['radarHsr', 'lightning', 'sigmet'] },
  { codes: ['TC'], layers: ['radarHsr', 'sigmet'] },
  // 추후 추가: CB/GR(적란운·우박), MTW(산악파), VA(화산재), LLWS(윈드시어), IFR/SFC_VIS 등.
  // NOTAM 카테고리(사실 분류) → notam 마스터 레이어. 경로상 NOTAM 있으면 "지도에 NOTAM 레이어 보기" 칩.
  { codes: ['prohibited', 'restricted', 'danger', 'firing', 'obstacle', 'facility', 'other'], layers: ['notam'] },
]

// 브리핑이 계산한 경로상 위험(adverse.hazards 코드 + enroute.model kind)에서
// 룰북에 따라 켤 MET 레이어 id 집합을 만든다. 레이어 토글 자체는 MapView 소유.
export function hazardMapLayers(briefing) {
  const hazards = briefing?.sections?.adverse?.hazards ?? []
  const notamCats = (briefing?.routeNotams ?? []).map((n) => n.category || '')
  const modelKinds = new Set((briefing?.sections?.enroute?.model?.elements ?? []).map((e) => e.kind))
  const layers = new Set()

  // adverse 위험: 코드→룰북. sigmet 레이어는 해당 위험이 해외(NOAA) SIGMET이면 sigmet_intl(국제)로.
  // 국내·해외 SIGMET이 둘 다 걸리면 두 칩 모두 표시.
  for (const h of hazards)
    for (const rule of RULEBOOK)
      if (rule.codes.includes(h.code || ''))
        for (const l of rule.layers) layers.add(l === 'sigmet' && h.overseas ? 'sigmet_intl' : l)

  // 경로상 NOTAM 카테고리 → notam 레이어
  for (const cat of notamCats)
    for (const rule of RULEBOOK)
      if (rule.codes.includes(cat)) rule.layers.forEach((l) => layers.add(l))

  // enroute 모델(KTG 난류·KIM 착빙)에서 직접 잡힌 것
  if (modelKinds.has('icing')) layers.add('icing')
  if (modelKinds.has('turbulence')) layers.add('turbulence')

  return [...layers]
}
