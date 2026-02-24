import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';

const WS_URL = 'ws://localhost:3001/ws';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  private connectedSubject = new BehaviorSubject<boolean>(false);

  get messages$(): Observable<any> { return this.messageSubject.asObservable(); }
  get connected$(): Observable<boolean> { return this.connectedSubject.asObservable(); }
  get isOpen(): boolean { return this.ws?.readyState === WebSocket.OPEN; }

  connect(onOpen: () => void, onClose: () => void): void {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connectedSubject.next(true);
      onOpen();
    };

    this.ws.onclose = () => {
      this.connectedSubject.next(false);
      onClose();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS RX]', data);
        this.messageSubject.next(data);
      } catch (e) {
        console.error('[WS] parse error', e);
      }
    };

    this.ws.onerror = (e) => console.error('[WS] error', e);
  }

  // Rust #[serde(tag="type", content="payload")]
  // sends: { "type": "Register", "payload": { "user_id": "alice" } }
  send(type: string, payload: Record<string, any>): void {
    if (!this.isOpen) {
      console.warn('[WS] not open, dropping:', type);
      return;
    }
    const msg = { type, payload };
    console.log('[WS TX]', JSON.stringify(msg));
    this.ws!.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  ngOnDestroy(): void { this.disconnect(); }
}