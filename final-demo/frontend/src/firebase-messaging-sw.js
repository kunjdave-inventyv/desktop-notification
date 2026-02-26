importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBqnhmOiZ9Vfcgdq_prcv73adyilCzsq9o",
  authDomain:        "desktop-notification-46234.firebaseapp.com",
  projectId:         "desktop-notification-46234",
  storageBucket:     "desktop-notification-46234.firebasestorage.app",
  messagingSenderId: "1079627922549",
  appId:             "1:1079627922549:web:e35cb3675231f6efc58c3c"
});

const messaging = firebase.messaging();

// ── Background push → show notification ──────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  const from     = payload.data?.caller   || 'Someone';
  const to       = payload.data?.callee   || '';
  const callType = payload.data?.callType || 'direct';
  const groupId  = payload.data?.groupId  || '';

  const title = callType === 'group'
    ? `📞 Group call from ${from}`
    : `📞 Incoming call from ${from}`;

  const tag = callType === 'group'
    ? `incoming-call-group-${groupId}-${from}`
    : `incoming-call-${from}`;

  self.registration.showNotification(title, {
    body: 'Tap to answer',
    tag,
    requireInteraction: true,
    data: { from, to, callType, groupId, tag },
    actions: [
      { action: 'accept', title: '✅ Accept' },
      { action: 'reject', title: '❌ Decline' },
    ],
  });
});

// ── Messages from app tabs ────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, from, groupId } = event.data || {};

  if (type === 'DISMISS_CALL_NOTIFICATION') {
    self.registration.getNotifications({ tag: `incoming-call-${from}` })
      .then(ns => ns.forEach(n => n.close()));
  }

  if (type === 'DISMISS_GROUP_NOTIFICATION') {
    self.registration.getNotifications({ tag: `incoming-call-group-${groupId}-${from}` })
      .then(ns => ns.forEach(n => n.close()));
    self.registration.getNotifications()
      .then(ns => ns.forEach(n => { if (n.data?.groupId === groupId) n.close(); }));
  }
});

// ── Notification action click ─────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { from, to, callType, groupId } = event.notification.data || {};
  const isGroup = callType === 'group';

  if (event.action === 'reject') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        let notified = false;
        for (const client of list) {
          if (client.url.startsWith(self.location.origin)) {
            client.postMessage({
              type: isGroup
                ? 'CALL_GROUP_REJECT_FROM_NOTIFICATION'
                : 'CALL_REJECT_FROM_NOTIFICATION',
              from, to, groupId,
            });
            notified = true;
          }
        }
        if (!notified) {
          const url = new URL('/', self.location.origin);
          if (to)      url.searchParams.set('userId', to);
          if (from)    url.searchParams.set('peerId', from);
          if (groupId) url.searchParams.set('groupId', groupId);
          url.searchParams.set('action', 'reject');
          url.searchParams.set('callType', callType || 'direct');
          return clients.openWindow(url.toString());
        }
      })
    );
    return;
  }

  const url = new URL('/', self.location.origin);
  if (to)      url.searchParams.set('userId', to);
  if (from)    url.searchParams.set('peerId', from);
  if (groupId) url.searchParams.set('groupId', groupId);
  if (event.action === 'accept') url.searchParams.set('action', 'accept');
  url.searchParams.set('callType', callType || 'direct');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin)) {
          if (event.action === 'accept') {
            client.postMessage({
              type: isGroup
                ? 'CALL_GROUP_ACCEPT_FROM_NOTIFICATION'
                : 'CALL_ACCEPT_FROM_NOTIFICATION',
              from, to, groupId,
            });
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