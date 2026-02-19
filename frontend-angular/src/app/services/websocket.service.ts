import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

const WS_URL = 'ws://localhost:3001/ws';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  readonly message$ = new Subject<any>();

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): WebSocket {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.message$.next(data);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = (e) => console.error('WebSocket error:', e);

    return ws;
  }

  send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.ws?.close();
  }
}
