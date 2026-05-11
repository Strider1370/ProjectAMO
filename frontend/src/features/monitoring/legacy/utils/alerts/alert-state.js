const alertHistory = {};

/**
 * 트리거 결과 + ICAO로 고유 키를 생성한다.
 */
export function buildAlertKey(result, icao) {
  const { triggerId, data } = result;

  if (triggerId === "warning_issued" || triggerId === "warning_cleared") {
    const items = Array.isArray(data) ? data : [];
    const suffix = items.map((w) => `${w.wrng_type_name}:${w.valid_start}-${w.valid_end}`).join("|");
    return `${triggerId}:${icao}:${suffix}`;
  }

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
 * 조건이 해소된 트리거의 이력을 삭제한다.
 * firedKeys: 이번 사이클에서 발동된 키 Set
 */
export function clearResolvedAlerts(firedKeys) {
  for (const key of Object.keys(alertHistory)) {
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
