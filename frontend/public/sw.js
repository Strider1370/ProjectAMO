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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 발송 payload의 상세 URL로 간다. 없으면 첫 화면. 상대 주소는 기기마다 해석이 달라 절대 주소로 바꾼다.
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clientList.find((item) => 'focus' in item);
    if (client) {
      // 창을 앞으로 부르는 것은 알림을 누른 직후에만 허용된다. 주소 이동을 먼저 기다리면 그 시간이
      // 지나 focus가 거절되고 아무 일도 일어나지 않는다(앱이 백그라운드에 살아 있을 때 그랬다).
      try {
        await client.focus();
      } catch (err) {
        return self.clients.openWindow(target);
      }
      // navigate()는 이 워커가 제어하지 않는 창에서는 예외를 던진다. 그때는 열린 앱에 주소를 넘겨 앱이 직접 연다.
      try {
        await client.navigate(target);
      } catch (err) {
        client.postMessage({ type: 'open-url', url: target });
      }
      return undefined;
    }
    return self.clients.openWindow(target);
  })());
});
