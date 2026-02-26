import { Injectable, signal, computed } from '@angular/core';

export interface Message {
  id?: string;
  from: string;
  to: string;
  text: string;
  timestamp: Date;
  type?: 'chat' | 'call';
  callStatus?: 'accepted' | 'rejected' | 'missed' | 'started';
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private messages = signal<Message[]>([]);
  private messageIds = new Set<string>();
  
  public currentChatUser = signal<string | null>(null);
  public currentUser = signal<string | null>(null);

  public allMessages = computed(() => this.messages());

  public chatHistory = computed(() => {
    const chatUser = this.currentChatUser();
    const currUser = this.currentUser();
    if (!chatUser || !currUser) return [];
    return this.messages().filter(m => 
      (m.from === currUser && m.to === chatUser) || 
      (m.from === chatUser && m.to === currUser)
    );
  });

  login(userId: string) {
    this.currentUser.set(userId);
  }

  logout() {
    this.currentUser.set(null);
    this.currentChatUser.set(null);
    this.messages.set([]);
    this.messageIds.clear();
  }

  addMessage(msg: Message) {
    if (!msg.text) {
      console.warn('[ChatService] Ignoring empty/invalid message:', msg);
      return;
    }

    // Deduplicate using id
    if (msg.id) {
      const idStr = String(msg.id);
      if (this.messageIds.has(idStr)) {
        console.log(`[ChatService] Duplicate discarded. ID: ${idStr}, Text: "${msg.text}"`);
        return;
      }
      this.messageIds.add(idStr);
      console.log(`[ChatService] Message added. ID: ${idStr}, Text: "${msg.text}"`);
    } else {
      console.warn(`[ChatService] Message without ID! Text: "${msg.text}"`);
    }
    
    // Ensure timestamp is a Date object
    if (msg.timestamp && !(msg.timestamp instanceof Date)) {
      msg.timestamp = new Date(msg.timestamp);
    }

    this.messages.update(msgs => [...msgs, msg]);
  }

  setCurrentChatUser(userId: string) {
    this.currentChatUser.set(userId);
  }
}
