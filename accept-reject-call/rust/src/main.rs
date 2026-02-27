// use axum::{
//     extract::{
//         ws::{Message, WebSocket, WebSocketUpgrade},
//         Json, State,
//     },
//     http::Method,
//     response::IntoResponse,
//     routing::{get, post},
//     Router,
// };
// use futures_util::{SinkExt, StreamExt};
// use serde::{Deserialize, Serialize};
// use std::{collections::HashMap, sync::Arc};
// use tokio::sync::{mpsc, RwLock};
// use tower_http::cors::{Any, CorsLayer};
// use web_push::*;

// // ── Types ────────────────────────────────────────────────────────────────────

// type Tx = mpsc::UnboundedSender<Message>;

// #[derive(Debug, Clone, Serialize, Deserialize)]
// struct PushKeys {
//     p256dh: String,
//     auth: String,
// }

// #[derive(Debug, Clone, Serialize, Deserialize)]
// struct PushSubscription {
//     endpoint: String,
//     keys: PushKeys,
// }

// #[derive(Debug, Clone)]
// struct UserState {
//     tx: Option<Tx>,
//     push_sub: Option<PushSubscription>,
// }

// type UserMap = Arc<RwLock<HashMap<String, UserState>>>;

// // ── VAPID constants ──────────────────────────────────────────────────────────

// const VAPID_PRIVATE_KEY: &str = "LrQTxs53jWCHEouN3ehj70hb0MtOUOJXuJPUfXv_xJQ";
// const VAPID_PUBLIC_KEY: &str =
//     "BNabC-w7D0OU7BafBOdV_ZU2BlPkt_TEXFxqtDWRNLU8X__dPDrY0hU3VQNr2Rq10c8RCRq8dVMizjNmoNApvFc";
// const VAPID_SUBJECT: &str = "mailto:you@example.com";

// // ── WebSocket message envelope ───────────────────────────────────────────────

// #[derive(Debug, Serialize, Deserialize, Clone)]
// #[serde(tag = "type", content = "payload")]
// enum WsMessage {
//     // Client → Server
//     Register { user_id: String },
//     StorePushSub { user_id: String, subscription: PushSubscription },
//     Call { from: String, to: String },
//     Accept { from: String, to: String },
//     Reject { from: String, to: String },
//     // Server → Client
//     Registered { user_id: String },
//     IncomingCall { from: String },
//     CallAccepted { by: String },
//     CallRejected { by: String },
//     UserOnline { user_id: String },
//     UserOffline { user_id: String },
//     Error { message: String },
// }

// #[derive(Serialize)]
// struct PushPayload<'a> {
//     action: &'a str,
//     from: &'a str,
//     to: &'a str,
// }

// // ── App state shared across handlers ─────────────────────────────────────────

// #[derive(Clone)]
// struct AppState {
//     users: UserMap,
// }

// // ── main ─────────────────────────────────────────────────────────────────────

// #[tokio::main]
// async fn main() {
//     let state = AppState {
//         users: Arc::new(RwLock::new(HashMap::new())),
//     };

//     let cors = CorsLayer::new()
//         .allow_origin(Any)
//         .allow_methods([Method::GET, Method::POST])
//         .allow_headers(Any);

//     let app = Router::new()
//         .route("/vapid-public-key", get(vapid_key_handler))
//         .route("/reject-call", post(reject_call_handler))
//         .route("/ws", get(ws_handler))
//         .layer(cors)
//         .with_state(state);

//     let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
//         .await
//         .unwrap();
//     println!("Server on http://127.0.0.1:3001");
//     axum::serve(listener, app).await.unwrap();
// }

// // ── Route handlers ────────────────────────────────────────────────────────────

// /// GET /vapid-public-key
// async fn vapid_key_handler() -> impl IntoResponse {
//     Json(serde_json::json!({ "key": VAPID_PUBLIC_KEY }))
// }

// /// POST /reject-call  { "from": "...", "to": "..." }
// async fn reject_call_handler(
//     State(state): State<AppState>,
//     Json(body): Json<serde_json::Value>,
// ) -> impl IntoResponse {
//     let from = body["from"].as_str().unwrap_or("").to_string();
//     let to = body["to"].as_str().unwrap_or("").to_string();

