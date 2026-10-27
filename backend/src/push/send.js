import webpush from 'web-push'

import config from '../config.js'

const PUSH_TTL_SECONDS = 6 * 60 * 60

let configured = false
function ensureConfigured() {
  if (configured) return
  if (!config.push.vapid_public_key || !config.push.vapid_private_key) return
  webpush.setVapidDetails(config.push.vapid_subject, config.push.vapid_public_key, config.push.vapid_private_key)
  configured = true
}

export function vapidPublicKey() {
  return config.push.vapid_public_key
}

// subscription: { endpoint, keys: { p256dh, auth } }. payload는 JSON-직렬화되어 sw.js push 리스너로 전달.
// 만료/무효 구독(404/410)은 呼출측이 push_subscriptions에서 정리할 수 있도록 그대로 던진다.
export async function sendPush(subscription, payload) {
  ensureConfigured()
  if (!configured) throw Object.assign(new Error('vapid_not_configured'), { statusCode: 503 })
  // 기본 긴급도(normal)는 안드로이드가 화면이 꺼진 절전 상태에서 수십 분~수 시간 미룬다. 기상 알림은 바로 깨워 전달한다.
  // 기기가 꺼져 있으면 푸시 서비스가 6시간까지 보관했다가 전달하고, 그보다 오래된 알림은 버린다(4주 기본값은 너무 길다).
  await webpush.sendNotification(subscription, JSON.stringify(payload), { urgency: 'high', TTL: PUSH_TTL_SECONDS })
}

export default { vapidPublicKey, sendPush }
