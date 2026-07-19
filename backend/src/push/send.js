import webpush from 'web-push'

import config from '../config.js'

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
  await webpush.sendNotification(subscription, JSON.stringify(payload))
}

export default { vapidPublicKey, sendPush }
