import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from './chat.service';

@Injectable({
  providedIn: 'root'
})
export class PushService {
  private readonly VAPID_PUBLIC_KEY = 'BMx3sbtsKkeQX4Ms2xzwXLm9ECuLygjWumV-FLqDEt9TIO-vf4Z6HD_iYFb_E83wAeCYOeMCVN3-_NLG5U9xA4c';

  constructor(private http: HttpClient, private chatService: ChatService) {}

  async requestPermission() {
    console.log('PushService v1.2: checking permission...');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();
        if (!existingSubscription) {
          await this.subscribeToPush(registration);
        } else {
          console.log('User already subscribed to push');
          // Update backend just in case
          this.updateBackendSubscription(existingSubscription);
        }
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  }

  private async subscribeToPush(registration: ServiceWorkerRegistration) {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
    });

    this.updateBackendSubscription(subscription);
  }

  private updateBackendSubscription(subscription: PushSubscription) {
    const userId = this.chatService.currentUser();
    if (!userId) return;

    this.http.post('http://localhost:3000/subscribe', {
      userId,
      subscription
    }).subscribe({
      next: () => console.log('Push subscription successful'),
      error: (err) => console.error('Push subscription failed', err)
    });
  }

  private urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
