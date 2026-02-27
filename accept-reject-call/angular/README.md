# Signal — Angular P2P Calling App

A peer-to-peer WebSocket calling application built with Angular 17 (standalone components) + Tailwind CSS. Converted from the original React/JSX implementation.

## 🏗️ Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── register-screen.component.ts    ← Login/registration UI
│   │   ├── call-screen.component.ts        ← Main calling screen
│   │   ├── incoming-call-modal.component.ts ← Incoming call UI
│   │   └── outgoing-call-modal.component.ts ← Outgoing call UI
│   ├── services/
│   │   ├── websocket.service.ts            ← WS connection (like useWebSocket.js)
│   │   ├── push-subscription.service.ts   ← Push notifications (like usePushSubscription.js)
│   │   └── session.service.ts             ← Session state management
│   └── app.component.ts                   ← Root component (like App.jsx)
├── assets/
│   └── sw.js                              ← Service Worker for push notifications
├── index.html
├── main.ts
└── styles.css                             ← Tailwind + custom animations
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Angular CLI: `npm install -g @angular/cli`

### Install & Run

```bash
# Install dependencies
npm install

# Start dev server
npm start
```

Open http://localhost:4200 in two browser tabs:
- Tab 1: User ID = `alice`, Peer ID = `bob`
- Tab 2: User ID = `bob`, Peer ID = `alice`

### Backend

This app requires a WebSocket server running at `ws://localhost:3001/ws`.

The backend should support these message types:

| Message | Direction | Payload |
|---------|-----------|---------|
| `Register` | client → server | `{ user_id }` |
| `Registered` | server → client | — |
| `PeerOnlineAck` | server → client | `{ user_id }` |
| `UserOnline` | server → client | `{ user_id }` |
| `UserOffline` | server → client | `{ user_id }` |
| `Call` | client → server | `{ from, to }` |
| `IncomingCall` | server → client | `{ from }` |
| `Accept` | client → server | `{ from, to }` |
| `CallAccepted` | server → client | `{ by }` |
| `Reject` | client → server | `{ from, to }` |
| `CallRejected` | server → client | `{ by }` |
| `StorePushSub` | client → server | `{ user_id, subscription }` |
| `Error` | server → client | `{ message }` |

The backend also needs:
- `GET /vapid-public-key` → `{ key: string }` (VAPID public key for push)

## 🔧 Configuration

Edit the WS URL and API base in the service files:

```typescript
// src/app/services/websocket.service.ts
const WS_URL = 'ws://localhost:3001/ws';

// src/app/services/push-subscription.service.ts
const res = await fetch('http://localhost:3001/vapid-public-key');
```

## ✨ Features

- **WebSocket signaling** — real-time presence and call events
- **Push notifications** — notify offline peers via Web Push API
- **Service Worker** — handles push notification click actions
- **Deep link support** — open app from notification with auto-accept
- **Dark UI** — styled with Tailwind CSS (gray-950 theme)
- **Standalone components** — Angular 17 modern API, no NgModules needed

## 🔄 React → Angular Mapping

| React | Angular |
|-------|---------|
| `useState` | Component properties + `ChangeDetectorRef` |
| `useEffect` | `ngOnInit` / `ngOnDestroy` |
| `useCallback` | Class methods |
| `useRef` | `@ViewChild` or private fields |
| Custom hook `useWebSocket` | `WebSocketService` (Injectable) |
| Custom hook `usePushSubscription` | `PushSubscriptionService` (Injectable) |
| Context / prop drilling | `SessionService` with Angular signals |
| JSX | Angular templates (HTML) |
| `className` | `class` / `[class]` |
| `onClick` | `(click)` |
| `onChange` + `value` | `[(ngModel)]` |
| `{condition && <Component />}` | `@if (condition) { <component /> }` |
