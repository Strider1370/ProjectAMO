export async function copilotRequest(path, body, signal) {
  const response = await fetch(`/api/ai${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) {
    const code = result.error?.code ?? result.error ?? 'REQUEST_FAILED'
    throw Object.assign(new Error(code), { code, status: response.status, quota: result.quota })
  }
  return result
}