//     let map = state.users.read().await;
//     if let Some(user_state) = map.get(&to) {
//         if let Some(caller_tx) = &user_state.tx {
//             ws_send(caller_tx, &WsMessage::CallRejected { by: from });
//         }
//     }

//     Json(serde_json::json!({ "ok": true }))
// }

// /// GET /ws  — upgrades to WebSocket
// async fn ws_handler(
//     ws: WebSocketUpgrade,
//     State(state): State<AppState>,
// ) -> impl IntoResponse {
//     ws.on_upgrade(move |socket| handle_connection(socket, state.users))
// }

// // ── WebSocket connection handler ─────────────────────────────────────────────

// async fn handle_connection(ws: WebSocket, users: UserMap) {
//     let (mut ws_tx, mut ws_rx) = ws.split();
//     let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
//     let mut my_user_id: Option<String> = None;

//     // Pump outbound messages from the mpsc channel into the WebSocket sink
//     tokio::spawn(async move {
//         while let Some(msg) = rx.recv().await {
//             if ws_tx.send(msg).await.is_err() {
//                 break;
//             }
//         }
//     });

//     // Process inbound messages
//     while let Some(result) = ws_rx.next().await {
//         let raw = match result {
//             Ok(m) => m,
//             Err(_) => break,
//         };

//         if matches!(raw, Message::Close(_)) {
//             break;
//         }

//         let text = match raw.to_text() {
//             Ok(t) => t.to_string(),
//             Err(_) => continue,
//         };

//         let parsed: WsMessage = match serde_json::from_str(&text) {
//             Ok(m) => m,
//             Err(e) => {
//                 ws_send(&tx, &WsMessage::Error { message: format!("Bad message: {}", e) });
//                 continue;
//             }
//         };

//         match parsed {
//             // ── Register ──────────────────────────────────────────────────
//             WsMessage::Register { user_id } => {
//                 my_user_id = Some(user_id.clone());

//                 // Tell the newcomer about everyone who is currently online
//                 {
//                     let map = users.read().await;
//                     for (id, state) in map.iter() {
//                         if state.tx.is_some() {
//                             ws_send(&tx, &WsMessage::UserOnline { user_id: id.clone() });
//                         }
//                     }
//                 }

//                 // Store / update this user's tx handle
//                 {
//                     let mut map = users.write().await;
//                     let entry = map.entry(user_id.clone()).or_insert(UserState {
//                         tx: None,
//                         push_sub: None,
//                     });
//                     entry.tx = Some(tx.clone());
//                 }

//                 ws_send(&tx, &WsMessage::Registered { user_id: user_id.clone() });

//                 // Broadcast UserOnline to existing peers
//                 let map = users.read().await;
//                 for (id, state) in map.iter() {
//                     if id != &user_id {
//                         if let Some(peer_tx) = &state.tx {
//                             ws_send(peer_tx, &WsMessage::UserOnline { user_id: user_id.clone() });
//                         }
//                     }
//                 }

//                 println!("[+] Registered: {}", user_id);
//             }

//             // ── StorePushSub ──────────────────────────────────────────────
//             WsMessage::StorePushSub { user_id, subscription } => {
//                 let mut map = users.write().await;
//                 let entry = map.entry(user_id.clone()).or_insert(UserState {
//                     tx: None,
//                     push_sub: None,
//                 });
//                 entry.push_sub = Some(subscription);
//                 println!("[push] stored subscription for {}", user_id);
//             }

//             // ── Call ──────────────────────────────────────────────────────
//             WsMessage::Call { from, to } => {
//                 let map = users.read().await;
//                 if let Some(target) = map.get(&to) {
//                     // Deliver in-band WS event if the callee is online
//                     if let Some(peer_tx) = &target.tx {
//                         ws_send(peer_tx, &WsMessage::IncomingCall { from: from.clone() });
//                     }

