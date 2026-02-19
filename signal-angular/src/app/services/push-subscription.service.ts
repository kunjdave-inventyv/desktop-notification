import { Injectable } from '@angular/core';
import { WebSocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class PushSubscriptionService {

  constructor(private wsService: WebSocketService) {}

  async setupAndSend(userId: string): Promise<boolean> {
    console.log('[push] setupAndSend called for', userId);

    if (!('serviceWorker' in navigator)) {
      console.warn('[push] serviceWorker not in navigator');
      return false;
    }
    if (!('PushManager' in window)) {
      console.warn('[push] PushManager not in window');
      return false;
    }

    try {
      console.log('[push] registering SW...');
      const reg: any = await (navigator.serviceWorker as any).register('/sw.js');
      console.log('[push] SW registered, scope:', reg.scope);

      await (navigator.serviceWorker as any).ready;
      console.log('[push] SW ready');

      console.log('[push] fetching VAPID key...');
      const res = await fetch('http://localhost:3001/vapid-public-key');
      const { key } = await res.json();
      console.log('[push] VAPID key:', key?.slice(0, 20) + '...');

      console.log('[push] requesting notification permission...');
      const permission = await (Notification as any).requestPermission();
      console.log('[push] permission:', permission);
      if (permission !== 'granted') {
        console.warn('[push] permission denied');
        return false;
      }

      console.log('[push] subscribing to pushManager...');
      const sub: any = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(key),
      });
      console.log('[push] got subscription, endpoint:', sub.endpoint?.slice(0, 40) + '...');

      const subJson = sub.toJSON();
      const payload = {
        user_id: userId,
        subscription: {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys['p256dh'],
            auth:   subJson.keys['auth'],
          },
        },
      };

      console.log('[push] sending StorePushSub over WS, wsOpen=', this.wsService.isOpen);
      this.wsService.send('StorePushSub', payload);
      console.log('[push] StorePushSub sent!');
      return true;

    } catch (err) {
      console.error('[push] FAILED at some step:', err);
      return false;
    }
  }

  onSwMessage(callback: (data: any) => void): void {
    (navigator.serviceWorker as any)?.addEventListener('message', (e: any) => callback(e.data));
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }
}