// src/app/app.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from './services/app-state.service';
import { RegisterComponent } from './components/register/register.component';
import { UserListComponent } from './components/user-list/user-list.component';
import { CallScreenComponent } from './components/call-screen/call-screen.component';
import { GroupManagerComponent } from './components/group-manager/group-manager.component';
import { NotificationBarComponent } from './components/notification-bar/notification-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RegisterComponent,
    UserListComponent,
    CallScreenComponent,
    GroupManagerComponent,
    NotificationBarComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  constructor(public state: AppStateService) {}

  get loggedIn(): boolean { return !!this.state.currentUserId$.value; }

  ngOnInit(): void {
    // Handle URL params set by the service worker when the user taps
    // Accept/Reject on a push notification and no tab was already open.
    // The SW opens: /?userId=BOB&peerId=ALICE&action=accept&callType=direct
    //           or: /?userId=BOB&groupId=XYZ&action=accept&callType=group
    //
    // We read these params, auto-register the user, then once registered
    // fire the appropriate accept/reject action.
    const params   = new URLSearchParams(window.location.search);
    const userId   = params.get('userId');
    const peerId   = params.get('peerId');
    const groupId  = params.get('groupId');
    const action   = params.get('action');   // 'accept' | 'reject'
    const callType = params.get('callType'); // 'direct' | 'group'

    if (!userId || !action) return;

    // Wait until the user is registered (they may need to log in manually,
    // or we auto-trigger once they're registered)
    const sub = this.state.currentUserId$.subscribe(uid => {
      if (!uid) return; // not registered yet

      // Give the socket a brief moment to receive any pending incoming_call /
      // group_incoming_call events before we try to act on them.
      setTimeout(() => {
        if (action === 'accept') {
          if (callType === 'group' && groupId) {
            this.state.acceptGroupCallById(groupId);
          } else if (peerId) {
            this.state.acceptCall(peerId);
          }
        } else if (action === 'reject') {
          if (callType === 'group' && groupId) {
            this.state.rejectGroupCallById(groupId);
          } else if (peerId) {
            this.state.rejectCall(peerId);
          }
        }

        // Clean up the URL so refreshing doesn't re-trigger
        window.history.replaceState({}, '', '/');
        sub.unsubscribe();
      }, 800);
    });
  }
}