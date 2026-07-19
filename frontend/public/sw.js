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
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
