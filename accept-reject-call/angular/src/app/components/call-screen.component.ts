// import {
//   Component, Input, Output, EventEmitter,
//   OnInit, OnDestroy, ChangeDetectorRef
// } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { Subscription } from 'rxjs';
// import { WebSocketService } from '../services/websocket.service';
// import { PushSubscriptionService } from '../services/push-subscription.service';
// import { IncomingCallModalComponent } from './incoming-call-modal.component';
// import { OutgoingCallModalComponent } from './outgoing-call-modal.component';

// type CallState = 'idle' | 'calling' | 'incoming' | 'accepted' | 'rejected';

// @Component({
//   selector: 'app-call-screen',
//   standalone: true,
//   imports: [CommonModule, IncomingCallModalComponent, OutgoingCallModalComponent],
//   template: `
//     <div class="min-h-screen bg-gray-950 flex items-center justify-center px-4">

//       @if (callState === 'incoming') {
//         <app-incoming-call-modal
//           [from]="incomingFrom"
//           (accept)="handleAccept()"
//           (reject)="handleReject()"
//         />
//       }

//       @if (callState === 'calling') {
//         <app-outgoing-call-modal [to]="peerId" (cancel)="handleCancelCall()" />
//       }

//       <div class="w-full max-w-sm space-y-4 animate-fade-in">

//         <!-- Header -->
//         <div class="flex items-center justify-between mb-2">
//           <div>
//             <h1 class="text-lg font-bold text-white">Signal</h1>
//             <p class="text-xs text-gray-500">WebSocket P2P Call</p>
//           </div>
//           <button (click)="handleBack()"
//             class="text-xs text-gray-500 hover:text-gray-300 transition-colors">
//             ← Back
//           </button>
//         </div>

//         <!-- YOUR CARD -->
//         <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
//           <p class="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">You</p>
//           <div class="flex items-center gap-3">
//             <div class="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
//               {{ userId[0]?.toUpperCase() }}
//             </div>
//             <div class="flex-1">
//               <p class="font-semibold text-white text-sm">{{ userId }}</p>
//               <div class="flex items-center gap-1.5 mt-1">
//                 <span class="w-2 h-2 rounded-full flex-shrink-0"
//                   [style.background]="wsConnected ? '#4ade80' : '#6b7280'"></span>
//                 <span class="text-xs text-gray-400">
//                   {{ wsConnected ? 'Connected to server' : 'Connecting...' }}
//                 </span>
//               </div>
//               <div class="flex items-center gap-1.5 mt-1">
//                 <span class="w-2 h-2 rounded-full flex-shrink-0"
//                   [style.background]="pushReady ? '#818cf8' : '#6b7280'"></span>
//                 <span class="text-xs text-gray-400">
//                   {{ pushReady ? 'Push notifications active' : 'Push not active' }}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>

//         <!-- PEER CARD -->
//         <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
//           <p class="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Peer</p>
//           <div class="flex items-center gap-3">
//             <div class="relative flex-shrink-0">
//               <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
//                 {{ peerId[0]?.toUpperCase() }}
//               </div>
//               <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900"
//                 [style.background]="peerOnline ? '#4ade80' : peerEverConnected ? '#facc15' : '#6b7280'">
//               </span>
//             </div>
//             <div>
//               <p class="font-semibold text-white text-sm">{{ peerId }}</p>
//               <p class="text-xs mt-0.5"
//                 [style.color]="peerOnline ? '#4ade80' : peerEverConnected ? '#fbbf24' : '#6b7280'">
//                 @if (peerOnline) { Online }
//                 @else if (peerEverConnected) { Offline — will be notified via push }
//                 @else { Waiting to connect... }
//               </p>
//             </div>
//           </div>
//         </div>

//         <!-- BANNER -->
//         @if (callState === 'idle') {
//           @if (peerOnline) {
//             <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-green-900/20 border border-green-800/40">
//               <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></span>
//               <p class="text-xs text-green-300">Both connected — ready to call.</p>
//             </div>
//           } @else if (peerEverConnected) {
//             <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-yellow-900/20 border border-yellow-800/40">
//               <span class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></span>
//               <p class="text-xs text-yellow-300">
//                 <strong>{{ peerId }}</strong> is offline. They will be notified via push.
//               </p>
//             </div>
//           } @else {
//             <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-gray-800/60 border border-gray-700/40">
//               <span class="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0"></span>
//               <p class="text-xs text-gray-400">
//                 Waiting for <strong>{{ peerId }}</strong> to connect at least once.
//               </p>
//             </div>
//           }
//         }

