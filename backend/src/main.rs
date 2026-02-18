use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::Message;
use warp::Filter;

type Tx = mpsc::UnboundedSender<Message>;
type PeerMap = Arc<RwLock<HashMap<String, Tx>>>;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
enum WsMessage {
    Register { user_id: String },
    Call { from: String, to: String },
    Accept { from: String, to: String },
    Reject { from: String, to: String },
    Registered { user_id: String },
    IncomingCall { from: String },
    CallAccepted { by: String },
    CallRejected { by: String },
    UserOnline { user_id: String },
    UserOffline { user_id: String },
    Error { message: String },
}

#[tokio::main]
async fn main() {
    let peers: PeerMap = Arc::new(RwLock::new(HashMap::new()));
    let peers_filter = warp::any().map(move || peers.clone());

    let ws_route = warp::path("ws")
        .and(warp::ws())
        .and(peers_filter)
        .map(|ws: warp::ws::Ws, peers: PeerMap| {
            ws.on_upgrade(move |socket| handle_connection(socket, peers))
        });

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST"]);

    println!("WebSocket server running on ws://127.0.0.1:3001/ws");
    warp::serve(ws_route.with(cors)).run(([127, 0, 0, 1], 3001)).await;
}

fn send_msg(tx: &Tx, msg: &WsMessage) {
    if let Ok(json) = serde_json::to_string(msg) {
        let _ = tx.send(Message::text(json));
    }
}

async fn handle_connection(ws: warp::ws::WebSocket, peers: PeerMap) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let mut my_user_id: Option<String> = None;

    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(result) = ws_rx.next().await {
        let msg = match result {
            Ok(m) => m,
            Err(_) => break,
        };

        if msg.is_close() {
            break;
        }

        let text = match msg.to_str() {
            Ok(t) => t.to_string(),
            Err(_) => continue,
        };

        let parsed: WsMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                send_msg(&tx, &WsMessage::Error { message: format!("Invalid message: {}", e) });
                continue;
            }
        };

        match parsed {
            WsMessage::Register { user_id } => {
                my_user_id = Some(user_id.clone());

                // Send the new user a UserOnline event for every already-connected peer
                // This fixes the race condition where the second user never learns about the first
                {
                    let peers_read = peers.read().await;
                    for existing_id in peers_read.keys() {
                        send_msg(&tx, &WsMessage::UserOnline { user_id: existing_id.clone() });
                    }
                }

                // Now insert this user
                peers.write().await.insert(user_id.clone(), tx.clone());

                // Confirm registration back to this user
                send_msg(&tx, &WsMessage::Registered { user_id: user_id.clone() });

                // Notify all others that this user is now online
                let peers_read = peers.read().await;
                for (id, peer_tx) in peers_read.iter() {
                    if id != &user_id {
                        send_msg(peer_tx, &WsMessage::UserOnline { user_id: user_id.clone() });
                    }
                }

                println!("[+] Registered: {}", user_id);
            }

            WsMessage::Call { from, to } => {
                let peers_read = peers.read().await;
                if let Some(target_tx) = peers_read.get(&to) {
                    send_msg(target_tx, &WsMessage::IncomingCall { from: from.clone() });
                    println!("[~] Call: {} -> {}", from, to);
                } else {
                    send_msg(&tx, &WsMessage::Error { message: format!("User '{}' is not online", to) });
                }
            }

            WsMessage::Accept { from, to } => {
                let peers_read = peers.read().await;
                if let Some(caller_tx) = peers_read.get(&to) {
                    send_msg(caller_tx, &WsMessage::CallAccepted { by: from.clone() });
                    println!("[✓] {} accepted {}'s call", from, to);
                }
            }

            WsMessage::Reject { from, to } => {
                let peers_read = peers.read().await;
                if let Some(caller_tx) = peers_read.get(&to) {
                    send_msg(caller_tx, &WsMessage::CallRejected { by: from.clone() });
                    println!("[✗] {} rejected {}'s call", from, to);
                }
            }

            _ => {}
        }
    }

    // Cleanup on disconnect
    if let Some(uid) = my_user_id {
        peers.write().await.remove(&uid);
        let peers_read = peers.read().await;
        for peer_tx in peers_read.values() {
            send_msg(peer_tx, &WsMessage::UserOffline { user_id: uid.clone() });
        }
        println!("[-] Disconnected: {}", uid);
    }
}