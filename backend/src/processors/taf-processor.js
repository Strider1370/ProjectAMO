import config from '../config.js'
import apiClient from '../api-client.js'
import store from '../store.js'
import tafParser from '../parsers/taf-parser.js'
import { buildTafTacPresentation } from '../serializers/taf-tac.js'

async function processAll() {
  const result = {
    type: "TAF",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];
  const airportErrors = {};

  for (const airport of config.airports) {
    try {
      const xml = await apiClient.fetch("taf", airport.icao);
      const parsed = tafParser.parse(xml);
      if (parsed) {
        if (parsed.header?.source) parsed.header.source.fetch_time = result.fetched_at;
        // 국내 IWXXM은 원문 TAF가 없음 → base+change_groups로 재구성해 채움
        if (parsed.header) { const tac = buildTafTacPresentation(parsed); parsed.header.raw_text = tac?.text ?? null; parsed.header.tac = tac }
        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      failedAirports.push(airport.icao);
      airportErrors[airport.icao] = error.message || "Unknown error";
    }
  }

  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "taf", failedAirports);
  }

  const saveResult = store.save("taf", result);
  return {
    type: "taf",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors
  };
}

export { processAll }
export default { processAll }
