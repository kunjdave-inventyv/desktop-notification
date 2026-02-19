import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register-screen',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './register-screen.component.html',
})
export class RegisterScreenComponent {
  @Output() register = new EventEmitter<{ userId: string; peerId: string }>();

  userId = '';
  peerId = '';

  get isValid(): boolean {
    return this.userId.trim().length > 0 && this.peerId.trim().length > 0;
  }

  handleSubmit(): void {
    const u = this.userId.trim();
    const p = this.peerId.trim();
    if (!u || !p) return;
    if (u === p) {
      alert('Your ID and peer ID cannot be the same.');
      return;
    }
    this.register.emit({ userId: u, peerId: p });
  }
}
