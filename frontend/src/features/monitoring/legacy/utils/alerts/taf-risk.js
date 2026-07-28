// TAF 시간칸의 위험 판정 (스펙 §12.1). 순수 함수.
//
// 임계값을 새로 만들지 않고 기존 트리거의 것을 그대로 읽는다. 같은 "위험의 기준"이
// 관측용과 예보용으로 갈리면 사용자가 어느 쪽을 고쳐야 하는지 매번 판단해야 한다.
// 부작용으로 METAR 계열 임계값을 조정하면 TAF 변화 판정도 함께 움직인다. 의도된 결합이다.

/**
 * settings.triggers 묶음에서 필요한 임계값만 뽑는다.
 * 해당 트리거가 없거나 꺼져 있어도 임계값 자체는 읽는다 — 켜기/끄기는 그 트리거의
 * 발동 여부일 뿐, "무엇을 위험으로 볼 것인가"의 기준은 그대로다.
 */
export function collectThresholds(allTriggers) {
  const taf = allTriggers?.taf_adverse_weather?.params ?? {};
  const ceiling = allTriggers?.low_ceiling?.params ?? {};
  const wind = allTriggers?.high_wind?.params ?? {};
  return {
    visThreshold: taf.vis_threshold ?? null,
    phenomena: taf.phenomena ?? [],
    ceilingThreshold: ceiling.threshold ?? null,
    ceilingAmounts: ceiling.amounts ?? [],
    windSpeed: wind.speed_threshold ?? null,
    windGust: wind.gust_threshold ?? null,
  };
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * 시간칸 하나의 위험 요소를 낸다. 위험이 없으면 빈 객체.
 * 값이 비어 있는 요소는 판정에서 제외한다 — 없는 값을 0으로 읽지 않는다(스펙 §15).
 */
export function riskOf(slot, thresholds) {
  const risk = {};
  if (!slot || !thresholds) return risk;

  // 시정 — CAVOK은 위험이 아니다.
  const vis = num(slot.visibility?.value);
  if (!slot.visibility?.cavok && vis !== null && thresholds.visThreshold !== null
      && vis < thresholds.visThreshold) {
    risk.visibility = vis;
  }

  // 특이기상 — 기존 트리거와 같은 방식으로 descriptor+phenomena를 이어 붙여 본다.
  // 일치하는 것을 **전부** 잇는다. 첫 하나만 남기면 이전 칸이 [FG], 새 칸이 [FG, TSRA]일 때
  // 양쪽 다 "FG"가 되어 TS 신규 등장이 §12.3 규칙②에 걸리지 않는다.
  const hits = (slot.weather ?? []).filter((wx) => {
    const combo = (wx?.descriptor ?? "") + (wx?.phenomena ?? []).join("");
    return thresholds.phenomena.some((p) => combo.includes(p));
  });
  if (hits.length > 0) risk.weather = hits.map((wx) => wx.raw).join(" ");

  // 운고 — BKN/OVC 중 **최저** 운저(스펙 §12.1). 기존 low_ceiling 트리거는 배열의
  // 첫 일치를 쓰는데, 여기서는 스펙이 최저를 명시하므로 다르다. 의도된 차이다.
  // NSC는 clouds가 비어 들어오므로 자연히 제외된다.
  if (Array.isArray(slot.clouds) && thresholds.ceilingThreshold !== null) {
    const bases = slot.clouds
      .filter((c) => thresholds.ceilingAmounts.includes(c?.amount))
      .map((c) => num(c?.base))
      .filter((b) => b !== null);
    if (bases.length > 0) {
      const lowest = Math.min(...bases);
      if (lowest < thresholds.ceilingThreshold) risk.ceiling = lowest;
    }
  }

  // 바람 — 풍속 또는 거스트. 둘 다 걸리면 더 큰 값(거스트)을 담는다.
  const speed = num(slot.wind?.speed);
  const gust = num(slot.wind?.gust);
  const speedHit = speed !== null && thresholds.windSpeed !== null && speed >= thresholds.windSpeed;
  const gustHit = gust !== null && thresholds.windGust !== null && gust >= thresholds.windGust;
  if (speedHit || gustHit) risk.wind = gustHit ? gust : speed;

  return risk;
}

export default { collectThresholds, riskOf };
