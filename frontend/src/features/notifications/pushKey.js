// VAPID 공개키(base64url) → PushManager.subscribe가 요구하는 Uint8Array.
// 문자열을 그대로 넘기면 브라우저가 TypeError를 던진다.
export function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export default { urlBase64ToUint8Array }
