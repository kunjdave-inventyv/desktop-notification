// src/app/components/user-list/user-list.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.css'],
})
export class UserListComponent {
  constructor(public state: AppStateService) {}

  call(userId: string): void {
    const cs = this.state.callState$.value;
    if (cs !== 'idle') return;
    this.state.makeCall(userId);
  }

  get callIdle(): boolean {
    return this.state.callState$.value === 'idle';
  }

  trackUser(_: number, u: { user_id: string }) { return u.user_id; }
}
