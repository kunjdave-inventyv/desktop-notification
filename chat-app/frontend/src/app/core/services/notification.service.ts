import { Injectable } from '@angular/core';
import { ChatService } from './chat.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor(private chatService: ChatService) {}

  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notification');
      return;
    }
    await Notification.requestPermission();
  }

  async showNotification(title: string, options: NotificationOptions = {}): Promise<void> {
    if (Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      const defaultOptions: any = {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        actions: [
            { action: 'reply', title: 'Reply', type: 'text', placeholder: 'Type your message...' }
        ],
        ...options
      };
      await reg.showNotification(title, defaultOptions);
    }
  }

  async showCallNotification(from: string, onAccept: () => void, onReject: () => void) {
    const title = `Incoming call from ${from}`;
    const options: any = {
      body: 'Tap to answer or decline',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'incoming-call',
      requireInteraction: true,
      data: { type: 'CALL', from, to: this.chatService.currentUser() },
      actions: [
        { action: 'accept-call', title: '✅ Accept' },
        { action: 'reject-call', title: '❌ Reject' }
      ]
    };

    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);

      // Auto-dismiss after 10 seconds
      setTimeout(async () => {
        const notifications = await reg.getNotifications({ tag: 'incoming-call' });
        notifications.forEach(n => n.close());
      }, 10000);
    }
  }
}
