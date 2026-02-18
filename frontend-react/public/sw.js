const APP_URL = 'http://localhost:5173'

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    return
  }

  if (data.action !== 'incoming_call') return

  const { from, to } = data

  event.waitUntil(
    self.registration.showNotification('📞 Incoming Call', {
      body: `${from} is calling you`,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: `call-${from}`,          // prevents duplicate notifications
      renotify: true,
      requireInteraction: true,     // stays on screen until user acts
      data: { from, to },
      actions: [
        { action: 'accept', title: '✅ Accept' },
        { action: 'reject', title: '❌ Reject' },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const { from, to } = event.notification.data

  if (event.action === 'reject') {
    // POST reject to backend REST endpoint so backend can notify caller
    event.waitUntil(
      fetch(`http://localhost:3001/reject-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: to, to: from }),
      }).catch(() => {})
    )
    return
  }

  // Accept — open/focus the app with query params so it auto-accepts
  const url = `${APP_URL}?userId=${to}&peerId=${from}&action=accept`

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          client.focus()
          client.postMessage({ type: 'CALL_ACCEPT_FROM_NOTIFICATION', from, to })
          return
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})