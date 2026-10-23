export const FIELDS = [
  { key: 'visibility', label: '시정', unit: 'm', direction: '미만', initial: 1500, max: 100000 },
  { key: 'ceiling', label: '운고', unit: 'ft', direction: '미만', initial: 500, max: 60000 },
  { key: 'wind', label: '풍속', unit: 'kt', direction: '이상', initial: 25, max: 300 },
  { key: 'temperature', label: '기온', unit: '°C', direction: '이상', initial: 30, min: -60, max: 60, optional: true },
  { key: 'windshear', label: '급변풍', unit: '', direction: '보고 시', initial: 1, max: 1, kind: 'event', optional: true },
  { key: 'gust', label: '돌풍', unit: 'kt', direction: '이상', initial: 35, max: 300 },
]
export const initialRules = () => Object.fromEntries(FIELDS.map(f => [f.key, { enabled: !f.optional, threshold: f.initial, direction: f.direction }]))
export const initialValues = () => ({ visibility: 3000, ceiling: 1000, wind: 12, gust: 20, temperature: 20, windshear: 0 })
export function evaluate(rules, values, previous = {}) {
  const states = {}, entered = [], resolved = []
  for (const field of FIELDS) {
    const rule = rules[field.key], value = values[field.key]
    if (!rule?.enabled) { states[field.key] = 'off'; continue }
    if (!Number.isFinite(value)) { states[field.key] = 'unknown'; continue }
    const direction = rule.direction ?? field.direction
    const hit = field.kind === 'event' ? value === 1 : direction === '미만' ? value < rule.threshold : direction === '이하' ? value <= rule.threshold : value >= rule.threshold
    states[field.key] = hit ? 'active' : 'clear'
    if (hit && previous[field.key] !== 'active') entered.push(field.key)
    if (!hit && previous[field.key] === 'active') resolved.push(field.key)
  }
  // Missing observations do not resolve an ongoing incident or re-arm its popup.
  const memory = Object.fromEntries(FIELDS.map(f => [f.key, states[f.key] === 'unknown' ? previous[f.key] : states[f.key]]))
  return { states, memory, entered, resolved }
}

export const metricValue = m => m.kind === 'event' ? (m.value === 1 ? '보고 있음' : '보고 없음') : `${m.value.toLocaleString('ko-KR')}${m.unit}`
export const metricRule = m => m.kind === 'event' ? '급변풍 보고 시' : `${m.threshold.toLocaleString('ko-KR')}${m.unit} ${m.direction}`
