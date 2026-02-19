import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-incoming-call-modal',
  standalone: true,
  templateUrl: './incoming-call-modal.component.html',
})
export class IncomingCallModalComponent {
  @Input() from: string = '';
  @Output() accept = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
}
