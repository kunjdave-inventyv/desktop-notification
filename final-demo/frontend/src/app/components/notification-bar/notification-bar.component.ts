// src/app/components/notification-bar/notification-bar.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';

@Component({
  selector: 'app-notification-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let t of state.toasts$ | async"
        class="toast"
        [class]="'toast toast-' + t.type"
        (click)="state.dismissToast(t.id)"
      >
        {{ t.message }}
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 2000;
    }
    .toast {
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 0.88rem;
      font-weight: 500;
      cursor: pointer;
      max-width: 340px;
      animation: toastIn 0.25s cubic-bezier(.16,1,.3,1);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      color: #fff;
    }
    @keyframes toastIn {
      from { opacity:0; transform: translateX(20px); }
      to   { opacity:1; transform: translateX(0); }
    }
    .toast-info    { background: #1e6af5; }
    .toast-success { background: #1db97a; }
    .toast-error   { background: #e53e3e; }
    .toast-warning { background: #d48a00; }
  `]
})
export class NotificationBarComponent {
  constructor(public state: AppStateService) {}
}