//         <!-- CALL BUTTON -->
//         @if (callState === 'idle') {
//           <button
//             (click)="handleCall()"
//             [disabled]="!canCall"
//             class="w-full flex items-center justify-center gap-2 font-semibold rounded-2xl py-3.5 text-sm transition-all duration-200"
//             [class]="canCall
//               ? 'bg-green-600 hover:bg-green-500 text-white'
//               : 'bg-gray-800 text-gray-600 cursor-not-allowed'"
//           >
//             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
//               <path stroke-linecap="round" stroke-linejoin="round"
//                 d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
//             </svg>
//             @if (!wsConnected) { Connecting... }
//             @else if (!peerEverConnected) { Waiting for {{ peerId }}... }
//             @else if (peerOnline) { Call {{ peerId }} }
//             @else { Call {{ peerId }} (offline) }
//           </button>
//         }

//         <!-- IN CALL -->
//         @if (callState === 'accepted') {
//           <div class="space-y-3">
//             <div class="bg-green-900/30 border border-green-700/50 rounded-2xl p-4 text-center">
//               <div class="flex items-center justify-center gap-2 text-green-400 font-semibold text-sm">
//                 <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
//                 Call connected with {{ peerId }}
//               </div>
//             </div>
//             <button (click)="handleEndCall()"
//               class="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors">
//               <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
//                 <path stroke-linecap="round" stroke-linejoin="round"
//                   d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
//               </svg>
//               End Call
//             </button>
//           </div>
//         }

//         <!-- REJECTED -->
//         @if (callState === 'rejected') {
//           <div class="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
//             <p class="text-red-400 text-sm font-medium">Call was rejected</p>
//           </div>
//         }

//         <!-- FLASH -->
//         @if (statusMessage) {
//           <div class="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-center animate-fade-in">
//             <p class="text-xs text-gray-300">{{ statusMessage }}</p>
//           </div>
//         }

//       </div>
//     </div>
//   `
// })
// export class CallScreenComponent implements OnInit, OnDestroy {
//   @Input() userId = '';
//   @Input() peerId = '';
//   @Input() autoAction: string | null = null;
//   @Output() disconnect = new EventEmitter<void>();

//   callState: CallState = 'idle';
//   wsConnected = false;
//   pushReady = false;
//   peerOnline = false;
//   peerEverConnected = false;
//   incomingFrom = '';
//   statusMessage = '';

//   private flashTimer: any = null;
//   private subs: Subscription[] = [];

//   constructor(
//     private wsService: WebSocketService,
//     private pushService: PushSubscriptionService,
//     private cdr: ChangeDetectorRef
//   ) {}

//   get canCall(): boolean {
//     return this.wsConnected && this.peerEverConnected;
//   }

//   ngOnInit(): void {
//     this.subs.push(
//       this.wsService.connected$.subscribe(connected => {
//         this.wsConnected = connected;
//         if (!connected) this.peerOnline = false;
//         this.cdr.detectChanges();
//       })
//     );

//     this.subs.push(
//       this.wsService.messages$.subscribe(msg => {
//         this.handleMessage(msg);
//         this.cdr.detectChanges();
//       })
//     );

//     this.wsService.connect(
//       async () => {
//         console.log('[app] WS open, setting up push then registering...');

//         // Always register even if push fails
//         try {
//           this.pushReady = await this.pushService.setupAndSend(this.userId);
//         } catch (e) {
//           console.error('[app] push setup threw:', e);
//           this.pushReady = false;
//         }
//         this.cdr.detectChanges();

//         console.log('[app] push done, now sending Register');
//         this.wsService.send('Register', { user_id: this.userId });
//       },
//       () => {
//         this.peerOnline = false;
//         this.cdr.detectChanges();
//       }
//     );

//     this.pushService.onSwMessage((data: any) => {
//       if (data.type === 'CALL_ACCEPT_FROM_NOTIFICATION') {
//         this.incomingFrom = data.from;
//         this.callState = 'incoming';
//         this.cdr.detectChanges();
//       }
//     });
//   }

//   ngOnDestroy(): void {
//     this.subs.forEach(s => s.unsubscribe());
//     this.wsService.disconnect();
//     clearTimeout(this.flashTimer);
//   }

