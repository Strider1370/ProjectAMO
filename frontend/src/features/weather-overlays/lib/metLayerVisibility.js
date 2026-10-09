// 구름·착빙·등온선은 같은 KIM 선택에서 함께 표시한다.
// 바람·난류·운정과는 하나의 고도 레일을 공유하는 보기로 전환한다. 바람과 난류는 같은 KIM 고도라 함께 켤 수 있다.
// WISSDOM is an independent radar-height control, not a MET visibility layer; it must
// never clear or rewrite the KIM pressure selection here.
const KIM_LAYER_IDS = ['wind', 'temp', 'cloud', 'icing']
const VERTICAL_SLIDER_GROUP_IDS = [...KIM_LAYER_IDS, 'turbulence', 'ctps']

function savedChildren(prev) {
  return { cloud: !!prev.cloud, icing: !!prev.icing }
}
export function createInitialMetVisibility(layerIds, overrides = {}) {
  overrides ??= {}
  const visibility = { ...Object.fromEntries(layerIds.map(id => [id, id === 'sigmet' || id === 'airmet'])), radarHsr: true, windFlow: true, windSpeed: true, surfaceChartWind: 'barbs', ...overrides }
  // 기존에 둘 중 하나만 켜둔 지도도 시정·운고 통합 보기로 복원한다.
  if (layerIds.includes('visibility') || layerIds.includes('ceiling')) {
    visibility.visibility = visibility.ceiling = !!(overrides.visibility || overrides.ceiling)
  }
  if (!layerIds.includes('cloudIcing')) return visibility
  const active = overrides.cloudIcingPresentationVersion >= 2 ? !!overrides.cloudIcing : !!(overrides.cloudIcing || overrides.temp || overrides.cloud || overrides.icing)
  const parentOnly = overrides.cloudIcing && !['cloud','icing','temp'].some(id => Object.hasOwn(overrides, id))
  return { ...visibility, cloudIcingPresentationVersion: 2, cloudIcing: active, temp: active, cloud: active && (parentOnly || !!overrides.cloud), icing: active && (parentOnly || !!overrides.icing), cloudIcingDetail: false }
}

function clearVerticalSliderGroup(prev) {
  const next = { ...prev }
  if (Object.hasOwn(prev, 'cloudIcing')) {
    if (prev.cloudIcing) next.cloudIcingSaved = savedChildren(prev)
    next.cloudIcing = false
  }
  VERTICAL_SLIDER_GROUP_IDS.forEach((groupId) => { next[groupId] = false })
  return next
}

export function getNextMetVisibility(prev, id, { lowPower = false } = {}) {
  // ceiling은 저장된 액션·외부 호출의 호환 ID이며 같은 통합 보기를 제어한다.
  if (id === 'visibility' || id === 'ceiling') {
    const active = !(prev.visibility || prev.ceiling)
    return { ...prev, visibility: active, ceiling: active }
  }
  // 국내(KMA) ↔ 해외(RainViewer) 레이더는 상호배타. 색상표·출처·정확도가 다른 별개 제품이고,
  // 겹쳐 켜면 KMA의 무에코(투명) 영역으로 해외 레이더가 비쳐 두 색 기준이 섞인다.
  // lowPower는 무관 — 남이 렌더한 타일이라 우리 쪽 계산 부하가 없다.
  if (id === 'radarHsr') {
    return { ...prev, radarHsr: !prev.radarHsr, radarOverseas: false }
  }
  if (id === 'radarOverseas') {
    return { ...prev, radarOverseas: !prev.radarOverseas, radarHsr: false }
  }
  if (id === 'wind') {
    const nextWind = !prev.wind
    const turbulence = !!prev.turbulence
    return {
      ...clearVerticalSliderGroup(prev),
      wind: nextWind,
      turbulence,
      windFlow: nextWind ? !lowPower : prev.windFlow,
      windSpeed: nextWind ? true : prev.windSpeed,
    }
  }
  if (id === 'cloudIcing') {
    const next = clearVerticalSliderGroup(prev)
    if (prev.cloudIcing) return next
    const saved = prev.cloudIcingSaved
    const children = saved && ['cloud','icing'].every(key => typeof saved[key] === 'boolean') ? saved : { cloud: true, icing: true }
    return { ...next, ...children, temp: true, cloudIcing: true, cloudIcingDetail: false, windFlow: false }
  }
  if (Object.hasOwn(prev, 'cloudIcing') && ['temp','cloud','icing'].includes(id)) {
    if (id === 'temp') return prev.cloudIcing ? prev : getNextMetVisibility(prev, 'cloudIcing', { lowPower })
    const next = { ...prev, [id]: !prev[id], cloudIcing: true, temp: true, cloudIcingDetail: false, wind: false, turbulence: false, ctps: false, windFlow: false }
    return { ...next, cloudIcingSaved: savedChildren(next) }
  }
  if (['temp', 'cloud', 'icing'].includes(id)) {
    const next = { temp: false, cloud: false, icing: false, ...prev, [id]: !prev[id], wind: false, turbulence: false, ctps: false, windFlow: false }
    if (Object.hasOwn(prev, 'cloudIcing')) {
      next.cloudIcing = !!(next.temp || next.cloud || next.icing)
      if (next.cloudIcing) next.cloudIcingSaved = { temp: !!next.temp, cloud: !!next.cloud, icing: !!next.icing }
    }
    return next
  }
  if (id === 'turbulence') {
    const nextTurbulence = !prev.turbulence
    const wind = !!prev.wind
    return {
      ...clearVerticalSliderGroup(prev),
      turbulence: nextTurbulence,
      wind,
      // 바람이 켜져 있으면 바람 표시(흐름·속도 색)는 그대로 둔다.
      windFlow: wind ? prev.windFlow : nextTurbulence ? false : prev.windFlow,
    }
  }
  if (id === 'ctps') {
    const nextCtps = !prev.ctps
    return {
      ...clearVerticalSliderGroup(prev),
      ctps: nextCtps,
      windFlow: nextCtps ? false : prev.windFlow,
    }
  }
  // 수치모델 제목 옆 버튼: 바람깃 ↔ 애니메이션 전환
  if (id === 'surfaceChartWind') {
    return { ...prev, surfaceChartWind: prev.surfaceChartWind === 'flow' ? 'barbs' : 'flow' }
  }
  return { ...prev, [id]: !prev[id] }
}

export default getNextMetVisibility

export function clearMetVisibility(prev, layerIds) {
  const next = clearVerticalSliderGroup(prev)
  for (const id of layerIds) next[id] = false
  if (layerIds.includes('visibility') || layerIds.includes('ceiling')) {
    next.visibility = next.ceiling = false
  }
  return next
}
