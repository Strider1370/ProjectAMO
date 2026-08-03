import apiClient from '../api-client.js'
import store from '../store.js'
import parser from '../parsers/kma-special-warning-parser.js'

async function process(options = {}) {
  const raw = await apiClient.fetchKmaSpecialWarning(options)
  const parsed = parser.parse(raw)
  const saveResult = store.save('kma_special_warning', parsed)
  return { type: 'kma_special_warning', saved: saveResult.saved, filePath: saveResult.filePath || null, airports: Object.keys(parsed.airports).length }
}

export { process }
export default { process }