//                     // Always attempt a push notification
//                     if let Some(sub) = &target.push_sub {
//                         let payload = serde_json::to_string(&PushPayload {
//                             action: "incoming_call",
//                             from: &from,
//                             to: &to,
//                         })
//                         .unwrap();
//                         let sub_clone = sub.clone();
//                         tokio::spawn(async move {
//                             send_push_notification(&sub_clone, &payload).await;
//                         });
//                         println!("[~] Call (push): {} -> {}", from, to);
//                     } else if target.tx.is_none() {
//                         ws_send(
//                             &tx,
//                             &WsMessage::Error {
//                                 message: format!(
//                                     "User '{}' is offline and has no push subscription",
//                                     to
//                                 ),
//                             },
//                         );
//                     }
//                 } else {
//                     ws_send(
//                         &tx,
//                         &WsMessage::Error {
//                             message: format!("User '{}' has never connected", to),
//                         },
//                     );
//                 }

//                 println!("[~] Call: {} -> {}", from, to);
//             }

//             // ── Accept ────────────────────────────────────────────────────
//             WsMessage::Accept { from, to } => {
//                 let map = users.read().await;
//                 if let Some(state) = map.get(&to) {
//                     if let Some(caller_tx) = &state.tx {
//                         ws_send(caller_tx, &WsMessage::CallAccepted { by: from.clone() });
//                     }
//                     println!("[✓] {} accepted {}'s call", from, to);
//                 }
//             }

//             // ── Reject ────────────────────────────────────────────────────
//             WsMessage::Reject { from, to } => {
//                 let map = users.read().await;
//                 if let Some(state) = map.get(&to) {
//                     if let Some(caller_tx) = &state.tx {
//                         ws_send(caller_tx, &WsMessage::CallRejected { by: from.clone() });
//                     }
//                     println!("[✗] {} rejected {}'s call", from, to);
//                 }
//             }

//             _ => {}
//         }
//     }

//     // ── Cleanup on disconnect ─────────────────────────────────────────────
//     if let Some(uid) = my_user_id {
//         {
//             let mut map = users.write().await;
//             if let Some(state) = map.get_mut(&uid) {
//                 state.tx = None;
//             }
//         }

//         let map = users.read().await;
//         for (id, state) in map.iter() {
//             if id != &uid {
//                 if let Some(peer_tx) = &state.tx {
//                     ws_send(peer_tx, &WsMessage::UserOffline { user_id: uid.clone() });
//                 }
//             }
//         }

//         println!("[-] Disconnected: {}", uid);
//     }
// }

// // ── Helpers ───────────────────────────────────────────────────────────────────

// fn ws_send(tx: &Tx, msg: &WsMessage) {
//     if let Ok(json) = serde_json::to_string(msg) {
//         let _ = tx.send(Message::Text(json.into()));
//     }
// }

// async fn send_push_notification(sub: &PushSubscription, payload: &str) {
//     let subscription_info = SubscriptionInfo {
//         endpoint: sub.endpoint.clone(),
//         keys: SubscriptionKeys {
//             p256dh: sub.keys.p256dh.clone(),
//             auth: sub.keys.auth.clone(),
//         },
//     };

//     let mut builder = WebPushMessageBuilder::new(&subscription_info);
//     builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());

//     // WNS (Edge/Windows) endpoints don't support VAPID — skip it for them
//     let is_wns = sub.endpoint.contains("notify.windows.com");
//     if !is_wns {
//         let sig_builder = VapidSignatureBuilder::from_base64(
//             VAPID_PRIVATE_KEY,
//             URL_SAFE_NO_PAD,
//             &subscription_info,
//         )
//         .expect("failed to build VAPID signature");

//         match sig_builder.build() {
//             Ok(sig) => builder.set_vapid_signature(sig),
//             Err(e) => {
//                 eprintln!("VAPID sig error: {}", e);
//                 return;
//             }
//         }
//     }

//     match builder.build() {
//         Ok(msg) => {
//             let client = IsahcWebPushClient::new().unwrap();
//             let short = &sub.endpoint[..60.min(sub.endpoint.len())];
//             match client.send(msg).await {
//                 Err(e) => eprintln!("Push send error (endpoint: {}): {}", short, e),
//                 Ok(_) => {
//                     println!("[push] sent to {}", &sub.endpoint[..40.min(sub.endpoint.len())])
//                 }
//             }
//         }
//         Err(e) => eprintln!("Push build error: {}", e),
//     }
// }

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Json, State,
    },
    http::Method,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use gcp_auth::{CustomServiceAccount, TokenProvider};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tx = tokio::sync::mpsc::UnboundedSender<Message>;

