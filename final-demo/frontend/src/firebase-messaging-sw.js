importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBn6oyGwcMmkxfAN5oDQYUkazm-7TKiHO0',
  authDomain:        'notification-25684.firebaseapp.com',
  projectId:         'notification-25684',
  storageBucket:     'notification-25684.firebasestorage.app',
  messagingSenderId: '572073347602',
  appId:             '1:572073347602:web:a23cfb9769182f1759a6cb',
});

const messaging = firebase.messaging();

// ── Background push → show notification ──────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  const data   = payload.data || {};
  const action = data.action  || '';

  // ── Chat message notification ──────────────────────────────────────────────
  if (action === 'chat_message') {
    const from      = data.sender     || 'Someone';   // FCM reserves "from" — backend sends "sender"
    const to        = data.to         || '';
    const content   = data.content    || '';
    const groupId   = data.group_id   || '';
    const groupName = data.group_name || '';
    const isGroup   = !!groupId;

    // DM notifications are grouped per sender; group chat per group —
    // so they collapse/stack cleanly instead of spamming the tray.
    const tag   = isGroup ? `chat-group-${groupId}` : `chat-dm-${from}`;
    const title = isGroup ? `${from} in ${groupName}` : `💬 ${from}`;

    self.registration.showNotification(title, {
      body: content,
      tag,
      // renotify: true means each new message still makes a sound/vibration
      // even though it reuses the same tag (replacing the previous bubble).
      renotify: true,
      data: { from, to, content, groupId, groupName, isGroup, tag, notifType: 'chat' },
      actions: [
        // type:'text' renders an inline reply box on Chrome desktop (Linux/Win/macOS)
        // and Edge. On platforms that don't support text actions it falls back to
        // a plain button that opens the app.
        {
          action:      'reply',
          title:       '↩ Reply',
          type:        'text',
          placeholder: 'Type a reply…',
        },
      ],
    });
    return;
  }

  // ── Incoming call notification (direct or group) ───────────────────────────
  const from     = data.caller   || 'Someone';
  const to       = data.callee   || '';
  const callType = data.callType || 'direct';
  const groupId  = data.groupId  || '';

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
    data: { from, to, callType, groupId, tag, notifType: 'call' },
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

  // App tells SW to dismiss a chat notification once the conversation is opened.
  if (type === 'DISMISS_CHAT_NOTIFICATION') {
    const tag = groupId ? `chat-group-${groupId}` : `chat-dm-${from}`;
    self.registration.getNotifications({ tag })
      .then(ns => ns.forEach(n => n.close()));
  }
});

// ── Notification click / action ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const notifType = notifData.notifType || 'call';

  // ── Chat: inline reply action ──────────────────────────────────────────────
  if (notifType === 'chat' && event.action === 'reply') {
    // event.reply holds the text typed in the inline input box.
    // Defined on Chrome desktop; undefined on unsupported platforms.
    const replyText = (event.reply || '').trim();

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const appTab = list.find(c => c.url.startsWith(self.location.origin));

        if (replyText) {
          if (appTab) {
            // Hand the reply to the open tab — it will use the live WS connection.
            appTab.postMessage({
              type:    'CHAT_REPLY_FROM_NOTIFICATION',
              from:    notifData.to,      // local user (the one replying)
              to:      notifData.from,    // original sender (recipient of reply)
              groupId: notifData.groupId,
              content: replyText,
            });
            // Intentionally do NOT focus — user is replying without opening the app.
          } else {
            // No open tab: open the app with params so it logs in and sends.
            const url = new URL('/', self.location.origin);
            url.searchParams.set('replyTo',  notifData.from);
            url.searchParams.set('replyMsg', replyText);
            if (notifData.groupId) url.searchParams.set('groupId', notifData.groupId);
            return clients.openWindow(url.toString());
          }
        } else {
          // Empty reply or platform fell back to plain button → open the app.
          return appTab ? appTab.focus() : clients.openWindow(new URL('/', self.location.origin).toString());
        }
      })
    );
    return;
  }

  // ── Chat: tapped on notification body (no action) ─────────────────────────
  if (notifType === 'chat') {
    event.waitUntil(openOrFocusApp(notifData));
    return;
  }

  // ── Call notifications ─────────────────────────────────────────────────────
  const { from, to, callType, groupId } = notifData;
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

// ── Helper: focus open tab or open a new one, then tell the app which chat to open ──
function openOrFocusApp(notifData) {
  const { from, to, groupId } = notifData;
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin)) {
        client.postMessage({ type: 'OPEN_CHAT_FROM_NOTIFICATION', from, to, groupId });
        return client.focus();
      }
    }
    const url = new URL('/', self.location.origin);
    if (from)    url.searchParams.set('openChatFrom', from);
    if (groupId) url.searchParams.set('groupId', groupId);
    return clients.openWindow(url.toString());
  });
}

self.addEventListener('install',  ()  => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));