self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : { title: 'Notification', body: 'You have a new notification' };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', {
      body: data.body || '',
      icon: '/icon.png',
      actions: [
        { action: 'accept', title: '✅ Accept' },
        { action: 'reject', title: '❌ Reject' }
      ],
      data: data
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action;
  const notifData = event.notification.data;

  event.waitUntil(
    fetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action || 'click', data: notifData })
    }).then(() => {
      console.log('Action sent:', action);
    })
  );
});