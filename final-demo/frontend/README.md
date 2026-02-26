# CallDemo — Angular Frontend

A minimal real-time calling demo with Socket.IO, group management, and FCM push notifications.

## Features

- **Register** with just your name (no passwords)
- **User list** — see all registered users with online/offline status
- **1-to-1 calls** — call any user (even offline via FCM push)
- **Groups** — create groups, add/remove members, see group members
- **Group calls** — ring everyone in a group at once
- **Push notifications** — FCM background notifications when app is not in focus
- **Multi-tab** — handles accept/reject/cancel across multiple browser tabs

## Project Structure

```
src/
├── app/
│   ├── models/types.ts                      — Shared interfaces
│   ├── services/
│   │   ├── websocket.service.ts             — Raw socket.io wrapper
│   │   ├── push-subscription.service.ts     — FCM token + SW bridge
│   │   └── app-state.service.ts             — Central state + call logic
│   └── components/
│       ├── register/                        — Login screen
│       ├── user-list/                       — People panel
│       ├── group-manager/                   — Groups panel
│       ├── call-screen/                     — Fullscreen call overlay
│       └── notification-bar/               — Toast notifications
├── firebase-messaging-sw.js                 — FCM service worker
├── styles.css                               — Global design tokens
└── main.ts
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Firebase (if using your own project)
Update the Firebase config in:
- `src/app/services/push-subscription.service.ts`
- `src/firebase-messaging-sw.js`

Both files use the same Firebase project config. Make sure they match.

### 3. Start the backend (Rust)
```bash
# In your Rust project directory
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json cargo run
# Server starts at http://localhost:3001
```

### 4. Start Angular dev server
```bash
npm start
# Opens at http://localhost:4200
```

### 5. Test in multiple browser tabs
- Open `http://localhost:4200` in Tab 1, register as "Alice"
- Open `http://localhost:4200` in Tab 2, register as "Bob"
- Click the ☎ button next to any user to call them

## Backend Event Reference

### Client → Server
| Event | Payload |
|-------|---------|
| `register` | `{ user_id }` |
| `store_fcm_token` | `{ user_id, token }` |
| `call` | `{ from, to }` |
| `cancel` | `{ from, to }` |
| `accept` | `{ from, to }` |
| `reject` | `{ from, to }` |
| `cut_call` | `{ from, to }` |
| `create_group` | `{ created_by, name, members[] }` |
| `add_group_member` | `{ group_id, added_by, user_id }` |
| `remove_group_member` | `{ group_id, removed_by, user_id }` |
| `group_call` | `{ from, group_id }` |
| `group_accept` | `{ from, group_id }` |
| `group_reject` | `{ from, group_id }` |
| `group_cut` | `{ from, group_id }` |

### Server → Client
`registered`, `register_error`, `user_list`, `user_online`, `user_offline`,
`incoming_call`, `call_accepted`, `call_rejected`, `call_cancelled`, `call_ended`,
`group_created`, `group_updated`, `group_deleted`,
`group_incoming_call`, `group_member_joined`, `group_member_left`, `group_call_ended`,
`error`

## FCM Push Notifications

Push notifications are sent by the Rust backend via FCM when:
- The callee is offline (no socket connection) but has a registered FCM token
- The `store_fcm_token` event must be sent after registering to enable push

The service worker (`firebase-messaging-sw.js`) handles:
- Showing the notification with Accept/Decline actions
- Posting messages back to the app when buttons are tapped
- Dismissing stale notifications when the call is cancelled or answered elsewhere
