// Operator-only bound per provider call, including hidden reasoning and visible
// output. Never accept this setting from chat input or automatically retry larger.
export function outputTokenBudget(value) {
  if (value === undefined || value === '') return 1600
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('INVALID_OUTPUT_TOKEN_BUDGET')
  const tokens = Number(value)
  if (!Number.isInteger(tokens) || tokens < 256 || tokens > 8192) throw new Error('INVALID_OUTPUT_TOKEN_BUDGET')
  return tokens
}
