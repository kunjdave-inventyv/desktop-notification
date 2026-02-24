import { Injectable } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBn6oyGwcMmkxfAN5oDQYUkazm-7TKiHO0",
  authDomain: "notification-25684.firebaseapp.com",
  projectId: "notification-25684",
  messagingSenderId: "572073347602",
  appId: "1:572073347602:web:a23cfb9769182f1759a6cb",
};

const FIREBASE_VAPID_KEY = "BO9faYhBz9d_XZljy1qc_qE4pX09zy0SNUtAMynYYAApEIZrQxwSjVOIgSQYY3m7fVQyTCq5yl7bucLdWV55Fqc";


// Init Firebase once
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const messaging = getMessaging(app);

@Injectable({ providedIn: 'root' })
export class PushSubscriptionService {

  constructor(private wsService: WebSocketService) {}

  async setupAndSend(userId: string): Promise<boolean> {
    console.log('[push] setupAndSend for', userId);

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[push] not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[push] permission denied');
        return false;
      }

      // Register Firebase SW — must be at /firebase-messaging-sw.js
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;
      console.log('[push] Firebase SW ready, scope:', swReg.scope);

      // Get FCM token — works on Chrome AND Edge (no WNS)
      const fcmToken = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!fcmToken) {
        console.warn('[push] no FCM token returned');
        return false;
      }

      console.log('[push] FCM token obtained:', fcmToken.slice(0, 30) + '...');
      this.wsService.send('StoreFcmToken', { user_id: userId, token: fcmToken });
      console.log('[push] StoreFcmToken sent to backend');
      return true;

    } catch (err) {
      console.error('[push] failed:', err);
      return false;
    }
  }

  onSwMessage(callback: (data: any) => void): void {
    navigator.serviceWorker?.addEventListener('message', (e: any) => callback(e.data));
  }
}