//   private handleMessage(msg: any): void {
//     const p = msg.payload ?? {};

//     switch (msg.type) {
//       case 'Registered':
//         if (this.autoAction === 'accept') {
//           setTimeout(() => {
//             this.incomingFrom = this.peerId;
//             this.callState = 'incoming';
//             this.cdr.detectChanges();
//           }, 400);
//         }
//         break;

//       case 'UserOnline':
//         if (p.user_id === this.peerId) {
//           this.peerOnline = true;
//           this.peerEverConnected = true;
//           this.flash(`${this.peerId} is online`);
//         }
//         break;

//       case 'UserOffline':
//         if (p.user_id === this.peerId) {
//           this.peerOnline = false;
//           // peerEverConnected stays true — they registered, backend has their push sub
//           if (this.callState === 'accepted') {
//             this.callState = 'idle';
//             this.flash(`${this.peerId} disconnected — call ended`);
//           } else if (this.callState === 'calling') {
//             this.callState = 'idle';
//             this.flash(`${this.peerId} went offline`);
//           } else {
//             this.flash(`${this.peerId} went offline`);
//           }
//         }
//         break;

//       case 'IncomingCall':
//         this.incomingFrom = p.from ?? '';
//         this.callState = 'incoming';
//         break;

//       case 'CallAccepted':
//         this.callState = 'accepted';
//         this.flash(`${p.by} accepted your call!`);
//         break;

//       case 'CallRejected':
//         this.callState = 'rejected';
//         this.flash(`${p.by} rejected the call`);
//         setTimeout(() => {
//           this.callState = 'idle';
//           this.cdr.detectChanges();
//         }, 3000);
//         break;

//       case 'Error':
//         this.flash(`⚠ ${p.message ?? 'Error'}`);
//         if (this.callState === 'calling') this.callState = 'idle';
//         break;
//     }
//   }

//   private flash(msg: string): void {
//     this.statusMessage = msg;
//     clearTimeout(this.flashTimer);
//     this.flashTimer = setTimeout(() => {
//       this.statusMessage = '';
//       this.cdr.detectChanges();
//     }, 4000);
//   }

//   handleBack(): void {
//     this.wsService.disconnect();
//     this.disconnect.emit();
//   }

//   handleCall(): void {
//     if (!this.canCall) return;
//     this.callState = 'calling';
//     this.wsService.send('Call', { from: this.userId, to: this.peerId });
//   }

//   handleAccept(): void {
//     this.wsService.send('Accept', { from: this.userId, to: this.incomingFrom });
//     this.callState = 'accepted';
//   }

//   handleReject(): void {
//     this.wsService.send('Reject', { from: this.userId, to: this.incomingFrom });
//     this.incomingFrom = '';
//     this.callState = 'idle';
//   }

//   handleEndCall(): void { this.callState = 'idle'; }
//   handleCancelCall(): void { this.callState = 'idle'; }
// }
import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WebSocketService }       from '../services/websocket.service';
import { PushSubscriptionService } from '../services/push-subscription.service';
import { IncomingCallModalComponent } from './incoming-call-modal.component';
import { OutgoingCallModalComponent } from './outgoing-call-modal.component';

// idle      — nothing happening
// calling   — we initiated, waiting for callee to answer
// incoming  — someone is calling us
// accepted  — call is live (either side accepted)
// rejected  — callee explicitly rejected (shown briefly, then → idle)
type CallState = 'idle' | 'calling' | 'incoming' | 'accepted' | 'rejected';