/// One entry per open browser tab / connection.
#[derive(Debug, Clone)]
struct Connection {
    conn_id: String,
    tx:      Tx,
}

#[derive(Debug, Clone)]
struct UserState {
    /// One sender per open browser tab.
    connections: Vec<Connection>,
    /// One FCM token per browser / device (deduplicated).
    fcm_tokens:  Vec<String>,
}

impl UserState {
    fn new() -> Self {
        Self { connections: Vec::new(), fcm_tokens: Vec::new() }
    }

    fn is_online(&self) -> bool {
        !self.connections.is_empty()
    }

    /// Broadcast a message to every open tab for this user.
    fn broadcast(&self, msg: &WsMessage) {
        for c in &self.connections {
            ws_send(&c.tx, msg);
        }
    }

    /// Broadcast to every tab EXCEPT the one that originated the action.
    fn broadcast_except(&self, msg: &WsMessage, skip_conn_id: &str) {
        for c in &self.connections {
            if c.conn_id != skip_conn_id {
                ws_send(&c.tx, msg);
            }
        }
    }
}

type UserMap = Arc<RwLock<HashMap<String, UserState>>>;

// ── Call session ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum CallStatus {
    /// Still ringing — callee has not answered.
    Ringing,
    /// Both sides are connected.
    Active,
}

#[derive(Debug, Clone)]
struct CallSession {
    caller:          String,
    callee:          String,
    status:          CallStatus,
    /// The connection (tab) that originated the call — used so we can notify
    /// just that tab when the call ends / is answered.
    caller_conn_id:  String,
    /// Token that can cancel the ring-timeout task.
    _timeout_handle: Arc<tokio::task::AbortHandle>,
}

/// Key = callee_id  (at most one incoming call per callee at a time).
type CallMap = Arc<RwLock<HashMap<String, CallSession>>>;

// ── Constants ─────────────────────────────────────────────────────────────────

const FCM_PROJECT_ID:   &str = "notification-25684";
/// Seconds before an unanswered call is automatically terminated.
const RING_TIMEOUT_SEC: u64  = 30;

// ── App state ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    users: UserMap,
    calls: CallMap,
    auth:  Arc<dyn TokenProvider>,
    http:  reqwest::Client,
}

// ── WebSocket message envelope ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
enum WsMessage {
    // ── Client → Server ──────────────────────────────────────────────────────
    Register      { user_id: String },
    StoreFcmToken { user_id: String, token: String },
    Call          { from: String, to: String },
    Cancel        { from: String, to: String },   // caller cancels before answer
    Accept        { from: String, to: String },
    Reject        { from: String, to: String },
    CutCall       { from: String, to: String },
    // ── Server → Client ──────────────────────────────────────────────────────
    Registered    { user_id: String, conn_id: String },
    IncomingCall  { from: String },
    CallAccepted  { by: String },
    CallRejected  { by: String },
    CallCancelled { by: String },   // sent to callee when caller cancels
    CallEnded     { reason: String }, // timeout / busy / etc.
    UserOnline    { user_id: String },
    UserOffline   { user_id: String },
    Error         { message: String },
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let sa_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS")
        .expect("GOOGLE_APPLICATION_CREDENTIALS must be set");

    let service_account = CustomServiceAccount::from_file(PathBuf::from(&sa_path))
        .expect("Failed to load service account JSON");

    let auth: Arc<dyn TokenProvider> = Arc::new(service_account);

    let scopes = &["https://www.googleapis.com/auth/firebase.messaging"];
    match auth.token(scopes).await {
        Ok(t)  => println!("[fcm] credentials OK — prefix: {}…", &t.as_str()[..20]),
        Err(e) => eprintln!("[fcm] WARNING: startup credential check failed: {e}"),
    }

    let state = AppState {
        users: Arc::new(RwLock::new(HashMap::new())),
        calls: Arc::new(RwLock::new(HashMap::new())),
        auth,
        http:  reqwest::Client::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/ping", get(ping_handler))
        .route("/ws",   get(ws_handler))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await.unwrap();
    println!("Server on http://127.0.0.1:3001");
    axum::serve(listener, app).await.unwrap();
}

// ── Route handlers ────────────────────────────────────────────────────────────

async fn ping_handler() -> impl IntoResponse {
    Json(serde_json::json!({ "message": "pong" }))
}

async fn ws_handler(
    ws:    WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_connection(socket, state))
}

