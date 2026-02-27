// sw.js v1.3
self.addEventListener('push', (event) => {
  let data = { title: 'New Message', body: 'You have a new message' };
  try {
    data = event.data.json();
  } catch (e) {
    console.warn('Push event with no JSON data');
  }

  const isCall = data.type === 'CALL' || (data.data && data.data.type === 'CALL');
  const msgId = data.id || (data.data ? data.data.id : null);
  
  const options = {
    body: data.body || 'You have a new message',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: msgId || 'default-chat-tag', // Unifies with SocketService
    renotify: !!msgId, // Only re-alert if it's a new message
    data: data.data || data || { from: 'Unknown', to: 'User' },
    actions: isCall ? [
      { action: 'accept-call', title: '✅ Accept', type: 'button' },
      { action: 'reject-call', title: '❌ Reject', type: 'button' }
    ] : [
      {
        action: 'reply',
        type: 'text',
        title: 'Reply',
        placeholder: 'Type your message...',
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || (isCall ? 'Incoming Call' : 'Chat App'), options)
  );

  // Sync state across all open tabs
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          payload: data
        });
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log("action count:" ,event.notification.maxActions);
  if (event.action === 'reply' && event.reply) {
    const replyText = event.reply;
    const notificationData = event.notification.data || {};
    const msgId = `swr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Send reply to backend. This will trigger a socket 'sync-message' to all sender tabs.
    event.waitUntil(
      fetch('http://localhost:3000/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msgId,
          to: notificationData.from || 'UserA', 
          from: notificationData.to || 'UserB',
          text: replyText
        })
      })
    );
    
    event.notification.close();
  } else if (event.action === 'accept-call' || event.action === 'reject-call') {
    const accepted = event.action === 'accept-call';
    const notificationData = event.notification.data || {};
    
    event.waitUntil(
      fetch('http://localhost:3000/call-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: notificationData.from || 'UserA', 
          from: notificationData.to || 'UserB',
          accepted
        })
      })
    );
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          if (accepted && client.focus) client.focus();
          client.postMessage({
            type: 'CALL_RESPONSE',
            payload: { from: notificationData.from, accepted }
          });
        });
      })
    );
    event.notification.close();
  } else {
    event.notification.close();
    event.waitUntil(
      self.clients.openWindow(event.notification.data)
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLIENT_BROADCAST') {
    const payload = event.data.payload;
    const sourceId = event.source ? event.source.id : null;

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          // Send to all clients except the sender
          if (client.id !== sourceId) {
            client.postMessage({
              type: 'SYNC_ACTION',
              payload: payload
            });
          }
        });
      })
    );
  }
});
