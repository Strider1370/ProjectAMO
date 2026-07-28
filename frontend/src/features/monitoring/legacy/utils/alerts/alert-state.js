const alertHistory = {};

/**
 * 트리거 결과 + ICAO로 고유 키를 생성한다.
 */
export function buildAlertKey(result, icao) {
  const { triggerId, data } = result;

  if (triggerId === "low_visibility") {
    return `${triggerId}:${icao}:${data?.threshold}`;
  }

  if (triggerId === "high_wind") {
    return `${triggerId}:${icao}`;
  }

  if (triggerId === "weather_phenomenon") {
    const codes = Array.isArray(data) ? data.map((m) => m.code).join(",") : "";
    return `${triggerId}:${icao}:${codes}`;
  }

  if (triggerId === "low_ceiling") {
    return `${triggerId}:${icao}`;
  }

  if (triggerId === "taf_adverse_weather") {
    return `${triggerId}:${icao}`;
  }

  if (triggerId === "taf_change" || triggerId === "taf_new_period") {
    // 발표마다 별개의 알람이 되어 재알림 간격이 새 발표를 가로막지 않는다(스펙 §12.7).
    // 새 TAF가 오면 키가 바뀌어 옛 줄이 유효 목록에서 빠지고 교체된다.
    return `${triggerId}:${icao}:${result.issued ?? ""}`;
  }

  if (triggerId === "lightning_detected") {
    const newest = data?.newStrikes?.[0]?.time || "";
    return `${triggerId}:${icao}:${newest}`;
  }

  return `${triggerId}:${icao}`;
}

/**
 * 쿨다운 내인지 확인한다.
 */
export function isInCooldown(alertKey, cooldownSeconds) {
  const entry = alertHistory[alertKey];
  if (!entry) return false;
  const elapsed = (Date.now() - entry.lastFired) / 1000;
  return elapsed < cooldownSeconds;
}

/**
 * 알림 발동을 기록한다.
 */
export function recordAlert(alertKey) {
  const existing = alertHistory[alertKey];
  if (existing) {
    existing.lastFired = Date.now();
    existing.count += 1;
  } else {
    alertHistory[alertKey] = {
      firstFired: Date.now(),
      lastFired: Date.now(),
      count: 1,
    };
  }
}

/**
 * 조건이 해소된 트리거의 이력을 삭제한다. 해당 공항의 키만 본다.
 * 이력이 전역이면 다른 공항을 보는 동안 이전 공항 이력이 지워져 재알림 간격이 무시된다.
 * firedKeys: 이번 사이클에서 발동된 키 Set
 */
export function clearResolvedAlerts(firedKeys, icao) {
  const suffix = `:${icao}`;
  for (const key of Object.keys(alertHistory)) {
    if (!key.endsWith(suffix) && !key.includes(`${suffix}:`)) continue;
    if (!firedKeys.has(key)) {
      delete alertHistory[key];
    }
  }
}

/**
 * 현재 이력 상태를 반환한다 (디버깅용).
 */
export function getHistory() {
  return { ...alertHistory };
}

/**
 * 조건이 처음 발동한 시각. 재발화(recordAlert 재호출)에도 바뀌지 않고,
 * 조건이 해소되어 이력이 지워진 뒤 다시 발동하면 새 시각으로 갱신된다.
 * 강조 창의 기준점으로 쓴다 — timestamp(마지막 발동)와는 다른 값이다.
 */
export function getFirstFired(alertKey) {
  return alertHistory[alertKey]?.firstFired ?? null;
}
