// src/app/services/websocket.service.ts

import { Injectable, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface SocketEvent {
  event: string;
  data: any;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket!: Socket;
  private readonly SERVER_URL = 'http://localhost:3001';

  public connected$ = new BehaviorSubject<boolean>(false);
  public events$ = new Subject<SocketEvent>();

  constructor(private ngZone: NgZone) {}

  connect(): void {
    this.socket = io(this.SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => this.connected$.next(true));
    });

    this.socket.on('disconnect', () => {
      this.ngZone.run(() => this.connected$.next(false));
    });

    const events = [
      'registered', 'register_error',
      'user_list', 'user_online', 'user_offline',
      'incoming_call', 'call_accepted', 'call_rejected',
      'call_cancelled', 'call_ended',
      'group_created', 'group_updated', 'group_deleted',
      'group_incoming_call', 'group_member_joined',
      'group_member_left', 'group_call_ended',
      'error',
    ];

    events.forEach(ev => {
      this.socket.on(ev, (data: any) => {
        this.ngZone.run(() => this.events$.next({ event: ev, data }));
      });
    });
  }

  send(event: string, payload: any): void {
    this.socket.emit(event, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
