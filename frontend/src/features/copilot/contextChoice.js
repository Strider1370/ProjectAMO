import { contextLabel, contextRevision } from './contextRegistration.js'

// This captures actual applied inputs, never a model's proposed geometry.
export async function captureChatContext(snapshot, airport, attached = true) {
  if (!attached) return { context: null, snapshot: null, label: contextLabel(null) }
  if (snapshot?.unsupported) throw Object.assign(new Error(snapshot.unsupported), { code: snapshot.unsupported })
  const frozen = snapshot ? structuredClone(snapshot) : null
  return { context: { airport: airport ?? null, contextRef: null, revision: await contextRevision(frozen) },
    snapshot: frozen, label: contextLabel(frozen, airport) }
}

export function sameChatContext(left, right) {
  return (left?.context?.revision ?? null) === (right?.context?.revision ?? null)
    && (left?.context?.airport ?? null) === (right?.context?.airport ?? null)
}

export function needsContextChoice(previous, next) {
  return Boolean(previous && (previous.context?.revision || previous.context?.airport) && !sameChatContext(previous, next))
}

// A new server conversation is the hard boundary: old slots/tool references and
// prose do not silently carry over. Visible cards/history remain readable.
export function startsContextConversation(previous, next) {
  return Boolean(previous && !sameChatContext(previous, next))
}
