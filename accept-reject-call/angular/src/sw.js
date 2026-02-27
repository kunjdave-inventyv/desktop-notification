// Signal PWA Service Worker
// Handles push notifications and notification click actions

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { action: 'incoming_call', from: 'Unknown', to: '' };
  }

  // payload shape from Rust: { action: "incoming_call", from: "alice", to: "bob" }
  const callerName = payload.from || 'Someone';
  const calleeName = payload.to || '';

  const title = `📞 Incoming call from ${callerName}`;
  const options = {
    body: `${callerName} is calling you. Tap to open or use the buttons below.`,
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-72.png',
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    // Pass caller/callee info so we can deep-link on click
    data: {
      from: callerName,
      to: calleeName,
      // Who is the callee (= current user) and who is calling
      userId: calleeName,
      peerId: callerName,
    },
    actions: [
      { action: 'accept', title: '✅ Accept' },
      { action: 'reject', title: '❌ Decline' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action; // 'accept' | 'reject' | '' (body tap)

  // If user clicked Decline from notification, POST reject to backend
  if (action === 'reject') {
    event.waitUntil(
      fetch('http://localhost:3001/reject-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: data.userId, to: data.peerId }),
      }).catch(e => console.error('[SW] reject fetch failed', e))
    );
    return;
  }

  // For accept or body tap — open/focus the app with deep-link params
  const url = new URL('/', self.location.origin);
  if (data.userId) url.searchParams.set('userId', data.userId);
  if (data.peerId) url.searchParams.set('peerId', data.peerId);
  if (action === 'accept') {
    url.searchParams.set('action', 'accept');
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app tab is already open, message it directly
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          if (action === 'accept') {
            client.postMessage({
              type: 'CALL_ACCEPT_FROM_NOTIFICATION',
              from: data.peerId,
            });
          }
          return client.focus();
        }
      }
      // Otherwise open a new tab with the deep-link
      return clients.openWindow(url.toString());
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
