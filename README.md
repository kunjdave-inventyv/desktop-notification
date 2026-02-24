# Signal — WebSocket P2P Call App

A minimal peer-to-peer call signaling demo built with **Rust (warp + tokio-tungstenite)** for the backend and **React + Tailwind CSS** for the frontend.

---

## Project Structure

```
ws-call-app/
├── backend/          # Rust WebSocket server
│   ├── Cargo.toml
│   └── src/main.rs
└── frontend/         # React + Tailwind Vite app
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── hooks/
        │   └── useWebSocket.js
        └── components/
            ├── RegisterScreen.jsx
            ├── CallScreen.jsx
            ├── IncomingCallModal.jsx
            └── OutgoingCallModal.jsx
```

---

## Running the Backend (Rust)

```bash
cd backend
cargo run
```

The WebSocket server will start on `ws://localhost:3001/ws`.

---

## Running the Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## How to Test

1. Start the Rust backend (`cargo run` in `backend/`).
2. Start the React frontend (`npm run dev` in `frontend/`).
3. Open **two browser tabs** at `http://localhost:5173`.
4. **Tab 1**: Enter `alice` as Your ID, `bob` as Peer ID → click **Connect**.
5. **Tab 2**: Enter `bob` as Your ID, `alice` as Peer ID → click **Connect**.
6. Both tabs will show the peer as **Online**.
7. Click **Call bob** in Tab 1 — Tab 2 shows an **incoming call modal**.
8. Accept or Reject in Tab 2 — Tab 1 updates accordingly.

---

## WebSocket Message Protocol

All messages are JSON with `{ "type": "...", "payload": { ... } }`.

| Direction | Type | Payload |
|-----------|------|---------|
| C→S | `Register` | `{ user_id }` |
| C→S | `Call` | `{ from, to }` |
| C→S | `Accept` | `{ from, to }` |
| C→S | `Reject` | `{ from, to }` |
| S→C | `Registered` | `{ user_id }` |
| S→C | `IncomingCall` | `{ from }` |
| S→C | `CallAccepted` | `{ by }` |
| S→C | `CallRejected` | `{ by }` |
| S→C | `UserOnline` | `{ user_id }` |
| S→C | `UserOffline` | `{ user_id }` |
| S→C | `Error` | `{ message }` |
