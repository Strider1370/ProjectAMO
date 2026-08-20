// ponytail: no-op fetch handler — only exists to satisfy Chrome's PWA install criteria
self.addEventListener('fetch', () => {});

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
    for (const client of clientList) {
      if ('focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
