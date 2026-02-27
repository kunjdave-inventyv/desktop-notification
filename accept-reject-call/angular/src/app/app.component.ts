import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionService } from './services/session.service';
import { RegisterScreenComponent } from './components/register-screen.component';
import { CallScreenComponent } from './components/call-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RegisterScreenComponent, CallScreenComponent],
  template: `
    @if (sessionService.session()) {
      <app-call-screen
        [userId]="sessionService.session()!.userId"
        [peerId]="sessionService.session()!.peerId"
        [autoAction]="sessionService.session()!.autoAction"
        (disconnect)="handleDisconnect()"
      />
    } @else {
      <app-register-screen (register)="handleRegister($event)" />
    }
  `
})
export class AppComponent implements OnInit {
  constructor(public sessionService: SessionService) {}

  ngOnInit(): void {
    // Handle push notification deep-link params
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const peerId = params.get('peerId');
    const action = params.get('action');
    if (userId && peerId) {
      this.sessionService.setSession(userId, peerId, action);
    }
  }

  handleRegister(event: { userId: string; peerId: string }): void {
    this.sessionService.setSession(event.userId, event.peerId, null);
  }

  handleDisconnect(): void {
    this.sessionService.clearSession();
    window.history.replaceState({}, '', '/');
  }
}
