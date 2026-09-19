import tls from 'node:tls'

const DEFAULT_ORIGIN = 'https://projectamo.co.kr'
const DEFAULT_TIMEOUT_MS = 10_000

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

export function inspectCertificate({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS, connect = tls.connect } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const socket = connect({ host, port, servername: host, rejectUnauthorized: false })
    socket.setTimeout(timeoutMs)
    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate()
      socket.end()
      const notAfterMs = Date.parse(peer?.valid_to ?? '')
      finish({
        ok: true,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ?? null,
        notAfter: Number.isFinite(notAfterMs) ? new Date(notAfterMs).toISOString() : null,
      })
    })
    socket.once('timeout', () => {
      socket.destroy()
      finish({ ok: false, error: 'TLS 연결 시간 초과' })
    })
    socket.once('error', (error) => finish({ ok: false, error: message(error) }))
  })
}

// nginx와 공개 TLS 인증서를 실제 도메인으로 확인한다. localhost를 보지 않아
// 인증서 만료·공개 443 설정 오류를 놓치지 않는다.
export async function probePublicSite({
  origin = process.env.OPS_MONITOR_ORIGIN || DEFAULT_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  connect,
} = {}) {
  let base
  try {
    base = new URL(origin)
    if (base.protocol !== 'https:') throw new Error('HTTPS 주소여야 합니다')
  } catch (error) {
    return { tls: { ok: false, error: `운영 사이트 주소 오류: ${message(error)}` }, health: { ok: false, error: '점검 생략' } }
  }

  const port = Number(base.port || 443)
  const tlsState = await inspectCertificate({ host: base.hostname, port, timeoutMs, ...(connect ? { connect } : {}) })
  const healthUrl = new URL('/api/health', base)
  try {
    const response = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(timeoutMs) })
    return { tls: tlsState, health: { ok: response.ok, status: response.status } }
  } catch (error) {
    return { tls: tlsState, health: { ok: false, error: message(error) } }
  }
}

export default { inspectCertificate, probePublicSite }
