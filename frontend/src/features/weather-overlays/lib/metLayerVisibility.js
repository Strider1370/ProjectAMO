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
      ...prev,
      wind: nextWind,
      temp: false,
      cloud: false,
      icing: false,
      windFlow: nextWind ? !lowPower : prev.windFlow,
      windSpeed: nextWind ? true : prev.windSpeed,
    }
  }
  if (id === 'temp') {
    const nextTemp = !prev.temp
    return {
      ...prev,
      temp: nextTemp,
      wind: false,
      cloud: false,
      icing: false,
      windFlow: false,
    }
  }
  if (id === 'cloud') {
    const nextCloud = !prev.cloud
    return {
      ...prev,
      cloud: nextCloud,
      wind: false,
      temp: false,
      icing: false,
      windFlow: false,
    }
  }
  if (id === 'icing') {
    const nextIcing = !prev.icing
    return {
      ...prev,
      icing: nextIcing,
      wind: false,
      temp: false,
      cloud: false,
      windFlow: false,
    }
  }
  return { ...prev, [id]: !prev[id] }
}

export default getNextMetVisibility
