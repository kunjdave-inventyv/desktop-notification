import { Component, OnInit } from '@angular/core';
import { ChatService } from './core/services/chat.service';
import { SocketService } from './core/services/socket.service';
import { PushService } from './core/services/push.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SidebarComponent, ChatWindowComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  constructor(
    private socketService: SocketService, 
    private pushService: PushService,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    this.registerServiceWorker();
  }

  private registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW Registered', reg))
        .catch(err => console.error('SW Registration failed', err));
    }
  }
}
