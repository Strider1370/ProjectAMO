import apiClient from '../api-client.js'
import store from '../store.js'
import warningParser from '../parsers/warning-parser.js'
import { collectionResult } from '../collector-execution.js'

async function process() {
  let parsed
  let collection
  try {
    const xml = await apiClient.fetch("warning");
    parsed = warningParser.parse(xml);
    const airports = Object.keys(parsed.airports || {}).length
    if (parsed.normalEmpty) {
      collection = collectionResult('empty', parsed, { normalEmpty: true })
    } else if (airports === 0) {
      collection = collectionResult('failed', null, { reason: 'warning_payload_empty_without_result_code_03' })
    } else {
      collection = collectionResult('complete', parsed)
    }
  } catch (error) {
    collection = collectionResult('failed', null, {
      reason: error?.message || 'warning_collection_failed',
    })
  }
  const saveResult = store.publishCollection("warning", collection);

  return {
    type: "warning",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    airports: Object.keys(parsed?.airports || {}).length,
    collection,
  };
}

export { process }
export default { process }