// ── WebSocket connection handler ──────────────────────────────────────────────

async fn handle_connection(ws: WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Unique ID for this browser tab.
    let conn_id = Uuid::new_v4().to_string();
    let mut my_user_id: Option<String> = None;

    // Dedicated writer task — owns the write half of the WebSocket.
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() { break; }
        }
    });

    while let Some(result) = ws_rx.next().await {
        let raw = match result { Ok(m) => m, Err(_) => break };
        if matches!(raw, Message::Close(_)) { break; }
        let text = match raw.to_text() { Ok(t) => t.to_string(), Err(_) => continue };

        let parsed: WsMessage = match serde_json::from_str(&text) {
            Ok(m)  => m,
            Err(e) => {
                ws_send(&tx, &WsMessage::Error { message: format!("Bad message: {e}") });
                continue;
            }
        };

        match parsed {

            // ── Register ──────────────────────────────────────────────────────
            WsMessage::Register { user_id } => {
                my_user_id = Some(user_id.clone());

                // Tell the new tab who is currently online.
                {
                    let map = state.users.read().await;
                    for (id, s) in map.iter() {
                        if s.is_online() {
                            ws_send(&tx, &WsMessage::UserOnline { user_id: id.clone() });
                        }
                    }
                }

                // Add this connection to the user's tab list.
                {
                    let mut map = state.users.write().await;
                    let entry = map.entry(user_id.clone()).or_insert_with(UserState::new);
                    entry.connections.push(Connection {
                        conn_id: conn_id.clone(),
                        tx:      tx.clone(),
                    });
                }

                ws_send(&tx, &WsMessage::Registered {
                    user_id: user_id.clone(),
                    conn_id: conn_id.clone(),
                });

                // Notify all other users (and their other tabs) that this user is online.
                {
                    let map = state.users.read().await;
                    for (id, s) in map.iter() {
                        if id != &user_id {
                            s.broadcast(&WsMessage::UserOnline { user_id: user_id.clone() });
                        }
                    }
                }

                println!("[+] {user_id} connected (tab {conn_id})");
            }

            // ── StoreFcmToken ─────────────────────────────────────────────────
            WsMessage::StoreFcmToken { user_id, token } => {
                let mut map = state.users.write().await;
                let entry = map.entry(user_id.clone()).or_insert_with(UserState::new);
                if !entry.fcm_tokens.contains(&token) {
                    entry.fcm_tokens.push(token);
                }
                println!("[fcm] token stored for {user_id} ({} total)", entry.fcm_tokens.len());
            }

            // ── Call ──────────────────────────────────────────────────────────
            WsMessage::Call { from, to } => {
                // --- Guard: self-call ---
                if from == to {
                    ws_send(&tx, &WsMessage::Error { message: "Cannot call yourself".into() });
                    continue;
                }

                // --- Guard: `from` must match the registered user for this tab ---
                if my_user_id.as_deref() != Some(&from) {
                    ws_send(&tx, &WsMessage::Error { message: "Identity mismatch".into() });
                    continue;
                }

                let users = state.users.read().await;
                let calls = state.calls.read().await;

                // --- Guard: callee must exist ---
                let Some(callee_state) = users.get(&to) else {
                    ws_send(&tx, &WsMessage::Error {
                        message: format!("User '{to}' has never connected"),
                    });
                    continue;
                };

                // --- Guard: callee is busy (on another call) ---
                if let Some(existing) = calls.get(&to) {
                    // Edge-case: the same caller retrying — just ignore silently.
                    if existing.caller != from {
                        ws_send(&tx, &WsMessage::CallEnded {
                            reason: format!("'{to}' is on another call"),
                        });
                        continue;
                    }
                }

                // --- Guard: caller is already in a call (either side) ---
                let caller_busy = calls.values().any(|s| {
                    (s.caller == from || s.callee == from)
                        && s.status == CallStatus::Active
                });
                if caller_busy {
                    ws_send(&tx, &WsMessage::Error {
                        message: "You are already on a call".into(),
                    });
                    continue;
                }

                drop(calls);

                // --- Deliver IncomingCall to ALL callee tabs (edge-case #1) ---
                callee_state.broadcast(&WsMessage::IncomingCall { from: from.clone() });

                // --- Send FCM to all registered devices (edge-case #1) ---
                let fcm_tokens = callee_state.fcm_tokens.clone();
                if !fcm_tokens.is_empty() {
                    let (f, t2, http) = (from.clone(), to.clone(), state.http.clone());
                    let auth_clone = state.auth.clone();
                    tokio::spawn(async move {
                        for token in fcm_tokens {
                            send_fcm_notification(&token, &f, &t2, auth_clone.as_ref(), &http).await;
                        }
                    });
                } else if !callee_state.is_online() {
                    ws_send(&tx, &WsMessage::Error {
                        message: format!("'{to}' is offline and has no FCM token"),
                    });
                    continue;
                }

                drop(users);

                // --- Create call session with ring timeout (edge-case #4) ---
                let callee_id     = to.clone();
                let caller_id     = from.clone();
                let calls_timeout = state.calls.clone();
                let users_timeout = state.users.clone();
                let caller_tx     = tx.clone();

                let timeout_task = tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(RING_TIMEOUT_SEC)).await;

                    let mut calls = calls_timeout.write().await;
                    if let Some(session) = calls.get(&callee_id) {
                        // Only fire if still ringing (not already answered).
                        if session.status == CallStatus::Ringing && session.caller == caller_id {
                            calls.remove(&callee_id);
                            drop(calls);

                            // Notify caller (the originating tab) — no answer.
                            ws_send(&caller_tx, &WsMessage::CallEnded {
                                reason: "No answer".into(),
                            });

                            // Dismiss the ringing UI on all callee tabs.
                            let users = users_timeout.read().await;
                            if let Some(cs) = users.get(&callee_id) {
                                cs.broadcast(&WsMessage::CallEnded {
                                    reason: "No answer".into(),
                                });
                            }
                            println!("[⏱] Call {caller_id} -> {callee_id} timed out");
                        }
                    }
                });

                let abort_handle = Arc::new(timeout_task.abort_handle());

                let mut calls = state.calls.write().await;
                calls.insert(to.clone(), CallSession {
                    caller:          from.clone(),
                    callee:          to.clone(),
                    status:          CallStatus::Ringing,
                    caller_conn_id:  conn_id.clone(),
                    _timeout_handle: abort_handle,
                });

                println!("[~] Call (ringing): {from} -> {to}");
            }

            // ── CutCall (either side ends active call) ───────────────────────────────
            WsMessage::CutCall { from, to } => {
                // Guard: identity must match this tab
                if my_user_id.as_deref() != Some(&from) {
                    ws_send(&tx, &WsMessage::Error { message: "Identity mismatch".into() });
                    continue;
                }

                let mut calls = state.calls.write().await;

                // Case 1: `from` is callee (call keyed by callee)
                if let Some(session) = calls.get(&from) {
                    if session.caller == to && session.status == CallStatus::Active {
                        calls.remove(&from);
                        drop(calls);

                        let users = state.users.read().await;

                        // Notify caller (all tabs)
                        if let Some(caller_state) = users.get(&to) {
                            caller_state.broadcast(&WsMessage::CallEnded {
                                reason: format!("Call ended by {from}"),
                            });
                        }

                        // Notify callee (all other tabs)
                        if let Some(callee_state) = users.get(&from) {
                            callee_state.broadcast_except(
                                &WsMessage::CallEnded {
                                    reason: "You ended the call".into(),
                                },
                                &conn_id,
                            );
                        }

                        ws_send(&tx, &WsMessage::CallEnded {
                            reason: "Call ended".into(),
                        });

                        println!("[☎] {from} ended call with {to}");
                        continue;
                    }
                }

                // Case 2: `from` is caller
                let callee_key = calls
                    .iter()
                    .find(|(_, s)| s.caller == from && s.callee == to && s.status == CallStatus::Active)
                    .map(|(k, _)| k.clone());

                if let Some(callee_id) = callee_key {
                    calls.remove(&callee_id);
                    drop(calls);

                    let users = state.users.read().await;

                    // Notify callee (all tabs)
                    if let Some(callee_state) = users.get(&to) {
                        callee_state.broadcast(&WsMessage::CallEnded {
                            reason: format!("Call ended by {from}"),
                        });
                    }

                    // Notify caller (other tabs)
                    if let Some(caller_state) = users.get(&from) {
                        caller_state.broadcast_except(
                            &WsMessage::CallEnded {
                                reason: "You ended the call".into(),
                            },
                            &conn_id,
                        );
                    }

                    ws_send(&tx, &WsMessage::CallEnded {
                        reason: "Call ended".into(),
                    });

                    println!("[☎] {from} ended call with {to}");
                    continue;
                }

                ws_send(&tx, &WsMessage::Error {
                    message: "No active call to cut".into(),
                });
            }
            // ── Cancel (caller hangs up while ringing) ────────────────────────
            WsMessage::Cancel { from, to } => {
                // Guard: only the actual caller can cancel.
                if my_user_id.as_deref() != Some(&from) {
                    ws_send(&tx, &WsMessage::Error { message: "Identity mismatch".into() });
                    continue;
                }

                let mut calls = state.calls.write().await;
                let valid = calls.get(&to)
                    .map(|s| s.caller == from && s.status == CallStatus::Ringing)
                    .unwrap_or(false);

                if valid {
                    // Dropping the session aborts the timeout task via AbortHandle.
                    calls.remove(&to);
                    drop(calls);

                    // Dismiss IncomingCall UI on ALL callee tabs (edge-case #3 & #5).
                    let users = state.users.read().await;
                    if let Some(cs) = users.get(&to) {
                        cs.broadcast(&WsMessage::CallCancelled { by: from.clone() });
                    }
                    println!("[✗] {from} cancelled call to {to}");
                }
            }

            // ── Accept ────────────────────────────────────────────────────────
            WsMessage::Accept { from, to } => {
                // `from` = callee accepting, `to` = caller.
                if my_user_id.as_deref() != Some(&from) {
                    ws_send(&tx, &WsMessage::Error { message: "Identity mismatch".into() });
                    continue;
                }

                let mut calls = state.calls.write().await;

                // The call is keyed by callee = `from`.
                let Some(session) = calls.get_mut(&from) else {
                    ws_send(&tx, &WsMessage::Error { message: "No active call to accept".into() });
                    continue;
                };

                if session.caller != to {
                    ws_send(&tx, &WsMessage::Error { message: "Caller mismatch".into() });
                    continue;
                }

                if session.status == CallStatus::Active {
                    // Already accepted by another tab — tell this tab to stand down.
                    ws_send(&tx, &WsMessage::CallEnded {
                        reason: "Call accepted on another tab".into(),
                    });
                    continue;
                }

                session.status = CallStatus::Active;
                let caller_conn_id = session.caller_conn_id.clone();
                drop(calls);

                let users = state.users.read().await;

                // Notify the specific caller tab.
                if let Some(caller_state) = users.get(&to) {
                    for c in &caller_state.connections {
                        if c.conn_id == caller_conn_id {
                            ws_send(&c.tx, &WsMessage::CallAccepted { by: from.clone() });
                            break;
                        }
                    }
                }

                // Tell all OTHER callee tabs to dismiss their ringing UI (edge-case #5).
                if let Some(callee_state) = users.get(&from) {
                    callee_state.broadcast_except(
                        &WsMessage::CallEnded { reason: "Answered on another tab".into() },
                        &conn_id,
                    );
                }

                // Tell all OTHER caller tabs that the call is ongoing (edge-case in brief).
                if let Some(caller_state) = users.get(&to) {
                    caller_state.broadcast_except(
                        &WsMessage::CallAccepted { by: from.clone() },
                        &caller_conn_id,
                    );
                }

                println!("[✓] {from} accepted call from {to}");
            }

            // ── Reject ────────────────────────────────────────────────────────
            WsMessage::Reject { from, to } => {
                // `from` = callee rejecting, `to` = caller.
                if my_user_id.as_deref() != Some(&from) {
                    ws_send(&tx, &WsMessage::Error { message: "Identity mismatch".into() });
                    continue;
                }

                let mut calls = state.calls.write().await;
                let valid = calls.get(&from)
                    .map(|s| s.caller == to && s.status == CallStatus::Ringing)
                    .unwrap_or(false);

                if !valid {
                    ws_send(&tx, &WsMessage::Error { message: "No ringing call to reject".into() });
                    continue;
                }

                let caller_conn_id = calls[&from].caller_conn_id.clone();
                calls.remove(&from);
                drop(calls);

                let users = state.users.read().await;

                // Notify the originating caller tab.
                if let Some(caller_state) = users.get(&to) {
                    for c in &caller_state.connections {
                        if c.conn_id == caller_conn_id {
                            ws_send(&c.tx, &WsMessage::CallRejected { by: from.clone() });
                            break;
                        }
                    }
                }

                // Dismiss ringing on all OTHER callee tabs (edge-case #5).
                if let Some(callee_state) = users.get(&from) {
                    callee_state.broadcast_except(
                        &WsMessage::CallEnded { reason: "Rejected on another tab".into() },
                        &conn_id,
                    );
                }

                println!("[✗] {from} rejected call from {to}");
            }

            _ => {}
        }
    }

    // ── Cleanup on disconnect ─────────────────────────────────────────────────
    if let Some(uid) = my_user_id {
        let went_fully_offline = {
            let mut map = state.users.write().await;
            if let Some(s) = map.get_mut(&uid) {
                s.connections.retain(|c| c.conn_id != conn_id);
                s.connections.is_empty()
            } else {
                false
            }
        };

        // If the user still has other tabs open, don't send UserOffline.
        if went_fully_offline {
            // If this user was in a ringing or active call, clean it up.
            let mut calls = state.calls.write().await;

            // Was this user a callee?
            if let Some(session) = calls.remove(&uid) {
                let caller_id = session.caller.clone();
                drop(calls);
                let users = state.users.read().await;
                if let Some(cs) = users.get(&caller_id) {
                    cs.broadcast(&WsMessage::CallEnded {
                        reason: format!("'{uid}' disconnected"),
                    });
                }
            } else {
                // Was this user a caller?
                let callee_of_user = calls
                    .iter()
                    .find(|(_, s)| s.caller == uid)
                    .map(|(k, _)| k.clone());

                if let Some(callee_id) = callee_of_user {
                    calls.remove(&callee_id);
                    drop(calls);
                    let users = state.users.read().await;
                    if let Some(cs) = users.get(&callee_id) {
                        cs.broadcast(&WsMessage::CallCancelled { by: uid.clone() });
                    }
                } else {
                    drop(calls);
                }
            }

            // Broadcast UserOffline to everyone.
            let map = state.users.read().await;
            for (id, s) in map.iter() {
                if id != &uid {
                    s.broadcast(&WsMessage::UserOffline { user_id: uid.clone() });
                }
            }
            println!("[-] {uid} fully offline");
        } else {
            println!("[-] {uid} closed tab {conn_id} (still has other tabs)");
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ws_send(tx: &Tx, msg: &WsMessage) {
    if let Ok(json) = serde_json::to_string(msg) {
        let _ = tx.send(Message::Text(json.into()));
    }
}

async fn send_fcm_notification(
    fcm_token: &str,
    from:      &str,
    to:        &str,
    auth:      &dyn TokenProvider,
    http:      &reqwest::Client,
) {
    let scopes = &["https://www.googleapis.com/auth/firebase.messaging"];
    let token: Arc<gcp_auth::Token> = match auth.token(scopes).await {
        Ok(t)  => t,
        Err(e) => { eprintln!("[fcm] token error: {e}"); return; }
    };

    let url = format!(
        "https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send"
    );

    let body = serde_json::json!({
        "message": {
            "token": fcm_token,
            "data": {
                "action": "incoming_call",
                "caller": from,
                "callee": to,
                "title":  format!("📞 Incoming call from {from}"),
                "body":   "Tap Accept to answer",
            },
            "android": { "priority": "high" },
            "apns":    { "headers": { "apns-priority": "10" } },
            "webpush": { "headers": { "Urgency": "high" } },
        }
    });

    match http.post(&url).bearer_auth(token.as_str()).json(&body).send().await {
        Ok(r) if r.status().is_success() => {
            println!("[fcm] ✓ push sent to …{}", &fcm_token[fcm_token.len().saturating_sub(12)..]);
        }
        Ok(r) => {
            eprintln!("[fcm] ✗ HTTP {}: {}", r.status(), r.text().await.unwrap_or_default());
        }
        Err(e) => eprintln!("[fcm] request error: {e}"),
    }
}