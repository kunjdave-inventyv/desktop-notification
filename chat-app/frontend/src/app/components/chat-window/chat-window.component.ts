import { Component, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { SocketService } from '../../core/services/socket.service';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.css'
})
export class ChatWindowComponent {
  @ViewChild('messageList') messageList!: ElementRef;
  messageText = '';

  constructor(
    public chatService: ChatService,
    private socketService: SocketService
  ) {
    // Auto-scroll when messages change
    effect(() => {
      this.chatService.chatHistory();
      setTimeout(() => this.scrollToBottom(), 100);
    });
  }

  private scrollToBottom() {
    if (this.messageList) {
      this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
    }
  }

  sendMessage() {
    const to = this.chatService.currentChatUser();
    if (this.messageText.trim() && to) {
      this.socketService.sendMessage(to, this.messageText);
      this.messageText = '';
    }
  }

  makeCall() {
    const to = this.chatService.currentChatUser();
    if (to) {
      this.socketService.initiateCall(to);
    }
  }

  onKeyPress() {
    const to = this.chatService.currentChatUser();
    if (to) {
      this.socketService.sendTyping(to, true);
    }
  }
}
