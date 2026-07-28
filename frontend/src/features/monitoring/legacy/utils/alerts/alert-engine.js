import triggers from "./alert-triggers.js";

/**
 * 현재 선택된 공항의 데이터에 대해 모든 트리거를 평가한다.
 *
 * @param {object} currentData   - { metar, taf, warning, lightning } 현재 공항 데이터
 * @param {object} previousData  - { metar, taf, warning, lightning } 이전 공항 데이터 (없으면 null)
 * @param {object} settings      - resolveSettings() 결과
 * 네 번째 인자로 전체 트리거 설정을 넘긴다. TAF 변화 알람이 다른 트리거의 임계값을
 * 그대로 읽어 쓰기 때문이다(스펙 §12.1). 기존 6종은 이 인자를 쓰지 않는다.
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
      const result = trigger.evaluate(current, previous, triggerSettings.params, settings.triggers);
      if (result) {
        results.push(result);
      }
    } catch (err) {
      console.warn(`[AlertEngine] Trigger "${trigger.id}" error:`, err.message);
    }
  }

  return results;
}
