// src/app/components/register/register.component.ts

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent {
  userId = '';
  loading = false;

  constructor(public state: AppStateService) {}

  register(): void {
    const name = this.userId.trim();
    if (!name) return;
    this.loading = true;
    this.state.register(name);
    // Reset on error
    this.state.toasts$.subscribe(t => {
      if (t.find(x => x.type === 'error')) this.loading = false;
    });
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.register();
  }
}
