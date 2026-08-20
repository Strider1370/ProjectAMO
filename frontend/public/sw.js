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
      // 탭했을 때 갈 곳(=/?flight=<id>). notificationclick이 이걸 읽는다.
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 발송 payload의 url(=/?flight=<id>)로 간다. 없으면 첫 화면.
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 이미 열린 창이 있으면 그 창을 쓴다 — 알림마다 새 창이 쌓이면 쓰기 어렵다.
    // navigate()는 이 워커가 제어하지 않는 창에서는 예외를 던진다(첫 등록 직후가 그렇다).
    // 그때 조용히 실패하면 아무 데도 못 가므로, 새 창으로 떨어뜨린다.
    for (const client of clientList) {
      if ('focus' in client) {
        try {
          await client.navigate(target);
          return client.focus();
        } catch (err) {
          break;
        }
      }
    }
    return self.clients.openWindow(target);
  })());
});
