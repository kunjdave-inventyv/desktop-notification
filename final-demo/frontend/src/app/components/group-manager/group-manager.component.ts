// src/app/components/group-manager/group-manager.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { Group } from '../../models/types';

@Component({
  selector: 'app-group-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-manager.component.html',
  styleUrls: ['./group-manager.component.css'],
})
export class GroupManagerComponent {

  showCreate = false;
  newGroupName = '';
  selectedMembers: string[] = [];
  expandedGroup: string | null = null;

  constructor(public state: AppStateService) {}

  get callIdle(): boolean { return this.state.callState$.value === 'idle'; }

  toggleCreate(): void {
    this.showCreate = !this.showCreate;
    if (!this.showCreate) this.resetForm();
  }

  toggleMember(uid: string): void {
    const idx = this.selectedMembers.indexOf(uid);
    if (idx >= 0) this.selectedMembers.splice(idx, 1);
    else this.selectedMembers.push(uid);
  }

  isMemberSelected(uid: string): boolean {
    return this.selectedMembers.includes(uid);
  }

  createGroup(): void {
    const name = this.newGroupName.trim();
    if (!name) return;
    this.state.createGroup(name, this.selectedMembers);
    this.resetForm();
    this.showCreate = false;
  }

  resetForm(): void {
    this.newGroupName = '';
    this.selectedMembers = [];
  }

  toggleExpand(groupId: string): void {
    this.expandedGroup = this.expandedGroup === groupId ? null : groupId;
  }

  callGroup(groupId: string): void {
    if (!this.callIdle) return;
    this.state.makeGroupCall(groupId);
  }

  addMember(groupId: string): void {
    const uid = prompt('Enter user ID to add:');
    if (uid) this.state.addGroupMember(groupId, uid.trim());
  }

  removeMember(groupId: string, uid: string): void {
    this.state.removeGroupMember(groupId, uid);
  }

  isMe(uid: string): boolean { return uid === this.state.userId; }
  isCreator(group: Group): boolean { return group.created_by === this.state.userId; }

  otherUsers(): string[] {
    return this.state.users$.value.map(u => u.user_id);
  }

  trackGroup(_: number, g: Group) { return g.group_id; }
}
