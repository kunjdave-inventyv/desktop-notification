// src/app/services/app-state.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  UserEntry, Group, CallState, ActiveCall, ToastMessage,
  ChatMessage, ChatConversation,
} from '../models/types';
import { WebSocketService } from './websocket.service';
import { PushSubscriptionService } from './push-subscription.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {

  public currentUserId$ = new BehaviorSubject<string | null>(null);
  public users$         = new BehaviorSubject<UserEntry[]>([]);
  public groups$        = new BehaviorSubject<Group[]>([]);
  public callState$     = new BehaviorSubject<CallState>('idle');
  public activeCall$    = new BehaviorSubject<ActiveCall | null>(null);
  public toasts$        = new BehaviorSubject<ToastMessage[]>([]);
  public conversations$ = new BehaviorSubject<ChatConversation[]>([]);

  private audioCtx: AudioContext | null = null;
  private ringInterval: any = null;
  private pendingAction: { action: 'accept' | 'reject'; peerId?: string; groupId?: string } | null = null;
  private _pendingOpenChat: { from: string; groupId: string | null } | null = null;

  /** Consumed by ChatComponent on init to auto-open a conversation that was
   *  tapped in a notification while the app was already open. */
  getPendingOpenChat(): { from: string; groupId: string | null } | null {
    const v = this._pendingOpenChat;
    this._pendingOpenChat = null;
    return v;
  }

  get userId(): string | null  { return this.currentUserId$.value; }
  get users(): UserEntry[]     { return this.users$.value; }
  get groups(): Group[]        { return this.groups$.value; }

  constructor(
    private ws: WebSocketService,
    public push: PushSubscriptionService,
  ) {
    this.ws.events$.subscribe(({ event, data }) => this.handle(event, data));

    this.push.onSwMessage((msg: any) => {
      switch (msg.type) {
        case 'CALL_ACCEPT_FROM_NOTIFICATION':
          if (this.callState$.value === 'ringing') this.acceptCall(msg.from);
          else this.pendingAction = { action: 'accept', peerId: msg.from };
          break;
        case 'CALL_REJECT_FROM_NOTIFICATION':
          this.push.dismissCallNotification(msg.from);
          if (this.callState$.value === 'ringing') this.rejectCall(msg.from);
          else this.pendingAction = { action: 'reject', peerId: msg.from };
          break;
        case 'CALL_GROUP_ACCEPT_FROM_NOTIFICATION':
          if (this.callState$.value === 'group_ringing') this.acceptGroupCallById(msg.groupId);
          else this.pendingAction = { action: 'accept', groupId: msg.groupId };
          break;
        case 'CALL_GROUP_REJECT_FROM_NOTIFICATION':
          this.push.dismissGroupNotification(msg.from, msg.groupId);
          if (this.callState$.value === 'group_ringing') this.rejectGroupCallById(msg.groupId);
          else this.pendingAction = { action: 'reject', groupId: msg.groupId };
          break;

        // User replied from the OS inline-reply box — send over live WebSocket
        case 'CHAT_REPLY_FROM_NOTIFICATION':
          if (!this.userId) break;
          if (msg.groupId) this.sendGroupMessage(msg.groupId, msg.content);
          else             this.sendMessage(msg.to, msg.content);
          break;

        // User tapped notification body — open that conversation in the UI
        case 'OPEN_CHAT_FROM_NOTIFICATION':
          this._pendingOpenChat = { from: msg.from, groupId: msg.groupId ?? null };
          break;
      }
    });
  }

  // ── Register ──────────────────────────────────────────────────────────────

  register(userId: string): void {
    this.ws.connect();
    const sub = this.ws.events$.subscribe(({ event }) => {
      if (event === 'registered') { this.push.setupAndSend(userId); sub.unsubscribe(); }
    });
    this.ws.send('register', { user_id: userId });
  }

  // ── Event handler ─────────────────────────────────────────────────────────

  private handle(event: string, data: any): void {
    switch (event) {

      case 'registered':
        this.currentUserId$.next(data.user_id);
        break;

      case 'register_error':
        this.toast('error', data.message);
        break;

      case 'user_list':
        this.users$.next(data.users);
        break;

      case 'user_online': {
        const list = this.users$.value.map(u =>
          u.user_id === data.user_id ? { ...u, is_online: true } : u);
        if (!list.find(u => u.user_id === data.user_id))
          list.push({ user_id: data.user_id, is_online: true });
        this.users$.next(list);
        break;
      }

      case 'user_offline': {
        const offlineId = data.user_id as string;

        this.users$.next(this.users$.value.map(u =>
          u.user_id === offlineId ? { ...u, is_online: false } : u));

        const call = this.activeCall$.value;
        const cs   = this.callState$.value;
        if (!call || cs === 'idle') break;

        if (call.type === 'direct' && call.peerId === offlineId) {
          this.stopRing();
          this.push.dismissCallNotification(offlineId);
          this.callState$.next('idle');
          this.activeCall$.next(null);
          this.toast('warning', `📵 ${offlineId} disconnected`);

        } else if (call.type === 'group') {
          const wasParticipant = (call.participants || []).includes(offlineId);
          if (wasParticipant) {
            const participants = (call.participants || []).filter(p => p !== offlineId);
            this.activeCall$.next({ ...call, participants } as ActiveCall);
            this.toast('info', `👤 ${offlineId} disconnected from call`);

            const onlyMeLeft = participants.length === 1 && participants[0] === this.userId;
            if (onlyMeLeft && cs === 'group_active') {
              this.toast('info', '📵 Everyone disconnected — call ended');
              this.cutCall();
            }
          }
          if (cs === 'group_ringing')
            this.push.dismissGroupNotification(offlineId, call.groupId ?? '');
        }
        break;
      }

      // ── 1-to-1 call ──────────────────────────────────────────────────────

      case 'incoming_call':
        if (this.callState$.value !== 'idle') break;
        this.callState$.next('ringing');
        this.activeCall$.next({ type: 'direct', peerId: data.from, direction: 'incoming' });
        this.startRing();
        this.toast('info', `📞 Incoming call from ${data.from}`);
        this.flushPendingAction('direct', data.from);
        break;

      case 'call_accepted':
        this.stopRing();
        this.callState$.next('active');
        this.activeCall$.next({
          ...this.activeCall$.value!,
          direction: 'outgoing',
          startTime: Date.now(),
        } as ActiveCall);
        this.toast('success', `✅ Call connected`);
        break;

      case 'call_rejected':
        this.stopRing();
        this.callState$.next('idle');
        this.activeCall$.next(null);
        this.toast('warning', `❌ Call rejected by ${data.by}`);
        break;

      case 'call_cancelled':
        this.stopRing();
        this.push.dismissCallNotification(data.by);
        this.callState$.next('idle');
        this.activeCall$.next(null);
        this.toast('warning', `Call cancelled by ${data.by}`);
        break;

      case 'call_ended':
        this.stopRing();
        if (this.callState$.value === 'ringing') {
          const call = this.activeCall$.value;
          if (call?.peerId) this.push.dismissCallNotification(call.peerId);
        }
        this.callState$.next('idle');
        this.activeCall$.next(null);
        this.toast('info', `📵 ${data.reason}`);
        break;

      // ── Groups ────────────────────────────────────────────────────────────

      case 'group_created': {
        const groups = this.groups$.value;
        if (!groups.find(g => g.group_id === data.group_id))
          this.groups$.next([...groups, data]);
        else
          this.groups$.next(groups.map(g => g.group_id === data.group_id ? data : g));
        // Ensure a conversation slot exists for this group
        this.ensureGroupConversation(data.group_id, data.name);
        break;
      }

      case 'group_updated': {
        this.groups$.next(this.groups$.value.map(g =>
          g.group_id === data.group_id ? data : g));
        // Keep conversation name in sync
        this.updateGroupConversationName(data.group_id, data.name);
        break;
      }

      case 'group_deleted':
        this.groups$.next(this.groups$.value.filter(g => g.group_id !== data.group_id));
        if (this.activeCall$.value?.groupId === data.group_id) {
          this.stopRing();
          this.callState$.next('idle');
          this.activeCall$.next(null);
        }
        break;

      // ── Group call ────────────────────────────────────────────────────────

      case 'group_incoming_call':
        if (this.callState$.value !== 'idle') break;
        this.callState$.next('group_ringing');
        this.activeCall$.next({
          type: 'group',
          groupId:   data.group_id,
          groupName: data.group_name,
          direction: 'incoming',
          participants: [data.from],
        });
        this.startRing();
        this.toast('info', `📞 Group call from ${data.from} in ${data.group_name}`);
        this.flushPendingAction('group', undefined, data.group_id);
        break;

      case 'group_member_joined': {
        const call = this.activeCall$.value;
        if (!call || call.groupId !== data.group_id) break;

        const existing     = call.participants || [];
        const participants = existing.includes(data.user_id)
          ? existing : [...existing, data.user_id];

        this.activeCall$.next({
          ...call, participants,
          direction: 'outgoing',
          startTime: call.startTime ?? Date.now(),
        } as ActiveCall);

        this.callState$.next('group_active');
        this.stopRing();

        if (data.user_id !== this.userId)
          this.toast('success', `👤 ${data.user_id} joined the call`);
        break;
      }

      case 'group_member_left': {
        const call = this.activeCall$.value;
        if (!call || call.groupId !== data.group_id) break;

        const cs = this.callState$.value;

        if (cs === 'group_ringing' || cs === 'group_calling') {
          const rejectedCount = (call.rejectedCount ?? 0) + 1;
          this.activeCall$.next({ ...call, rejectedCount });
          if (data.user_id !== this.userId)
            this.toast('info', `👤 ${data.user_id} declined`);

          const group        = this.groups$.value.find(g => g.group_id === data.group_id);
          const totalInvited = (group?.members?.length ?? 1) - 1;
          const accepted     = (call.participants?.filter(p => p !== this.userId).length ?? 0);

          if ((accepted + rejectedCount) >= totalInvited && accepted === 0) {
            this.toast('info', '📵 Nobody answered');
            this.cutCall();
          }
          break;
        }

        const participants = (call.participants || []).filter(p => p !== data.user_id);
        this.activeCall$.next({ ...call, participants });
        if (data.user_id !== this.userId)
          this.toast('info', `👤 ${data.user_id} left the call`);

        const group        = this.groups$.value.find(g => g.group_id === data.group_id);
        const totalInvited = (group?.members?.length ?? 1) - 1;
        const accepted     = participants.filter(p => p !== this.userId).length;
        const rejected     = call.rejectedCount ?? 0;
        const onlyMeLeft   = participants.length === 1 && participants[0] === this.userId;

        if (onlyMeLeft && (accepted + rejected) >= totalInvited) {
          this.toast('info', '📵 Everyone left — call ended');
          this.cutCall();
        }
        break;
      }

      case 'group_call_ended':
        this.handleGroupCallEnded(data);
        break;

      // ── Chat ─────────────────────────────────────────────────────────────

      case 'direct_message':
        this.ingestMessage({
          message_id: data.message_id,
          from:       data.from,
          to:         data.to,
          content:    data.content,
          timestamp:  data.timestamp,
        }, this.dmKey(data.from, data.to));
        break;

      case 'group_message':
        this.ingestMessage({
          message_id: data.message_id,
          from:       data.from,
          group_id:   data.group_id,
          content:    data.content,
          timestamp:  data.timestamp,
        }, this.groupKey(data.group_id));
        break;

      // message_sent is the ack to the sending tab — same shape as
      // direct_message / group_message, so route it through ingestMessage
      // so the sender's active tab also sees the bubble immediately.
      case 'message_sent': {
        const key = data.group_id
          ? this.groupKey(data.group_id)
          : this.dmKey(data.from, data.to);
        this.ingestMessage({
          message_id: data.message_id,
          from:       data.from,
          to:         data.to,
          group_id:   data.group_id,
          content:    data.content,
          timestamp:  data.timestamp,
        }, key);
        break;
      }

      // History replay on login — one event per conversation
      case 'message_history': {
        const { conversation_key, messages } = data as {
          conversation_key: string;
          messages: ChatMessage[];
        };
        if (!messages?.length) break;

        const convs = [...this.conversations$.value];
        let conv = convs.find(c => c.key === conversation_key);

        if (!conv) {
          conv = this.buildConversation(conversation_key);
          convs.push(conv);
        }

        // Replace messages entirely (history replay = authoritative snapshot)
        conv.messages = messages;
        conv.unread   = 0;
        this.conversations$.next(convs);
        break;
      }

      case 'error': {
        const cs = this.callState$.value;
        if (cs === 'calling' || cs === 'group_calling') {
          this.stopRing();
          this.callState$.next('idle');
          this.activeCall$.next(null);
        }
        this.toast('error', data.message);
        break;
      }
    }
  }

  // ── Chat helpers ──────────────────────────────────────────────────────────

  /** Canonical DM key — same logic as the Rust dm_key() function */
  dmKey(a: string, b: string): string {
    return a <= b ? `${a}::${b}` : `${b}::${a}`;
  }

  groupKey(groupId: string): string {
    return `group::${groupId}`;
  }

  /** Upsert a message into the correct conversation, increment unread if needed */
  private ingestMessage(msg: ChatMessage, key: string): void {
    const convs = [...this.conversations$.value];
    let conv = convs.find(c => c.key === key);

    if (!conv) {
      // Build an EMPTY slot — do NOT seed the message here.
      // Seeding caused the dedup check below to fire immediately and
      // return before conversations$.next() was ever called, silently
      // dropping every first message of a new DM conversation.
      conv = this.buildConversation(key);
      convs.push(conv);
    }

    // Deduplicate — message_sent + direct_message can both fire for sender's other tabs
    if (conv.messages.find(m => m.message_id === msg.message_id)) return;

    conv.messages = [...conv.messages, msg];

    // Only count as unread when it's from someone else and not the active conversation
    if (msg.from !== this.userId && key !== this.getActiveConversationKey()) {
      conv.unread = (conv.unread ?? 0) + 1;
    }

    this.conversations$.next(convs);
  }

  /** Build a blank ChatConversation from a key. */
  private buildConversation(key: string): ChatConversation {
    if (key.startsWith('group::')) {
      const groupId = key.slice('group::'.length);
      const group   = this.groups$.value.find(g => g.group_id === groupId);
      return {
        key, type: 'group',
        name:     group?.name ?? groupId,
        groupId,
        messages: [],
        unread:   0,
      };
    }
    return {
      key, type: 'dm',
      messages: [],
      unread:   0,
    };
  }

  /** Ensure a group conversation slot exists when a group is created/received */
  private ensureGroupConversation(groupId: string, name: string): void {
    const key   = this.groupKey(groupId);
    const convs = this.conversations$.value;
    if (!convs.find(c => c.key === key)) {
      this.conversations$.next([
        ...convs,
        { key, type: 'group', name, groupId, messages: [], unread: 0 },
      ]);
    }
  }

  private updateGroupConversationName(groupId: string, name: string): void {
    const key = this.groupKey(groupId);
    this.conversations$.next(
      this.conversations$.value.map(c =>
        c.key === key ? { ...c, name } : c
      )
    );
  }

  /** Called by the chat component when the user opens a conversation */
  markRead(key: string): void {
    this.conversations$.next(
      this.conversations$.value.map(c =>
        c.key === key ? { ...c, unread: 0 } : c
      )
    );
  }

  // Stored by ChatComponent via selectConversation — kept here so ingestMessage
  // can check whether to count unread
  private _activeConvKey: string | null = null;
  setActiveConversationKey(key: string | null): void { this._activeConvKey = key; }
  private getActiveConversationKey(): string | null  { return this._activeConvKey; }

  // ── Chat send actions ─────────────────────────────────────────────────────

  sendMessage(to: string, content: string): void {
    if (!this.userId) return;
    this.ws.send('send_message', { from: this.userId, to, content });
  }

  sendGroupMessage(groupId: string, content: string): void {
    if (!this.userId) return;
    this.ws.send('send_group_message', { from: this.userId, group_id: groupId, content });
  }

  // ── Flush pending notification action ─────────────────────────────────────

  private flushPendingAction(
    type: 'direct' | 'group',
    peerId?: string,
    groupId?: string,
  ): void {
    const pending = this.pendingAction;
    if (!pending) return;
    this.pendingAction = null;

    const matches = type === 'group'
      ? pending.groupId === groupId
      : pending.peerId  === peerId;
    if (!matches) return;

    setTimeout(() => {
      if (pending.action === 'accept') {
        if (type === 'group' && groupId) this.acceptGroupCallById(groupId);
        else if (peerId)                 this.acceptCall(peerId);
      } else {
        if (type === 'group' && groupId) this.rejectGroupCallById(groupId);
        else if (peerId)                 this.rejectCall(peerId);
      }
    }, 300);
  }

  // ── group_call_ended centralised handler ──────────────────────────────────

  private handleGroupCallEnded(data: { group_id: string; reason: string }): void {
    const { group_id, reason } = data;
    const call = this.activeCall$.value;
    const cs   = this.callState$.value;

    if (cs === 'idle') return;
    if (call && call.groupId !== group_id) return;

    this.stopRing();

    if (call) {
      const callerId = call.participants?.[0] ?? '';
      this.push.dismissGroupNotification(callerId, group_id);
      if (this.userId) this.push.dismissGroupNotification(this.userId, group_id);
    }

    this.callState$.next('idle');
    this.activeCall$.next(null);

    const silentReasons = [
      'You declined', 'Answered on another tab',
      'You left the call', 'Rejected on another tab', 'Call ended',
    ];
    if (!silentReasons.includes(reason)) {
      this.toast('info', `📵 ${reason}`);
    }
  }

  // ── Direct call actions ───────────────────────────────────────────────────

  makeCall(toUserId: string): void {
    if (!this.userId) return;
    this.callState$.next('calling');
    this.activeCall$.next({ type: 'direct', peerId: toUserId, direction: 'outgoing' });
    this.startRing();
    this.ws.send('call', { from: this.userId, to: toUserId });
  }

  cancelCall(): void {
    const call = this.activeCall$.value;
    if (!this.userId || !call?.peerId) return;
    this.ws.send('cancel', { from: this.userId, to: call.peerId });
    this.stopRing();
    this.callState$.next('idle');
    this.activeCall$.next(null);
  }

  acceptCall(fromUserId?: string): void {
    const call = this.activeCall$.value;
    const from = fromUserId || call?.peerId;
    if (!this.userId || !from) return;
    this.push.dismissCallNotification(from);
    this.stopRing();
    this.callState$.next('active');
    this.ws.send('accept', { from: this.userId, to: from });
    if (call) this.activeCall$.next({ ...call, startTime: Date.now() } as ActiveCall);
  }

  rejectCall(fromUserId?: string): void {
    const call = this.activeCall$.value;
    const from = fromUserId || call?.peerId;
    if (!this.userId || !from) return;
    if (this.callState$.value !== 'ringing') return;
    this.push.dismissCallNotification(from);
    this.stopRing();
    this.ws.send('reject', { from: this.userId, to: from });
    this.callState$.next('idle');
    this.activeCall$.next(null);
  }

  cutCall(): void {
    const call = this.activeCall$.value;
    if (!this.userId || !call) return;
    if (call.type === 'direct' && call.peerId) {
      this.ws.send('cut_call', { from: this.userId, to: call.peerId });
    } else if (call.type === 'group' && call.groupId) {
      this.ws.send('group_cut', { from: this.userId, group_id: call.groupId });
    }
    this.stopRing();
    this.callState$.next('idle');
    this.activeCall$.next(null);
  }

  // ── Group call actions ────────────────────────────────────────────────────

  makeGroupCall(groupId: string): void {
    if (!this.userId || this.callState$.value !== 'idle') return;
    this.callState$.next('group_calling');
    const group = this.groups$.value.find(g => g.group_id === groupId);
    this.activeCall$.next({
      type: 'group', groupId, groupName: group?.name,
      direction: 'outgoing', participants: [this.userId],
    });
    this.startRing();
    this.ws.send('group_call', { from: this.userId, group_id: groupId });
  }

  acceptGroupCall(): void {
    const call = this.activeCall$.value;
    if (!this.userId || !call?.groupId) return;
    this._doAcceptGroupCall(call.groupId);
  }

  acceptGroupCallById(groupId: string): void {
    if (!this.userId) return;
    const cs = this.callState$.value;
    if (cs !== 'idle' && cs !== 'group_ringing') return;
    if (this.activeCall$.value && this.activeCall$.value.groupId !== groupId) return;
    this._doAcceptGroupCall(groupId);
  }

  private _doAcceptGroupCall(groupId: string): void {
    const call = this.activeCall$.value;
    if (this.userId) this.push.dismissGroupNotification(this.userId, groupId);
    this.stopRing();
    this.callState$.next('group_active');
    this.ws.send('group_accept', { from: this.userId, group_id: groupId });
    if (call) {
      this.activeCall$.next({
        ...call, direction: 'outgoing', startTime: Date.now(),
      } as ActiveCall);
    }
  }

  rejectGroupCall(): void {
    const call = this.activeCall$.value;
    if (!this.userId || !call?.groupId) return;
    this._doRejectGroupCall(call.groupId, call.participants?.[0] ?? '');
  }

  rejectGroupCallById(groupId: string): void {
    if (!this.userId || this.callState$.value !== 'group_ringing') return;
    const call = this.activeCall$.value;
    if (!call || call.groupId !== groupId) return;
    this._doRejectGroupCall(groupId, call.participants?.[0] ?? '');
  }

  private _doRejectGroupCall(groupId: string, callerId: string): void {
    this.push.dismissGroupNotification(callerId, groupId);
    this.stopRing();
    this.ws.send('group_reject', { from: this.userId, group_id: groupId });
    this.callState$.next('idle');
    this.activeCall$.next(null);
  }

  // ── Group management ──────────────────────────────────────────────────────

  createGroup(name: string, members: string[]): void {
    if (!this.userId) return;
    this.ws.send('create_group', { created_by: this.userId, name, members });
  }

  addGroupMember(groupId: string, userId: string): void {
    if (!this.userId) return;
    this.ws.send('add_group_member', { group_id: groupId, added_by: this.userId, user_id: userId });
  }

  removeGroupMember(groupId: string, userId: string): void {
    if (!this.userId) return;
    this.ws.send('remove_group_member', { group_id: groupId, removed_by: this.userId, user_id: userId });
  }

  // ── Toasts ────────────────────────────────────────────────────────────────

  toast(type: ToastMessage['type'], message: string): void {
    const id = Math.random().toString(36).slice(2);
    this.toasts$.next([...this.toasts$.value, { id, type, message }]);
    setTimeout(() => this.dismissToast(id), 4000);
  }

  dismissToast(id: string): void {
    this.toasts$.next(this.toasts$.value.filter(t => t.id !== id));
  }

  // ── Ring sound ────────────────────────────────────────────────────────────

  private startRing(): void {
    this.stopRing();
    const ring = () => {
      try {
        if (!this.audioCtx) this.audioCtx = new AudioContext();
        const osc  = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.frequency.setValueAtTime(480, this.audioCtx.currentTime);
        osc.frequency.setValueAtTime(620, this.audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.6);
        osc.start(this.audioCtx.currentTime);
        osc.stop(this.audioCtx.currentTime + 0.6);
      } catch {}
    };
    ring();
    this.ringInterval = setInterval(ring, 1500);
  }

  private stopRing(): void {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }
}