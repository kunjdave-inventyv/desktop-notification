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

// ── Types ────────────────────────────────────────────────────────────────────

type Tx = tokio::sync::mpsc::UnboundedSender<Message>;

#[derive(Debug, Clone)]
struct UserState {
    tx:        Option<Tx>,
    fcm_token: Option<String>,
}

type UserMap = Arc<RwLock<HashMap<String, UserState>>>;

// ── Constants ─────────────────────────────────────────────────────────────────

const FCM_PROJECT_ID: &str = "notification-25684";

// ── App state ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    users: UserMap,
    auth:  Arc<dyn TokenProvider>,
    http:  reqwest::Client,
}

// ── WebSocket message envelope ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
enum WsMessage {
    Register      { user_id: String },
    StoreFcmToken { user_id: String, token: String },
    Call          { from: String, to: String },
    Accept        { from: String, to: String },
    Reject        { from: String, to: String },
    Registered    { user_id: String },
    IncomingCall  { from: String },
    CallAccepted  { by: String },
    CallRejected  { by: String },
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

    // Startup credential check
    let scopes = &["https://www.googleapis.com/auth/firebase.messaging"];
    match auth.token(scopes).await {
        Ok(t)  => println!("[fcm] credentials OK — prefix: {}…", &t.as_str()[..20]),
        Err(e) => eprintln!("[fcm] WARNING: startup credential check failed: {e}"),
    }

    let state = AppState {
        users: Arc::new(RwLock::new(HashMap::new())),
        auth,
        http:  reqwest::Client::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/reject-call", post(reject_call_handler))
        .route("/ping",        get(ping_handler))
        .route("/ws",          get(ws_handler))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await.unwrap();
    println!("Server on http://127.0.0.1:3001");
    axum::serve(listener, app).await.unwrap();
}

// ── Route handlers ────────────────────────────────────────────────────────────

async fn ping_handler() -> impl IntoResponse {
    let cred_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS")
        .unwrap_or_else(|_| "<not set>".into());
    println!("GOOGLE_APPLICATION_CREDENTIALS: {cred_path}");
    Json(serde_json::json!({
        "message": "Successfully pinged test",
        "file": cred_path,
    }))
}

async fn reject_call_handler(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let from = body["from"].as_str().unwrap_or("").to_string();
    let to   = body["to"].as_str().unwrap_or("").to_string();
    let map  = state.users.read().await;
    if let Some(s) = map.get(&to) {
        if let Some(tx) = &s.tx {
            ws_send(tx, &WsMessage::CallRejected { by: from });
        }
    }
    Json(serde_json::json!({ "ok": true }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_connection(socket, state))
}

// ── WebSocket connection handler ──────────────────────────────────────────────

async fn handle_connection(ws: WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let mut my_user_id: Option<String> = None;

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

            WsMessage::Register { user_id } => {
                my_user_id = Some(user_id.clone());
                {
                    let map = state.users.read().await;
                    for (id, s) in map.iter() {
                        if s.tx.is_some() {
                            ws_send(&tx, &WsMessage::UserOnline { user_id: id.clone() });
                        }
                    }
                }
                {
                    let mut map = state.users.write().await;
                    let e = map.entry(user_id.clone()).or_insert(UserState {
                        tx: None, fcm_token: None,
                    });
                    e.tx = Some(tx.clone());
                }
                ws_send(&tx, &WsMessage::Registered { user_id: user_id.clone() });
                {
                    let map = state.users.read().await;
                    for (id, s) in map.iter() {
                        if id != &user_id {
                            if let Some(peer_tx) = &s.tx {
                                ws_send(peer_tx, &WsMessage::UserOnline { user_id: user_id.clone() });
                            }
                        }
                    }
                }
                println!("[+] Registered: {user_id}");
            }

            WsMessage::StoreFcmToken { user_id, token } => {
                let mut map = state.users.write().await;
                let e = map.entry(user_id.clone()).or_insert(UserState {
                    tx: None, fcm_token: None,
                });
                e.fcm_token = Some(token);
                println!("[fcm] token stored for {user_id}");
            }

            WsMessage::Call { from, to } => {
                let map = state.users.read().await;
                if let Some(target) = map.get(&to) {
                    // If user is online via WebSocket, deliver directly
                    if let Some(peer_tx) = &target.tx {
                        ws_send(peer_tx, &WsMessage::IncomingCall { from: from.clone() });
                        println!("[~] Call (WS): {from} -> {to}");
                    }

                    // Always attempt FCM push so the callee gets a notification
                    // even when the app is backgrounded / closed (mirrors
                    // getMessaging().sendEachForMulticast() behaviour in JS).
                    if let Some(fcm_token) = &target.fcm_token {
                        let (tok, f, t2, http) = (
                            fcm_token.clone(), from.clone(), to.clone(),
                            state.http.clone(),
                        );
                        let auth_clone = state.auth.clone();
                        tokio::spawn(async move {
                            send_fcm_notification(&tok, &f, &t2, auth_clone.as_ref(), &http).await;
                        });
                        println!("[~] Call (FCM push): {from} -> {to}");
                    } else if target.tx.is_none() {
                        // Offline and no FCM token — nothing we can do
                        ws_send(&tx, &WsMessage::Error {
                            message: format!(
                                "User '{to}' is offline and has no FCM token registered"
                            ),
                        });
                    }
                } else {
                    ws_send(&tx, &WsMessage::Error {
                        message: format!("User '{to}' has never connected"),
                    });
                }
            }

            WsMessage::Accept { from, to } => {
                let map = state.users.read().await;
                if let Some(s) = map.get(&to) {
                    if let Some(caller_tx) = &s.tx {
                        ws_send(caller_tx, &WsMessage::CallAccepted { by: from.clone() });
                    }
                    println!("[✓] {from} accepted {to}'s call");
                }
            }

            WsMessage::Reject { from, to } => {
                let map = state.users.read().await;
                if let Some(s) = map.get(&to) {
                    if let Some(caller_tx) = &s.tx {
                        ws_send(caller_tx, &WsMessage::CallRejected { by: from.clone() });
                    }
                    println!("[✗] {from} rejected {to}'s call");
                }
            }

            _ => {}
        }
    }

