// src/app/services/push-subscription.service.ts

import { Injectable } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBn6oyGwcMmkxfAN5oDQYUkazm-7TKiHO0',
  authDomain:        'notification-25684.firebaseapp.com',
  projectId:         'notification-25684',
  messagingSenderId: '572073347602',
  appId:             '1:572073347602:web:a23cfb9769182f1759a6cb',
};

const FIREBASE_VAPID_KEY =
  'BO9faYhBz9d_XZljy1qc_qE4pX09zy0SNUtAMynYYAApEIZrQxwSjVOIgSQYY3m7fVQyTCq5yl7bucLdWV55Fqc';

const fbApp     = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const messaging = getMessaging(fbApp);

@Injectable({ providedIn: 'root' })
export class PushSubscriptionService {

  constructor(private wsService: WebSocketService) {}

  // ── Setup ──────────────────────────────────────────────────────────────────

  async setupAndSend(userId: string): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[push] not supported');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { console.warn('[push] permission denied'); return false; }

      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;

      const fcmToken = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });
      if (!fcmToken) return false;

      this.wsService.send('store_fcm_token', { user_id: userId, token: fcmToken });
      console.log('[push] FCM token sent to backend');
      return true;
    } catch (err) {
      console.error('[push] failed:', err);
      return false;
    }
  }

  // ── SW → App message listener ──────────────────────────────────────────────

  /**
   * Subscribe to all messages posted by the service worker.
   * AppStateService calls this once and handles each type in its switch block:
   *   CALL_ACCEPT_FROM_NOTIFICATION
   *   CALL_REJECT_FROM_NOTIFICATION
   *   CALL_GROUP_ACCEPT_FROM_NOTIFICATION
   *   CALL_GROUP_REJECT_FROM_NOTIFICATION
   *   CHAT_REPLY_FROM_NOTIFICATION   ← new
   *   OPEN_CHAT_FROM_NOTIFICATION    ← new
   */
  onSwMessage(callback: (data: any) => void): void {
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      callback(e.data);
    });
  }

  // ── Dismiss helpers (App → SW) ─────────────────────────────────────────────

  /** Dismiss a direct call notification when the call ends / is answered. */
  dismissCallNotification(from: string): void {
    navigator.serviceWorker?.ready.then(reg => {
      reg.active?.postMessage({ type: 'DISMISS_CALL_NOTIFICATION', from });
    });
  }

  /** Dismiss a group call notification. */
  dismissGroupNotification(from: string, groupId: string): void {
    navigator.serviceWorker?.ready.then(reg => {
      reg.active?.postMessage({ type: 'DISMISS_GROUP_NOTIFICATION', from, groupId });
    });
  }

  /**
   * Dismiss a chat notification once the user opens that conversation.
   * Call this from ChatComponent.selectConversation().
   *
   * @param from    peer user_id  (for DMs)
   * @param groupId group_id      (for group chats — pass null for DMs)
   */
  dismissChatNotification(from: string | null, groupId: string | null): void {
    navigator.serviceWorker?.ready.then(reg => {
      reg.active?.postMessage({
        type: 'DISMISS_CHAT_NOTIFICATION',
        from:    from    ?? '',
        groupId: groupId ?? '',
      });
    });
  }
}