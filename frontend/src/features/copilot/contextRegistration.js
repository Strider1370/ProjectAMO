import { copilotRequest } from './copilotApi.js'

export async function contextRevision(snapshot) {
  if (!snapshot) return null
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('')
  return `applied-${hash}`
}

export function contextLabel(snapshot, airport) {
  return snapshot ? `${snapshot.request.departureAirport} → ${snapshot.request.arrivalAirport} · ${snapshot.request.plannedCruiseAltitudeFt.toLocaleString()} ft`
    : airport ? `${airport} · 적용 경로 없음` : '공항·경로 연결 없음'
}

export function createContextRegistration({ request = copilotRequest, now = Date.now } = {}) {
  let cached = null
  return async (snapshot, signal) => {
    if (!snapshot) return { contextRef: null, revision: null, label: '적용 경로 없음' }
    if (snapshot.unsupported) throw Object.assign(new Error(snapshot.unsupported), { code: snapshot.unsupported })
    const frozen = structuredClone(snapshot)
    const revision = await contextRevision(frozen)
    if (!cached || cached.revision !== revision || Date.parse(cached.expiresAt) <= now() + 5000) {
      const result = await request('/contexts', { ...frozen, revision }, signal)
      if (result.status !== 'ok') throw Object.assign(new Error('CONTEXT_REGISTRATION_FAILED'), { code: result.error?.code })
      cached = { ...result, revision }
    }
    return { contextRef: cached.contextRef, revision, label: contextLabel(frozen) }
  }
}
