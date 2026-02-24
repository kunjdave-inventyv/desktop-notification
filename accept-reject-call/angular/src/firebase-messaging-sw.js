importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBqnhmOiZ9Vfcgdq_prcv73adyilCzsq9o",
  authDomain: "desktop-notification-46234.firebaseapp.com",
  projectId: "desktop-notification-46234",
  storageBucket: "desktop-notification-46234.firebasestorage.app",
  messagingSenderId: "1079627922549",
  appId: "1:1079627922549:web:e35cb3675231f6efc58c3c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const from = payload.data?.caller || 'Someone';
  const to   = payload.data?.callee || '';

  self.registration.showNotification(`📞 Incoming call from ${from}`, {
    body: 'Tap to answer',
    tag: 'incoming-call',
    requireInteraction: true,
    data: { from, to },
    actions: [
      { action: 'accept', title: '✅ Accept' },
      { action: 'reject', title: '❌ Decline' },
    ],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { from, to } = event.notification.data || {};

  if (event.action === 'reject') {
    event.waitUntil(
      fetch('http://localhost:3001/reject-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: to, to: from }),
      }).catch(console.error)
    );
    return;
  }

  const url = new URL('/', self.location.origin);
  if (to)   url.searchParams.set('userId', to);
  if (from) url.searchParams.set('peerId', from);
  if (event.action === 'accept') url.searchParams.set('action', 'accept');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin)) {
          if (event.action === 'accept') {
            client.postMessage({ type: 'CALL_ACCEPT_FROM_NOTIFICATION', from });
          }
          return client.focus();
        }
      }
      return clients.openWindow(url.toString());
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));