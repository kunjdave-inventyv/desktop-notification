const SW_PATH = '/sw.js'

export async function registerPushSubscription(userId, sendWsMessage) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push not supported in this browser')
    return
  }

  // 1. Register service worker
  const reg = await navigator.serviceWorker.register(SW_PATH)
  await navigator.serviceWorker.ready

  // 2. Fetch VAPID public key from backend
  const res = await fetch('http://localhost:3001/vapid-public-key')
  const { key } = await res.json()

  // 3. Request push permission + subscribe
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('Push notification permission denied')
    return
  }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })

  // 4. Send subscription to backend over WebSocket
  const sub = subscription.toJSON()
  sendWsMessage({
    type: 'StorePushSub',
    payload: {
      user_id: userId,
      subscription: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      },
    },
  })

  console.log('[push] subscribed and stored')
  return subscription
}

// Listen for messages posted by service worker (accept from notification)
export function onSwMessage(callback) {
  navigator.serviceWorker?.addEventListener('message', (event) => {
    callback(event.data)
  })
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}