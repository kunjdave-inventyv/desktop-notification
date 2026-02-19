

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::Message;
use warp::Filter;
use web_push::*;

type Tx = mpsc::UnboundedSender<Message>;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushKeys {
    p256dh: String,
    auth: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushSubscription {
    endpoint: String,
    keys: PushKeys,
}

#[derive(Debug, Clone)]
struct UserState {
    tx: Option<Tx>,
    push_sub: Option<PushSubscription>,
}

type UserMap = Arc<RwLock<HashMap<String, UserState>>>;

const VAPID_PRIVATE_KEY: &str = "LrQTxs53jWCHEouN3ehj70hb0MtOUOJXuJPUfXv_xJQ";
const VAPID_PUBLIC_KEY: &str  = "BNabC-w7D0OU7BafBOdV_ZU2BlPkt_TEXFxqtDWRNLU8X__dPDrY0hU3VQNr2Rq10c8RCRq8dVMizjNmoNApvFc";
const VAPID_SUBJECT: &str     = "mailto:you@example.com";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
enum WsMessage {
    Register { user_id: String },
    StorePushSub { user_id: String, subscription: PushSubscription },
    Call   { from: String, to: String },
    Accept { from: String, to: String },
    Reject { from: String, to: String },
    Registered    { user_id: String },
    IncomingCall  { from: String },
    CallAccepted  { by: String },
    CallRejected  { by: String },
    UserOnline    { user_id: String },
    UserOffline   { user_id: String },
    Error         { message: String },
}

#[derive(Serialize)]
struct PushPayload<'a> {
    action: &'a str,
    from:   &'a str,
    to:     &'a str,
}

#[tokio::main]
async fn main() {
    let users: UserMap = Arc::new(RwLock::new(HashMap::new()));

    // ── GET /vapid-public-key ─────────────────────────────────────────
    let vapid_route = warp::path("vapid-public-key")
        .and(warp::get())
        .map(|| warp::reply::json(&serde_json::json!({ "key": VAPID_PUBLIC_KEY })));

    // ── POST /reject-call ─────────────────────────────────────────────
    let users_reject = users.clone();
    let reject_route = warp::path("reject-call")
        .and(warp::post())
        .and(warp::body::json())
        .and(warp::any().map(move || users_reject.clone()))
        .and_then(|body: serde_json::Value, users: UserMap| async move {
            let from = body["from"].as_str().unwrap_or("").to_string();
            let to   = body["to"].as_str().unwrap_or("").to_string();
            let map  = users.read().await;
            if let Some(state) = map.get(&to) {
                if let Some(caller_tx) = &state.tx {
                    let msg = WsMessage::CallRejected { by: from.clone() };
                    if let Ok(json) = serde_json::to_string(&msg) {
                        let _ = caller_tx.send(Message::text(json));
                    }
                }
            }
            Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "ok": true })))
        });

    // ── WebSocket /ws ─────────────────────────────────────────────────
    let users_ws = users.clone();
    let ws_route = warp::path("ws")
        .and(warp::ws())
        .and(warp::any().map(move || users_ws.clone()))
        .map(|ws: warp::ws::Ws, users: UserMap| {
            ws.on_upgrade(move |socket| handle_connection(socket, users))
        });

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST"]);

    // ── Combine all routes ────────────────────────────────────────────
    let routes = vapid_route
        .or(reject_route)
        .or(ws_route)
        .with(cors);

    println!("Server on http://127.0.0.1:3001");
    warp::serve(routes).run(([127, 0, 0, 1], 3001)).await;
}

fn ws_send(tx: &Tx, msg: &WsMessage) {
    if let Ok(json) = serde_json::to_string(msg) {
        let _ = tx.send(Message::text(json));
    }
}

async fn send_push_notification(sub: &PushSubscription, payload: &str) {
    let subscription_info = SubscriptionInfo {
        endpoint: sub.endpoint.clone(),
        keys: SubscriptionKeys {
            p256dh: sub.keys.p256dh.clone(),
            auth: sub.keys.auth.clone(),
        },
    };

    let mut builder = WebPushMessageBuilder::new(&subscription_info);
    builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());

    let sig_builder = VapidSignatureBuilder::from_base64(
        VAPID_PRIVATE_KEY,
        URL_SAFE_NO_PAD,
        &subscription_info,
    )
    .expect("failed to build VAPID signature");

    match sig_builder.build() {
        Ok(sig) => builder.set_vapid_signature(sig),
        Err(e) => { eprintln!("VAPID sig error: {}", e); return; }
    }

    match builder.build() {
        Ok(msg) => {
            let client = IsahcWebPushClient::new().unwrap();
            if let Err(e) = client.send(msg).await {
                eprintln!("Push send error: {}", e);
            } else {
                println!("[push] notification sent to {}", &sub.endpoint[..40]);
            }
        }
        Err(e) => eprintln!("Push build error: {}", e),
    }
}

