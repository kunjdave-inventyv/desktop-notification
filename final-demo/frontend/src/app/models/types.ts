// src/app/models/types.ts

export interface UserEntry {
  user_id: string;
  is_online: boolean;
}

export interface Group {
  group_id: string;
  name: string;
  members: string[];
  created_by: string;
}

export type CallState =
  | 'idle'
  | 'calling'       // outgoing ringing
  | 'ringing'       // incoming ringing
  | 'active'        // call connected
  | 'group_calling' // outgoing group ring
  | 'group_ringing' // incoming group ring
  | 'group_active'; // group call active

export interface ActiveCall {
  type: 'direct' | 'group';
  peerId?: string;          // for direct
  groupId?: string;         // for group
  groupName?: string;
  participants?: string[];  // group call participants
  direction: 'outgoing' | 'incoming';
  startTime?: number;
  rejectedCount?: number;   // ← add this
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}
