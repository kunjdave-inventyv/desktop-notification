import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../core/services/chat.service';
import { SocketService } from '../../core/services/socket.service';
import { PushService } from '../../core/services/push.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  users = ['UserA', 'UserB', 'UserC'];

  constructor(
    public chatService: ChatService,
    private socketService: SocketService,
    private pushService: PushService,
    private notificationService: NotificationService
  ) {}

  selectUser(user: string) {
    this.chatService.setCurrentChatUser(user);
  }

  login(user: string) {
    this.chatService.login(user);
    this.socketService.joinChat(user);
    this.pushService.requestPermission();
    this.notificationService.requestPermission();
  }

  logout() {
    this.chatService.logout();
  }
}