@Component({
  selector: 'app-call-screen',
  standalone: true,
  imports: [CommonModule, IncomingCallModalComponent, OutgoingCallModalComponent],
  template: `
    <div class="min-h-screen bg-gray-950 flex items-center justify-center px-4">

      @if (callState === 'incoming') {
        <app-incoming-call-modal
          [from]="incomingFrom"
          (accept)="handleAccept()"
          (reject)="handleReject()"
        />
      }

      @if (callState === 'calling') {
        <app-outgoing-call-modal [to]="peerId" (cancel)="handleCancelCall()" />
      }

      <div class="w-full max-w-sm space-y-4 animate-fade-in">

        <!-- Header -->
        <div class="flex items-center justify-between mb-2">
          <div>
            <h1 class="text-lg font-bold text-white">Signal</h1>
            <p class="text-xs text-gray-500">WebSocket P2P Call</p>
          </div>
          <button (click)="handleBack()"
            class="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Back
          </button>
        </div>

        <!-- YOUR CARD -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p class="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">You</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {{ userId[0]?.toUpperCase() }}
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white text-sm">{{ userId }}</p>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="w-2 h-2 rounded-full flex-shrink-0"
                  [style.background]="wsConnected ? '#4ade80' : '#6b7280'"></span>
                <span class="text-xs text-gray-400">
                  {{ wsConnected ? 'Connected to server' : 'Connecting...' }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="w-2 h-2 rounded-full flex-shrink-0"
                  [style.background]="pushReady ? '#818cf8' : '#6b7280'"></span>
                <span class="text-xs text-gray-400">
                  {{ pushReady ? 'Push notifications active' : 'Push not active' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- PEER CARD -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p class="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Peer</p>
          <div class="flex items-center gap-3">
            <div class="relative flex-shrink-0">
              <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
                {{ peerId[0]?.toUpperCase() }}
              </div>
              <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900"
                [style.background]="peerOnline ? '#4ade80' : peerEverConnected ? '#facc15' : '#6b7280'">
              </span>
            </div>
            <div>
              <p class="font-semibold text-white text-sm">{{ peerId }}</p>
              <p class="text-xs mt-0.5"
                [style.color]="peerOnline ? '#4ade80' : peerEverConnected ? '#fbbf24' : '#6b7280'">
                @if (peerOnline) { Online }
                @else if (peerEverConnected) { Offline — will be notified via push }
                @else { Waiting to connect... }
              </p>
            </div>
          </div>
        </div>

        <!-- BANNER -->
        @if (callState === 'idle') {
          @if (peerOnline) {
            <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-green-900/20 border border-green-800/40">
              <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></span>
              <p class="text-xs text-green-300">Both connected — ready to call.</p>
            </div>
          } @else if (peerEverConnected) {
            <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-yellow-900/20 border border-yellow-800/40">
              <span class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></span>
              <p class="text-xs text-yellow-300">
                <strong>{{ peerId }}</strong> is offline. They will be notified via push.
              </p>
            </div>
          } @else {
            <div class="rounded-2xl px-4 py-3 flex items-center gap-2 bg-gray-800/60 border border-gray-700/40">
              <span class="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0"></span>
              <p class="text-xs text-gray-400">
                Waiting for <strong>{{ peerId }}</strong> to connect at least once.
              </p>
            </div>
          }
        }

        <!-- CALL BUTTON -->
        @if (callState === 'idle') {
          <button
            (click)="handleCall()"
            [disabled]="!canCall"
            class="w-full flex items-center justify-center gap-2 font-semibold rounded-2xl py-3.5 text-sm transition-all duration-200"
            [class]="canCall
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            @if (!wsConnected) { Connecting... }
            @else if (!peerEverConnected) { Waiting for {{ peerId }}... }
            @else if (peerOnline) { Call {{ peerId }} }
            @else { Call {{ peerId }} (offline) }
          </button>
        }

        <!-- IN CALL -->
        @if (callState === 'accepted') {
          <div class="space-y-3">
            <div class="bg-green-900/30 border border-green-700/50 rounded-2xl p-4 text-center">
              <div class="flex items-center justify-center gap-2 text-green-400 font-semibold text-sm">
                <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Call connected with {{ peerId }}
              </div>
            </div>
            <button (click)="handleEndCall()"
              class="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
              </svg>
              End Call
            </button>
          </div>
        }

        <!-- REJECTED -->
        @if (callState === 'rejected') {
          <div class="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
            <p class="text-red-400 text-sm font-medium">Call was rejected</p>
          </div>
        }

        <!-- STATUS FLASH -->
        @if (statusMessage) {
          <div class="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-center animate-fade-in">
            <p class="text-xs text-gray-300">{{ statusMessage }}</p>
          </div>
        }

      </div>
    </div>
  `
})
export class CallScreenComponent implements OnInit, OnDestroy {
  @Input() userId   = '';
  @Input() peerId   = '';
  @Input() autoAction: string | null = null;
  @Output() disconnect = new EventEmitter<void>();

  callState:          CallState = 'idle';
  wsConnected         = false;
  pushReady           = false;
  peerOnline          = false;
  peerEverConnected   = false;
  incomingFrom        = '';
  statusMessage       = '';

