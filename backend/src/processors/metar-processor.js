import config from '../config.js'
import apiClient from '../api-client.js'
import store from '../store.js'
import metarParser from '../parsers/metar-parser.js'
import { buildMetarTacPresentation } from '../serializers/metar-tac.js'

async function processAll({ signal } = {}) {
  const result = {
    type: "METAR",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];
  const airportErrors = {};

  for (const airport of config.airports) {
    signal?.throwIfAborted()
    try {
      const xml = await apiClient.fetch("metar", airport.icao, { signal });
      const parsed = metarParser.parse(xml);
      if (parsed) {
        if (parsed.header?.source) parsed.header.source.fetch_time = result.fetched_at;
        // 국내 IWXXM은 원문 TAC가 없음 → 파싱 결과로 재구성해 채움(외국은 이미 raw_text 보유)
        if (parsed.header) { const tac = buildMetarTacPresentation(parsed); parsed.header.raw_text = tac?.text ?? null; parsed.header.tac = tac }
        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      failedAirports.push(airport.icao);
      airportErrors[airport.icao] = error.message || "Unknown error";
    }
  }

  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "metar", failedAirports);
  }

  const airportObsTimes = {};
  for (const [icao, data] of Object.entries(result.airports)) {
    if (data?.header) {
      airportObsTimes[icao] = {
        observation_time: data.header.observation_time || null,
        report_type: data.header.report_type || null
      };
    }
  }

  const saveResult = store.save("metar", result);
  return {
    type: "metar",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors,
    airportObsTimes
  };
}

export { processAll }
export default { processAll }
