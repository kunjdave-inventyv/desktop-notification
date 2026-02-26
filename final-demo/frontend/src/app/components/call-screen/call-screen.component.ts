// src/app/components/call-screen/call-screen.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-call-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-screen.component.html',
  styleUrls: ['./call-screen.component.css'],
})
export class CallScreenComponent implements OnInit, OnDestroy {
  elapsed = '00:00';
  private timerSub?: Subscription;

  constructor(public state: AppStateService) {}

  ngOnInit(): void {
    this.state.activeCall$.subscribe(call => {
      if (call?.startTime) {
        this.startTimer(call.startTime);
      } else {
        this.stopTimer();
      }
    });
  }

  ngOnDestroy(): void { this.stopTimer(); }

  get callState() { return this.state.callState$.value; }
  get call() { return this.state.activeCall$.value; }

  get isVisible(): boolean {
    return this.callState !== 'idle';
  }

  get isRinging(): boolean {
    return this.callState === 'ringing' || this.callState === 'group_ringing';
  }

  get isCalling(): boolean {
    return this.callState === 'calling' || this.callState === 'group_calling';
  }

  get isActive(): boolean {
    return this.callState === 'active' || this.callState === 'group_active';
  }

  get displayName(): string {
    const c = this.call;
    if (!c) return '';
    if (c.type === 'group') return c.groupName ?? c.groupId ?? 'Group';
    return c.peerId ?? '';
  }

  accept(): void {
    if (this.callState === 'ringing') this.state.acceptCall();
    else if (this.callState === 'group_ringing') this.state.acceptGroupCall();
  }

  reject(): void {
    if (this.callState === 'ringing') this.state.rejectCall();
    else if (this.callState === 'group_ringing') this.state.rejectGroupCall();
  }

  cancel(): void { this.state.cancelCall(); }
  cutCall(): void { this.state.cutCall(); }

  private startTimer(startTime: number): void {
    this.stopTimer();
    this.timerSub = interval(1000).subscribe(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      this.elapsed = `${m}:${s}`;
    });
  }

  private stopTimer(): void {
    this.timerSub?.unsubscribe();
    this.elapsed = '00:00';
  }
}
