// Strict transport schema uses required nullable fields to represent optional
// app arguments. Zod remains authoritative after decoding; refinements are not
// claimed to be enforced by the provider's schema alone.
export function strictParameters(schema) {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(strictParameters)
  const result = Object.fromEntries(Object.entries(schema)
    .filter(([key]) => !['$schema', 'default'].includes(key))
    .map(([key, value]) => [key, strictParameters(value)]))
  if (schema.type === 'object') {
    const required = new Set(schema.required ?? [])
    result.properties = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => {
      const normalized = strictParameters(value)
      return [key, required.has(key) ? normalized : { anyOf: [normalized, { type: 'null' }] }]
    }))
    result.required = Object.keys(result.properties)
    result.additionalProperties = false
  }
  return result
}

export function decodeOptionalNulls(value, schema) {
  if (schema?.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const required = new Set(schema.required ?? [])
    return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
      !(item === null && Object.hasOwn(schema.properties ?? {}, key) && !required.has(key)))
      .map(([key, item]) => [key, decodeOptionalNulls(item, schema.properties?.[key])]))
  }
  if (schema?.type === 'array' && Array.isArray(value)) return value.map((item) => decodeOptionalNulls(item, schema.items))
  return value
}
