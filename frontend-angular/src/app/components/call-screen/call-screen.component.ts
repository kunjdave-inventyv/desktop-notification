import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { PushSubscriptionService } from '../../services/push-subscription.service';
import { IncomingCallModalComponent } from '../incoming-call-modal/incoming-call-modal.component';
import { OutgoingCallModalComponent } from '../outgoing-call-modal/outgoing-call-modal.component';

@Component({
  selector: 'app-call-screen',
  standalone: true,
  imports: [CommonModule, IncomingCallModalComponent, OutgoingCallModalComponent],
  templateUrl: './call-screen.component.html',
})
export class CallScreenComponent implements OnInit, OnDestroy {
  @Input() userId: string = '';
  @Input() peerId: string = '';
  @Input() autoAction: string | null = null;
  @Output() disconnectEvent = new EventEmitter<void>();

  peerOnline = false;
  callState: 'idle' | 'calling' | 'incoming' | 'accepted' | 'rejected' = 'idle';
  incomingFrom: string | null = null;
  statusMessage = '';
  pushReady = false;

  private registered = false;
  private flashTimeoutId: any = null;
  private messageSub!: Subscription;

  constructor(
    private wsService: WebSocketService,
    private pushService: PushSubscriptionService,
    private ngZone: NgZone
  ) {}

  get wsConnected(): boolean {
    return this.wsService.isConnected;
  }

  get userInitial(): string {
    return this.userId?.[0]?.toUpperCase() ?? '';
  }

  get peerInitial(): string {
    return this.peerId?.[0]?.toUpperCase() ?? '';
  }

  ngOnInit(): void {
    // Subscribe to WebSocket messages
    this.messageSub = this.wsService.message$.subscribe((msg) => {
      this.ngZone.run(() => this.handleMessage(msg));
    });

    // Connect WebSocket
    const ws = this.wsService.connect();

    ws.onopen = () => {
      this.wsService.send({ type: 'Register', payload: { user_id: this.userId } });
    };

    ws.onclose = () => {
      this.ngZone.run(() => {
        this.peerOnline = false;
        this.registered = false;
      });
    };

    // Listen for messages from service worker
    this.pushService.onSwMessage((data: any) => {
      this.ngZone.run(() => {
        if (data.type === 'CALL_ACCEPT_FROM_NOTIFICATION') {
          this.incomingFrom = data.from;
          this.callState = 'incoming';
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.messageSub?.unsubscribe();
    this.wsService.disconnect();
    clearTimeout(this.flashTimeoutId);
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'Registered':
        this.registered = true;
        // Subscribe to push after successful registration
        this.pushService
          .registerPushSubscription(this.userId, (m: any) => this.wsService.send(m))
          .then(() => {
            this.ngZone.run(() => (this.pushReady = true));
          })
          .catch(console.error);

        // Auto-accept if opened from push notification
        if (this.autoAction === 'accept') {
          setTimeout(() => {
            this.ngZone.run(() => {
              this.incomingFrom = this.peerId;
              this.callState = 'incoming';
            });
          }, 500);
        }
        break;

      case 'UserOnline':
        if (msg.payload.user_id === this.peerId) {
          this.peerOnline = true;
          if (this.registered) this.flash(`${this.peerId} came online`);
        }
        break;

      case 'UserOffline':
        if (msg.payload.user_id === this.peerId) {
          this.peerOnline = false;
          this.callState = 'idle';
          this.flash(`${this.peerId} went offline`);
        }
        break;

      case 'IncomingCall':
        this.incomingFrom = msg.payload.from;
        this.callState = 'incoming';
        break;

      case 'CallAccepted':
        this.callState = 'accepted';
        this.flash(`${msg.payload.by} accepted your call!`);
        break;

      case 'CallRejected':
        this.callState = 'rejected';
        this.flash(`${msg.payload.by} rejected your call.`);
        setTimeout(() => {
          this.ngZone.run(() => (this.callState = 'idle'));
        }, 3000);
        break;

      case 'Error':
        this.flash(`Error: ${msg.payload.message}`);
        this.callState = 'idle';
        break;
    }
  }

  private flash(msg: string): void {
    this.statusMessage = msg;
    clearTimeout(this.flashTimeoutId);
    this.flashTimeoutId = setTimeout(() => {
      this.ngZone.run(() => (this.statusMessage = ''));
    }, 3500);
  }

  handleCall(): void {
    this.callState = 'calling';
    this.wsService.send({ type: 'Call', payload: { from: this.userId, to: this.peerId } });
  }

  handleAccept(): void {
    this.wsService.send({ type: 'Accept', payload: { from: this.userId, to: this.incomingFrom } });
    this.callState = 'accepted';
  }

  handleReject(): void {
    this.wsService.send({ type: 'Reject', payload: { from: this.userId, to: this.incomingFrom } });
    this.incomingFrom = null;
    this.callState = 'idle';
  }

  handleEndCall(): void {
    this.callState = 'idle';
  }

  handleCancelCall(): void {
    this.callState = 'idle';
  }
}
