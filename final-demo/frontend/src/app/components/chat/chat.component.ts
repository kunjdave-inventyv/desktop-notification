// src/app/components/chat/chat.component.ts

import {
  Component, OnInit, OnDestroy, ViewChild,
  ElementRef, AfterViewChecked, ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AppStateService } from '../../services/app-state.service';
import { ChatConversation, ChatMessage, UserEntry, Group } from '../../models/types';

type PanelTab = 'conversations' | 'users' | 'groups';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messageList') private messageList!: ElementRef<HTMLElement>;

  // ── State ─────────────────────────────────────────────────────────────────

  conversations: ChatConversation[] = [];
  users: UserEntry[]                = [];
  groups: Group[]                   = [];
  activeKey: string | null          = null;
  messageText                       = '';
  activeTab: PanelTab               = 'conversations';
  userSearch                        = '';

  private subs: Subscription[]       = [];
  private shouldScrollToBottom       = false;

  constructor(
    public state: AppStateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.state.conversations$.subscribe(convs => {
        this.conversations = convs;
        this.shouldScrollToBottom = true;
        this.cdr.markForCheck();
      }),
      this.state.users$.subscribe(users => {
        this.users = users;
        this.cdr.markForCheck();
      }),
      this.state.groups$.subscribe(groups => {
        this.groups = groups;
        this.cdr.markForCheck();
      }),
    );

    // If the user tapped a chat notification while the app was open, the
    // service worker posts OPEN_CHAT_FROM_NOTIFICATION → app-state stores it.
    // We consume it here so the right conversation is auto-selected.
    const pending = this.state.getPendingOpenChat();
    if (pending) {
      if (pending.groupId) this.openGroupChat(pending.groupId);
      else                 this.openDm(pending.from);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Tab navigation ────────────────────────────────────────────────────────

  setTab(tab: PanelTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  // ── Conversation list ─────────────────────────────────────────────────────

  get activeConversation(): ChatConversation | null {
    return this.conversations.find(c => c.key === this.activeKey) ?? null;
  }

  selectConversation(key: string): void {
    this.activeKey = key;
    this.state.markRead(key);
    this.state.setActiveConversationKey(key);
    this.shouldScrollToBottom = true;
    this.activeTab = 'conversations';
    this.cdr.markForCheck();

    // Dismiss any OS notification for this conversation so it doesn't linger
    const conv = this.conversations.find(c => c.key === key);
    if (conv?.type === 'group') {
      this.state.push.dismissChatNotification(null, conv.groupId ?? null);
    } else if (conv?.type === 'dm') {
      const peer = this.labelFor(conv);
      this.state.push.dismissChatNotification(peer, null);
    }
  }

  /** Open a DM conversation with a user, creating it if needed */
  openDm(userId: string): void {
    if (userId === this.state.userId) return;
    const key = this.state.dmKey(this.state.userId!, userId);

    // Always read from the service's authoritative value — never from
    // this.conversations which can be one CD-tick stale. Only create a
    // blank slot when one doesn't already exist (with real messages).
    const current = this.state.conversations$.value;
    if (!current.find(c => c.key === key)) {
      const conv: ChatConversation = { key, type: 'dm', messages: [], unread: 0 };
      this.state.conversations$.next([...current, conv]);
    }

    this.selectConversation(key);
  }

  /** Open a group conversation */
  openGroupChat(groupId: string): void {
    const key = this.state.groupKey(groupId);

    // Same fix: read from authoritative state, never overwrite an existing slot.
    const current = this.state.conversations$.value;
    if (!current.find(c => c.key === key)) {
      const group = this.groups.find(g => g.group_id === groupId);
      const conv: ChatConversation = {
        key, type: 'group',
        name: group?.name ?? groupId,
        groupId,
        messages: [],
        unread: 0,
      };
      this.state.conversations$.next([...current, conv]);
    }
    this.selectConversation(key);
  }

  /** Human-readable label for a conversation — peer name for DM, group name for group */
  labelFor(conv: ChatConversation): string {
    if (conv.type === 'group') return conv.name ?? conv.key;
    const [a, b] = conv.key.split('::');
    return a === this.state.userId ? b : a;
  }

  unreadCount(conv: ChatConversation): number {
    if (conv.key === this.activeKey) return 0;
    return conv.unread;
  }

  get totalUnread(): number {
    return this.conversations.reduce((n, c) => n + (c.unread ?? 0), 0);
  }

  lastMessage(conv: ChatConversation): string {
    const msgs = conv.messages;
    if (!msgs.length) return '';
    const last   = msgs[msgs.length - 1];
    const prefix = last.from === this.state.userId ? 'You: ' : `${last.from}: `;
    const text   = last.content.length > 35 ? last.content.slice(0, 35) + '…' : last.content;
    return prefix + text;
  }

  // ── User list helpers ─────────────────────────────────────────────────────

  get filteredUsers(): UserEntry[] {
    const me  = this.state.userId ?? '';
    const q   = this.userSearch.toLowerCase();
    return this.users
      .filter(u => u.user_id !== me)
      .filter(u => !q || u.user_id.toLowerCase().includes(q))
      .sort((a, b) => {
        // Online first, then alphabetical
        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
        return a.user_id.localeCompare(b.user_id);
      });
  }

  get onlineCount(): number {
    return this.users.filter(u => u.user_id !== this.state.userId && u.is_online).length;
  }

  existingDmKey(userId: string): string | null {
    const key = this.state.dmKey(this.state.userId!, userId);
    return this.conversations.find(c => c.key === key) ? key : null;
  }

  // ── Group list helpers ────────────────────────────────────────────────────

  myGroups(): Group[] {
    return this.groups.filter(g => g.members.includes(this.state.userId ?? ''));
  }

  groupMemberCount(group: Group): number {
    return group.members.length;
  }

  groupOnlineCount(group: Group): number {
    return group.members.filter(m => {
      const u = this.users.find(u => u.user_id === m);
      return u?.is_online;
    }).length;
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  send(): void {
    const text = this.messageText.trim();
    if (!text || !this.activeConversation) return;

    const conv = this.activeConversation;
    if (conv.type === 'dm') {
      this.state.sendMessage(this.labelFor(conv), text);
    } else {
      this.state.sendGroupMessage(conv.groupId!, text);
    }

    this.messageText = '';
    this.shouldScrollToBottom = true;
  }

  onEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  get activeMessages(): ChatMessage[] {
    return this.activeConversation?.messages ?? [];
  }

  isMine(msg: ChatMessage): boolean {
    return msg.from === this.state.userId;
  }

  formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(ts: string): string {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  /** Group messages by date so we can render date separators */
  get groupedMessages(): { date: string; messages: ChatMessage[] }[] {
    const msgs = this.activeMessages;
    if (!msgs.length) return [];

    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let current: { date: string; messages: ChatMessage[] } | null = null;

    for (const msg of msgs) {
      const date = this.formatDate(msg.timestamp);
      if (!current || current.date !== date) {
        current = { date, messages: [] };
        groups.push(current);
      }
      current.messages.push(msg);
    }
    return groups;
  }

  // ── Scroll & track ────────────────────────────────────────────────────────

  private scrollToBottom(): void {
    try {
      const el = this.messageList?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }

  trackByKey(_: number, conv: ChatConversation): string { return conv.key; }
  trackById(_: number, msg: ChatMessage): string        { return msg.message_id; }
  trackByUserId(_: number, u: UserEntry): string        { return u.user_id; }
  trackByGroupId(_: number, g: Group): string           { return g.group_id; }
  trackByDate(_: number, g: { date: string }): string   { return g.date; }
}