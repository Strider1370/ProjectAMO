// 오른쪽 세로 슬라이더 자리 하나를 공유하는 그룹: KIM(바람·기온·구름·착빙) 4형제는
// 서로 배타적이고(하나만 켜짐), 그 KIM 그룹 전체가 난류·운정고도와도 서로 배타적이다.
// 셋 중 하나를 켜면 슬라이더 자리의 내용물만 바뀌는 것처럼 보이도록 나머지 KIM/난류/운정고도를 끈다.
// WISSDOM is an independent radar-height control, not a MET visibility layer; it must
// never clear or rewrite the KIM pressure selection here.
const KIM_LAYER_IDS = ['wind', 'temp', 'cloud', 'icing']
const VERTICAL_SLIDER_GROUP_IDS = [...KIM_LAYER_IDS, 'turbulence', 'ctps']

function clearVerticalSliderGroup(prev) {
  const next = { ...prev }
  VERTICAL_SLIDER_GROUP_IDS.forEach((groupId) => { next[groupId] = false })
  return next
}

export function getNextMetVisibility(prev, id, { lowPower = false } = {}) {
  // 국내(KMA) ↔ 해외(RainViewer) 레이더는 상호배타. 색상표·출처·정확도가 다른 별개 제품이고,
  // 겹쳐 켜면 KMA의 무에코(투명) 영역으로 해외 레이더가 비쳐 두 색 기준이 섞인다.
  // lowPower는 무관 — 남이 렌더한 타일이라 우리 쪽 계산 부하가 없다.
  if (id === 'radar') {
    return { ...prev, radar: !prev.radar, radarOverseas: false }
  }
  if (id === 'radarOverseas') {
    return { ...prev, radarOverseas: !prev.radarOverseas, radar: false }
  }
  if (id === 'wind') {
    const nextWind = !prev.wind
    return {
      ...clearVerticalSliderGroup(prev),
      wind: nextWind,
      windFlow: nextWind ? !lowPower : prev.windFlow,
      windSpeed: nextWind ? true : prev.windSpeed,
    }
  }
  if (id === 'temp') {
    const nextTemp = !prev.temp
    return {
      ...clearVerticalSliderGroup(prev),
      temp: nextTemp,
      windFlow: false,
    }
  }
  if (id === 'cloud') {
    const nextCloud = !prev.cloud
    return {
      ...clearVerticalSliderGroup(prev),
      cloud: nextCloud,
      windFlow: false,
    }
  }
  if (id === 'icing') {
    const nextIcing = !prev.icing
    return {
      ...clearVerticalSliderGroup(prev),
      icing: nextIcing,
      windFlow: false,
    }
  }
  if (id === 'turbulence') {
    const nextTurbulence = !prev.turbulence
    return {
      ...clearVerticalSliderGroup(prev),
      turbulence: nextTurbulence,
      windFlow: nextTurbulence ? false : prev.windFlow,
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
  return { ...prev, [id]: !prev[id] }
}

export default getNextMetVisibility