  /** conn_id assigned by the server for this specific browser tab. */
  private connId      = '';
  private flashTimer: any     = null;
  private subs:       Subscription[] = [];

  constructor(
    private wsService:   WebSocketService,
    private pushService: PushSubscriptionService,
    private cdr:         ChangeDetectorRef
  ) {}

  get canCall(): boolean {
    return this.wsConnected && this.peerEverConnected && this.callState === 'idle';
  }

  ngOnInit(): void {
    // ── WebSocket connection state ───────────────────────────────────────────
    this.subs.push(
      this.wsService.connected$.subscribe(connected => {
        this.wsConnected = connected;
        if (!connected) {
          this.peerOnline = false;
          // If we were mid-call and the socket dropped, return to idle.
          if (this.callState !== 'idle') {
            this.callState = 'idle';
            this.flash('Connection lost');
          }
        }
        this.cdr.detectChanges();
      })
    );

    // ── Incoming WebSocket messages ──────────────────────────────────────────
    this.subs.push(
      this.wsService.messages$.subscribe(msg => {
        this.handleWsMessage(msg);
        this.cdr.detectChanges();
      })
    );

    // ── Connect ──────────────────────────────────────────────────────────────
    this.wsService.connect(
      async () => {
        console.log('[app] WS open — setting up push…');
        try {
          this.pushReady = await this.pushService.setupAndSend(this.userId);
        } catch (e) {
          console.error('[app] push setup threw:', e);
          this.pushReady = false;
        }
        this.cdr.detectChanges();

        console.log('[app] push done — sending Register');
        this.wsService.send('Register', { user_id: this.userId });
      },
      () => {
        this.peerOnline = false;
        this.cdr.detectChanges();
      }
    );

    // ── Service-worker → app messages ────────────────────────────────────────
    this.pushService.onSwMessage((data: any) => {
      switch (data.type) {

        // User tapped Accept on a push notification while the app was in the
        // background. Show the incoming modal so they can confirm via WS.
        case 'CALL_ACCEPT_FROM_NOTIFICATION':
          this.incomingFrom = data.from ?? '';
          this.callState    = 'incoming';
          this.cdr.detectChanges();
          break;

        // User tapped Reject on a push notification.
        // Send the Reject over WebSocket so the backend cleans up.
        case 'CALL_REJECT_FROM_NOTIFICATION':
          if (data.from) {
            this.wsService.send('Reject', { from: this.userId, to: data.from });
            // Dismiss any remaining notifications for this caller.
            this.pushService.dismissCallNotification(data.from);
            this.incomingFrom = '';
            this.callState    = 'idle';
            this.cdr.detectChanges();
          }
          break;
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.wsService.disconnect();
    clearTimeout(this.flashTimer);
  }

  // ── WebSocket message handler ────────────────────────────────────────────────

  private handleWsMessage(msg: any): void {
    const p = msg.payload ?? {};

    switch (msg.type) {

      // ── Registered ──────────────────────────────────────────────────────────
      case 'Registered':
        // Store the conn_id the server gave this tab.
        this.connId = p.conn_id ?? '';

        // Edge case: opened via push-notification link with ?action=accept
        if (this.autoAction === 'accept') {
          setTimeout(() => {
            this.incomingFrom = this.peerId;
            this.callState    = 'incoming';
            this.cdr.detectChanges();
          }, 400);
        }
        break;

      // ── Presence ────────────────────────────────────────────────────────────
      case 'UserOnline':
        if (p.user_id === this.peerId) {
          this.peerOnline         = true;
          this.peerEverConnected  = true;
          this.flash(`${this.peerId} is online`);
        }
        break;

      case 'UserOffline':
        if (p.user_id === this.peerId) {
          this.peerOnline = false;

          if (this.callState === 'accepted' || this.callState === 'calling') {
            this.callState = 'idle';
            this.flash(`${this.peerId} disconnected — call ended`);
          } else {
            this.flash(`${this.peerId} went offline`);
          }
        }
        break;

      // ── Incoming call ────────────────────────────────────────────────────────
      // Edge #1: Every open tab of the callee receives this message from the
      // backend, so they all show the incoming modal simultaneously.
      case 'IncomingCall':
        this.incomingFrom = p.from ?? '';
        this.callState    = 'incoming';
        break;

      // ── Call accepted (we were the caller) ───────────────────────────────────
      case 'CallAccepted':
        this.callState = 'accepted';
        this.flash(`${p.by} accepted your call!`);
        break;

      // ── Call rejected (we were the caller) ───────────────────────────────────
      case 'CallRejected':
        this.callState = 'rejected';
        this.flash(`${p.by} rejected the call`);
        setTimeout(() => {
          this.callState = 'idle';
          this.cdr.detectChanges();
        }, 3000);
        break;

      // ── Caller cancelled while we were ringing ───────────────────────────────
      // Edge #3: Backend sends CallCancelled to all callee tabs when the caller
      // sends a Cancel message. We must dismiss the incoming modal AND close any
      // push notification that may still be visible.
      case 'CallCancelled':
        if (this.callState === 'incoming' && this.incomingFrom === p.by) {
          this.callState    = 'idle';
          this.incomingFrom = '';
          this.flash(`${p.by} cancelled the call`);
          // Dismiss the push notification on this device/tab (edge #3).
          this.pushService.dismissCallNotification(p.by);
        }
        break;

      // ── Generic call-ended signal ────────────────────────────────────────────
      // Covers:
      //   Edge #2: "'{to}' is on another call"  → shown to the new caller
      //   Edge #4: "No answer"                  → timeout fired on the server
      //   Edge #5: "Answered on another tab"    → dismiss other callee tabs
      //            "Rejected on another tab"    → dismiss other callee tabs
      //            "Call accepted on another tab" → caller's other tabs
      case 'CallEnded': {
        const reason: string = p.reason ?? 'Call ended';

        // Silent dismiss for multi-tab coordination — don't flash an
        // alarming message when the user handled it themselves elsewhere.
        const silentReasons = [
          'Answered on another tab',
          'Rejected on another tab',
          'Call accepted on another tab',
        ];

        if (silentReasons.includes(reason)) {
          // Just clean up — no user-facing message needed.
          if (this.callState === 'incoming') {
            // Dismiss push notification if one was shown for this caller.
            this.pushService.dismissCallNotification(this.incomingFrom);
          }
          this.callState    = 'idle';
          this.incomingFrom = '';
        } else {
          // Surface the reason to the user (timeout, busy, disconnect, etc.)
          this.callState    = 'idle';
          this.incomingFrom = '';
          this.flash(reason);

          // Edge #4: If we were calling and got a timeout, dismiss outgoing modal.
          // Edge #2: If callee was busy, we get a CallEnded with the busy reason.
        }
        break;
      }

      // ── Server error ─────────────────────────────────────────────────────────
      case 'Error':
        this.flash(`⚠ ${p.message ?? 'Error'}`);
        if (this.callState === 'calling') this.callState = 'idle';
        break;
    }
  }

  // ── User actions ─────────────────────────────────────────────────────────────

  handleCall(): void {
    if (!this.canCall) return;
    this.callState = 'calling';
    this.wsService.send('Call', { from: this.userId, to: this.peerId });
  }

  handleAccept(): void {
    // `from` in Accept = the callee (us), `to` = the caller.
    this.wsService.send('Accept', { from: this.userId, to: this.incomingFrom });
    this.callState = 'accepted';
    // Dismiss push notification now that we've handled it via the WS modal.
    this.pushService.dismissCallNotification(this.incomingFrom);
  }

  handleReject(): void {
    this.wsService.send('Reject', { from: this.userId, to: this.incomingFrom });
    // Dismiss push notification for this caller on this device.
    this.pushService.dismissCallNotification(this.incomingFrom);
    this.incomingFrom = '';
    this.callState    = 'idle';
  }

  /**
   * Caller cancels the outgoing call while it is still ringing.
   * Edge #3: Sends Cancel to backend, which then sends CallCancelled to all
   * callee tabs and closes the push notification.
   */
  handleCancelCall(): void {
    this.wsService.send('Cancel', { from: this.userId, to: this.peerId });
    this.callState = 'idle';
  }

  /** End an active (accepted) call. */
  handleEndCall(): void {
    this.wsService.send('CutCall', { from: this.userId, to: this.peerId });
    // TODO: send an EndCall message when the backend supports it.
    // For now the backend cleans up on disconnect / explicit hangup.
    this.callState = 'idle';
  }

  handleBack(): void {
    this.wsService.disconnect();
    this.disconnect.emit();
  }

  private flash(msg: string): void {
    this.statusMessage = msg;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.statusMessage = '';
      this.cdr.detectChanges();
    }, 4000);
  }
}