import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ChatService, Message } from './chat.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService
  ) {
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      console.log('Connected to server');
      const user = this.chatService.currentUser();
      if (user) {
        this.socket.emit('join', user);
      }
    });

    this.socket.on('receive-message', (msg: Message) => {
      console.log(`[SocketService] receive-message. ID: ${msg.id}, From: ${msg.from}`);
      this.chatService.addMessage(msg);
      
      // Show notification if tab is hidden or user is not in this chat
      if (document.hidden || this.chatService.currentChatUser() !== msg.from) {
        this.notificationService.showNotification(`New message from ${msg.from}`, {
          body: msg.text,
          tag: String(msg.id), // CRITICAL: Tag prevents duplicates across multiple tabs
          data: msg
        });
      }
    });

    this.socket.on('incoming-call', ({ from }) => {
      // Add record to chat history
      this.chatService.addMessage({
        from,
        to: this.chatService.currentUser() || '',
        text: 'Incoming Call...',
        timestamp: new Date(),
        type: 'call',
        callStatus: 'started'
      });

      this.notificationService.showCallNotification(
        from,
        () => this.respondToCall(from, true),
        () => this.respondToCall(from, false)
      );
    });

    this.socket.on('call-result', ({ from, accepted }) => {
      // Update/Add result to history
      this.chatService.addMessage({
        from: accepted ? from : this.chatService.currentUser()!,
        to: accepted ? this.chatService.currentUser()! : from,
        text: accepted ? 'Call Accepted' : 'Call Rejected',
        timestamp: new Date(),
        type: 'call',
        callStatus: accepted ? 'accepted' : 'rejected'
      });

      this.notificationService.showNotification(`Call ${accepted ? 'Accepted' : 'Rejected'}`, {
        body: `${from} ${accepted ? 'accepted' : 'rejected'} your call.`
      });
    });

    // Listen for messages from Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        if (event.data.type === 'CALL_RESPONSE') {
          const { from, accepted } = event.data.payload;
          this.respondToCall(from, accepted);
        } else if (event.data.type === 'SYNC_ACTION') {
          const { action, payload } = event.data.payload;
          this.handleSyncAction(action, payload);
        }
      });
    }

    this.socket.on('sync-message', (msg: any) => {
       console.log(`[SocketService] sync-message. ID: ${msg.id}, From: ${msg.from}`);
       // Multi-tab sync: when user sends from another tab, this tab gets it too
       this.chatService.addMessage({
         id: msg.id,
         from: msg.from,
         to: msg.to,
         text: msg.text,
         timestamp: new Date(msg.timestamp) // Ensure it's a Date object
       });
    });

    this.socket.on('user-typing', (data: { from: string, isTyping: boolean }) => {
      // Handle typing indicator (UI logic)
      console.log(`${data.from} is typing: ${data.isTyping}`);
    });
  }

  joinChat(userId: string) {
    this.socket.emit('join', userId);
  }

  sendMessage(to: string, text: string) {
    const from = this.chatService.currentUser();
    if (!from) return;
    const msg: Message = { id: this.generateId(), from, to, text, timestamp: new Date() };
    this.socket.emit('send-message', msg);
    this.chatService.addMessage(msg);
  }

  sendTyping(to: string, isTyping: boolean) {
    const from = this.chatService.currentUser();
    if (!from) return;
    this.socket.emit('typing', { to, from, isTyping });
  }

  initiateCall(to: string) {
    const from = this.chatService.currentUser();
    if (!from) return;
    
    // Add record to history
    const callMsg: Message = {
        id: this.generateId(),
        from,
        to,
        text: 'Calling...',
        timestamp: new Date(),
        type: 'call',
        callStatus: 'started'
    };
    this.socket.emit('call-user', { to, from });
    this.chatService.addMessage(callMsg);
  }

  respondToCall(to: string, accepted: boolean) {
    const from = this.chatService.currentUser();
    if (!from) return;
    this.socket.emit('call-response', { to, from, accepted });
  }

  private generateId() {
    return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
  }

  private broadcastToTabs(action: string, payload: any) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLIENT_BROADCAST',
        payload: { action, payload }
      });
    }
  }

  private handleSyncAction(action: string, payload: any) {
    switch (action) {
      case 'MESSAGE_SENT':
        this.chatService.addMessage(payload);
        break;
      case 'CALL_STARTED':
        this.chatService.addMessage(payload);
        break;
      case 'CALL_RESPONSE':
        // Update history or state
        if (payload.accepted) {
           // Maybe focus window or update status
        }
        break;
    }
  }
}