async fn handle_connection(ws: warp::ws::WebSocket, users: UserMap) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let mut my_user_id: Option<String> = None;

    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() { break; }
        }
    });

    while let Some(result) = ws_rx.next().await {
        let msg = match result { Ok(m) => m, Err(_) => break };
        if msg.is_close() { break; }
        let text = match msg.to_str() { Ok(t) => t.to_string(), Err(_) => continue };

        let parsed: WsMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                ws_send(&tx, &WsMessage::Error { message: format!("Bad message: {}", e) });
                continue;
            }
        };

        match parsed {
            WsMessage::Register { user_id } => {
                my_user_id = Some(user_id.clone());

                {
                    let map = users.read().await;
                    for (id, state) in map.iter() {
                        if state.tx.is_some() {
                            ws_send(&tx, &WsMessage::UserOnline { user_id: id.clone() });
                        }
                    }
                }

                {
                    let mut map = users.write().await;
                    let entry = map.entry(user_id.clone()).or_insert(UserState { tx: None, push_sub: None });
                    entry.tx = Some(tx.clone());
                }

                ws_send(&tx, &WsMessage::Registered { user_id: user_id.clone() });

                let map = users.read().await;
                for (id, state) in map.iter() {
                    if id != &user_id {
                        if let Some(peer_tx) = &state.tx {
                            ws_send(peer_tx, &WsMessage::UserOnline { user_id: user_id.clone() });
                        }
                    }
                }
                println!("[+] Registered: {}", user_id);
            }

            WsMessage::StorePushSub { user_id, subscription } => {
                let mut map = users.write().await;
                let entry = map.entry(user_id.clone()).or_insert(UserState { tx: None, push_sub: None });
                entry.push_sub = Some(subscription);
                println!("[push] stored subscription for {}", user_id);
            }

            WsMessage::Call { from, to } => {
                let map = users.read().await;
                if let Some(target) = map.get(&to) {
                    // Send inline WS event only if they have a live connection
                    if let Some(peer_tx) = &target.tx {
                        ws_send(peer_tx, &WsMessage::IncomingCall { from: from.clone() });
                    }
                    // Always send push notification regardless of online status
                    if let Some(sub) = &target.push_sub {
                        let payload = serde_json::to_string(&PushPayload {
                            action: "incoming_call",
                            from: &from,
                            to: &to,
                        }).unwrap();
                        let sub_clone = sub.clone();
                        tokio::spawn(async move {
                            send_push_notification(&sub_clone, &payload).await;
                        });
                        println!("[~] Call (push): {} -> {}", from, to);
                    } else if target.tx.is_none() {
                        // No WS and no push sub — truly unreachable
                        ws_send(&tx, &WsMessage::Error {
                            message: format!("User '{}' is offline and has no push subscription", to),
                        });
                    }
                } else {
                    ws_send(&tx, &WsMessage::Error {
                        message: format!("User '{}' has never connected", to),
                    });
                }
                println!("[~] Call: {} -> {}", from, to);
            }

            WsMessage::Accept { from, to } => {
                let map = users.read().await;
                if let Some(state) = map.get(&to) {
                    if let Some(caller_tx) = &state.tx {
                        ws_send(caller_tx, &WsMessage::CallAccepted { by: from.clone() });
                    }
                    println!("[✓] {} accepted {}'s call", from, to);
                }
            }

            WsMessage::Reject { from, to } => {
                let map = users.read().await;
                if let Some(state) = map.get(&to) {
                    if let Some(caller_tx) = &state.tx {
                        ws_send(caller_tx, &WsMessage::CallRejected { by: from.clone() });
                    }
                    println!("[✗] {} rejected {}'s call", from, to);
                }
            }

            _ => {}
        }
    }

    if let Some(uid) = my_user_id {
        {
            let mut map = users.write().await;
            if let Some(state) = map.get_mut(&uid) {
                state.tx = None;
            }
        }
        let map = users.read().await;
        for (id, state) in map.iter() {
            if id != &uid {
                if let Some(peer_tx) = &state.tx {
                    ws_send(peer_tx, &WsMessage::UserOffline { user_id: uid.clone() });
                }
            }
        }
        println!("[-] Disconnected: {}", uid);
    }
}