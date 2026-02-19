import { Injectable } from '@angular/core';

const SW_PATH = '/sw.js';

@Injectable({ providedIn: 'root' })
export class PushSubscriptionService {

  async registerPushSubscription(
    userId: string,
    sendWsMessage: (msg: any) => void
  ): Promise<PushSubscription | undefined> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push not supported in this browser');
      return;
    }

    // 1. Register service worker
    const reg = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    // 2. Fetch VAPID public key from backend
    const res = await fetch('http://localhost:3001/vapid-public-key');
    const { key } = await res.json();

    // 3. Request push permission + subscribe
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(key) as any,
    });

    // 4. Send subscription to backend over WebSocket
    const sub = subscription.toJSON();
    sendWsMessage({
      type: 'StorePushSub',
      payload: {
        user_id: userId,
        subscription: {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys!['p256dh'],
            auth: sub.keys!['auth'],
          },
        },
      },
    });

    console.log('[push] subscribed and stored');
    return subscription;
  }

  onSwMessage(callback: (data: any) => void): void {
    navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
      callback(event.data);
    });
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
}
