// ponytail: no-op fetch handler — only exists to satisfy Chrome's PWA install criteria
self.addEventListener('fetch', () => {});

// 새 워커가 즉시 일하게 한다. 이게 없으면 새로 설치된 워커는 열려 있던 탭이 **전부** 닫힐
// 때까지 대기만 한다 — 알림 문구는 새 코드로 나오는데 클릭 동작만 옛 코드인, 원인을 짚기
// 어려운 상태가 생긴다. 실제로 이 단계 관문에서 그렇게 걸렸다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ProjectAMO';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/gisang-i/clear_3_avatar.png',
      badge: '/gisang-i/clear_3_avatar.png',
      // 발송 종류별 상세 링크(/?alert=…, /?alertTest=…)를 클릭 핸들러에 전달한다.
      data: { url: data.url || '/' },
    })
  );
});

// 마지막으로 누른 알림 주소. 앱이 앞으로 나온 뒤 직접 물어 가져간다(take-pending). 주소 이동(navigate)이나
// openWindow가 이미 떠 있던 안드로이드 앱에 주소를 전하지 못하는 경우가 있어서다.
let pendingUrl = null;

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 발송 payload의 상세 URL로 간다. 없으면 첫 화면. 상대 주소는 기기마다 해석이 달라 절대 주소로 바꾼다.
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  pendingUrl = { url: target, at: Date.now() };
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clientList.find((item) => 'focus' in item);
    if (!client) return self.clients.openWindow(target);
    // 창을 앞으로 부르는 것은 알림을 누른 직후에만 허용되므로 가장 먼저 한다.
    try { await client.focus(); } catch (err) { return self.clients.openWindow(target); }
    // 열려 있는 앱이 페이지를 다시 불러오지 않고 그 알림을 띄운다(index.html의 open-url 처리).
    client.postMessage({ type: 'open-url', url: target });
    return undefined;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'take-pending' || !pendingUrl) return;
  if (Date.now() - pendingUrl.at < 60000) event.source?.postMessage({ type: 'open-url', url: pendingUrl.url });
  pendingUrl = null;
});
