import triggers from "./alert-triggers";

/**
 * 현재 선택된 공항의 데이터에 대해 모든 트리거를 평가한다.
 *
 * @param {object} currentData   - { metar, taf, warning, lightning } 현재 공항 데이터
 * @param {object} previousData  - { metar, taf, warning, lightning } 이전 공항 데이터 (없으면 null)
 * @param {object} settings      - resolveSettings() 결과
 * @returns {Array} 발동된 트리거 결과 배열
 */
export function evaluate(currentData, previousData, settings) {
  const results = [];

  for (const trigger of triggers) {
    const triggerSettings = settings.triggers[trigger.id];
    if (!triggerSettings || !triggerSettings.enabled) continue;

    let current = null;
    let previous = null;

    if (trigger.category === "metar") {
      current = currentData.metar;
      previous = previousData?.metar || null;
    } else if (trigger.category === "taf") {
      current = currentData.taf;
      previous = previousData?.taf || null;
    } else if (trigger.category === "warning") {
      current = currentData.warning;
      previous = previousData?.warning || null;
    } else if (trigger.category === "lightning") {
      current = currentData.lightning;
      previous = previousData?.lightning || null;
    }

    if (!current) continue;

    try {
      const result = trigger.evaluate(current, previous, triggerSettings.params);
      if (result) {
        results.push(result);
      }
    } catch (err) {
      console.warn(`[AlertEngine] Trigger "${trigger.id}" error:`, err.message);
    }
  }

  return results;
}