    // Cleanup on disconnect
    if let Some(uid) = my_user_id {
        {
            let mut map = state.users.write().await;
            if let Some(s) = map.get_mut(&uid) { s.tx = None; }
        }
        let map = state.users.read().await;
        for (id, s) in map.iter() {
            if id != &uid {
                if let Some(peer_tx) = &s.tx {
                    ws_send(peer_tx, &WsMessage::UserOffline { user_id: uid.clone() });
                }
            }
        }
        println!("[-] Disconnected: {uid}");
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ws_send(tx: &Tx, msg: &WsMessage) {
    if let Ok(json) = serde_json::to_string(msg) {
        let _ = tx.send(Message::Text(json.into()));
    }
}

/// Send an FCM push notification via the Firebase HTTP v1 API.
/// This is the Rust equivalent of:
///   getMessaging().sendEachForMulticast({ tokens: [fcm_token], data: { ... } })
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

    // Data-only message (no "notification" key) so the frontend service-worker
    // handles display — same pattern as the JS sendEachForMulticast example.
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
            "android": {
                "priority": "high"
            },
            "apns": {
                "headers": {
                    "apns-priority": "10"
                }
            },
            "webpush": {
                "headers": { "Urgency": "high" }
            }
        }
    });

    match http
        .post(&url)
        .bearer_auth(token.as_str())
        .json(&body)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            println!(
                "[fcm] ✓ push sent to …{}",
                &fcm_token[fcm_token.len().saturating_sub(12)..]
            );
        }
        Ok(r) => {
            eprintln!(
                "[fcm] ✗ HTTP {}: {}",
                r.status(),
                r.text().await.unwrap_or_default()
            );
        }
        Err(e) => eprintln!("[fcm] request error: {e}"),
    }
}