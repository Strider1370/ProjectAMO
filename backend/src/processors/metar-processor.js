import config from '../config.js'
import apiClient from '../api-client.js'
import store from '../store.js'
import metarParser from '../parsers/metar-parser.js'
import { buildMetarTacPresentation } from '../serializers/metar-tac.js'
import { collectionResult } from '../collector-execution.js'

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
      } else {
        failedAirports.push(airport.icao)
        airportErrors[airport.icao] = 'parse_null'
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      failedAirports.push(airport.icao);
      airportErrors[airport.icao] = error.message || "Unknown error";
    }
  }

  const freshAirportCount = Object.keys(result.airports).length
  if (freshAirportCount > 0 && failedAirports.length > 0) {
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

  const outcome = freshAirportCount === 0 ? 'failed' : (failedAirports.length > 0 ? 'partial' : 'complete')
  const collection = collectionResult(outcome, outcome === 'failed' ? null : result, {
    reason: outcome === 'failed' ? 'no_usable_metar_reports' : null,
  })
  const saveResult = store.publishCollection("metar", collection);
  return {
    type: "metar",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors,
    airportObsTimes,
    collection,
  };
}

export { processAll }
export default { processAll }
