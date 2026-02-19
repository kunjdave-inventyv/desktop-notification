import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterScreenComponent } from './components/register-screen/register-screen.component';
import { CallScreenComponent } from './components/call-screen/call-screen.component';

interface Session {
  userId: string;
  peerId: string;
  autoAction: string | null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RegisterScreenComponent, CallScreenComponent],
  templateUrl: './app.html',
})
export class AppComponent implements OnInit {
  session: Session | null = null;

  ngOnInit(): void {
    // If opened from a push notification accept click, auto-populate session
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const peerId = params.get('peerId');
    const action = params.get('action');
    if (userId && peerId) {
      this.session = { userId, peerId, autoAction: action || null };
    }
  }

  handleRegister(event: { userId: string; peerId: string }): void {
    this.session = { userId: event.userId, peerId: event.peerId, autoAction: null };
  }

  handleDisconnect(): void {
    this.session = null;
    // Clean up URL params
    window.history.replaceState({}, '', '/');
  }
}
