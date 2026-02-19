import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-outgoing-call-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './outgoing-call-modal.component.html',
})
export class OutgoingCallModalComponent {
  @Input() to: string = '';
  @Output() cancel = new EventEmitter<void>();

  get initial(): string {
    return this.to?.[0]?.toUpperCase() ?? '';
  }
}
