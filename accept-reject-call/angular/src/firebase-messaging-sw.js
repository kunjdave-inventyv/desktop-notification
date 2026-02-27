// importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
// importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// firebase.initializeApp({
//   apiKey: "AIzaSyBqnhmOiZ9Vfcgdq_prcv73adyilCzsq9o",
//   authDomain: "desktop-notification-46234.firebaseapp.com",
//   projectId: "desktop-notification-46234",
//   storageBucket: "desktop-notification-46234.firebasestorage.app",
//   messagingSenderId: "1079627922549",
//   appId: "1:1079627922549:web:e35cb3675231f6efc58c3c"
// });

// const messaging = firebase.messaging();

// messaging.onBackgroundMessage((payload) => {
//   const from = payload.data?.caller || 'Someone';
//   const to   = payload.data?.callee || '';

//   self.registration.showNotification(`📞 Incoming call from ${from}`, {
//     body: 'Tap to answer',
//     tag: 'incoming-call',
//     requireInteraction: true,
//     data: { from, to },
//     actions: [
//       { action: 'accept', title: '✅ Accept' },
//       { action: 'reject', title: '❌ Decline' },
//     ],
//   });
// });

// self.addEventListener('notificationclick', (event) => {
//   event.notification.close();
//   const { from, to } = event.notification.data || {};

//   if (event.action === 'reject') {
//     event.waitUntil(
//       fetch('http://localhost:3001/reject-call', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ from: to, to: from }),
//       }).catch(console.error)
//     );
//     return;
//   }

//   const url = new URL('/', self.location.origin);
//   if (to)   url.searchParams.set('userId', to);
//   if (from) url.searchParams.set('peerId', from);
//   if (event.action === 'accept') url.searchParams.set('action', 'accept');

//   event.waitUntil(
//     clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
//       for (const client of list) {
//         if (client.url.startsWith(self.location.origin)) {
//           if (event.action === 'accept') {
//             client.postMessage({ type: 'CALL_ACCEPT_FROM_NOTIFICATION', from });
//           }
//           return client.focus();
//         }
//       }
//       return clients.openWindow(url.toString());
//     })
//   );
// });

// self.addEventListener('install', () => self.skipWaiting());
// self.addEventListener('activate', e => e.waitUntil(clients.claim()));
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

// ── Background push → show notification ──────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  const from = payload.data?.caller || 'Someone';
  const to   = payload.data?.callee || '';

  self.registration.showNotification(`📞 Incoming call from ${from}`, {
    body: 'Tap to answer',
    // tag ensures only ONE notification per caller — if the same caller somehow
    // triggers two pushes, the second replaces the first (no duplicates).
    tag: `incoming-call-${from}`,
    requireInteraction: true,
    data: { from, to },
    actions: [
      { action: 'accept', title: '✅ Accept' },
      { action: 'reject', title: '❌ Decline' },
    ],
  });
});

// ── Message from app tab → dismiss notification ───────────────────────────────
// Edge case #3: Caller cancelled while ringing.
// Edge case #5: Another tab already accepted/rejected.
// The app posts { type: 'DISMISS_CALL_NOTIFICATION', from } to the SW,
// and we close every matching notification.
self.addEventListener('message', (event) => {
  const { type, from } = event.data || {};

  if (type === 'DISMISS_CALL_NOTIFICATION') {
    // Close any open notification for this caller.
    self.registration.getNotifications({ tag: `incoming-call-${from}` })
      .then(notifications => {
        notifications.forEach(n => n.close());
      });
  }
});

// ── Notification action click ─────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { from, to } = event.notification.data || {};

  if (event.action === 'reject') {
    // Post a message to all open app tabs so the WS layer can send Reject.
    // We no longer call the HTTP endpoint — the app handles it via WebSocket.
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        let notified = false;
        for (const client of list) {
          if (client.url.startsWith(self.location.origin)) {
            client.postMessage({ type: 'CALL_REJECT_FROM_NOTIFICATION', from, to });
            notified = true;
          }
        }

        if (!notified) {
          // No open tab — open one so it can connect and reject properly.
          const url = new URL('/', self.location.origin);
          if (to)   url.searchParams.set('userId', to);
          if (from) url.searchParams.set('peerId', from);
          url.searchParams.set('action', 'reject');
          return clients.openWindow(url.toString());
        }
      })
    );
    return;
  }

  // Accept (or plain tap with no action)
  const url = new URL('/', self.location.origin);
  if (to)   url.searchParams.set('userId', to);
  if (from) url.searchParams.set('peerId', from);
  if (event.action === 'accept') url.searchParams.set('action', 'accept');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin)) {
          if (event.action === 'accept') {
            client.postMessage({ type: 'CALL_ACCEPT_FROM_NOTIFICATION', from, to });
          }
          return client.focus();
        }
      }
      return clients.openWindow(url.toString());
    })
  );
});

self.addEventListener('install',  ()  => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));