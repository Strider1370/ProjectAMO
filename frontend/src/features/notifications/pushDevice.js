// 이 기기의 푸시 등록을 끊는다. 로그아웃 뒤에도 그 계정의 알림이 이 휴대폰으로 계속 오면 안 된다
// (다른 사람이 같은 기기를 쓸 수도 있다). 다시 로그인하면 알림 → 감시 대상에서 다시 켠다.
export const PUSH_WANTED_KEY = 'projectamo:push-wanted'

export async function forgetThisDevicePush({ fetchImpl = fetch } = {}) {
  try { localStorage.removeItem(PUSH_WANTED_KEY) } catch { /* 저장 불가 브라우저 */ }
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) return
    await fetchImpl('/api/me/push/subscribe', {
      method: 'DELETE', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
  } catch { /* 로그아웃은 막지 않는다 */ }
}

// 아이폰·아이패드는 홈 화면에 추가한 앱에서만 웹 푸시를 받을 수 있다(사파리 탭에서는 PushManager가 없다).
export function needsIosHomeScreen(nav = typeof navigator === 'undefined' ? null : navigator, win = typeof window === 'undefined' ? null : window) {
  if (!nav || !win) return false
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
  return ios && !standalone
}
