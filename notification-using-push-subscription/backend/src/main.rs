use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use web_push::{
    ContentEncoding, IsahcWebPushClient, SubscriptionInfo, SubscriptionKeys, VapidSignatureBuilder, WebPushClient, WebPushMessageBuilder
};
use web_push::*;
// ── VAPID Keys ──────────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY: &str =
    "BNabC-w7D0OU7BafBOdV_ZU2BlPkt_TEXFxqtDWRNLU8X__dPDrY0hU3VQNr2Rq10c8RCRq8dVMizjNmoNApvFc";
const VAPID_PRIVATE_KEY: &str = "LrQTxs53jWCHEouN3ehj70hb0MtOUOJXuJPUfXv_xJQ";

// ── Subscription structs (match the browser PushSubscription JSON) ───────────
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

// ── Shared state ─────────────────────────────────────────────────────────────
type SharedSub = Arc<Mutex<Option<PushSubscription>>>;

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "push-demo backend running"
}

async fn subscribe(
    State(sub_store): State<SharedSub>,
    Json(sub): Json<PushSubscription>,
) -> impl IntoResponse {
    println!("[subscribe] endpoint: {}", sub.endpoint);
    *sub_store.lock().unwrap() = Some(sub);
    (StatusCode::OK, Json(json!({"status": "subscribed"})))
}

async fn unsubscribe(State(sub_store): State<SharedSub>) -> impl IntoResponse {
    println!("[unsubscribe] clearing subscription");
    *sub_store.lock().unwrap() = None;
    (StatusCode::OK, Json(json!({"status": "unsubscribed"})))
}

async fn send_push(State(sub_store): State<SharedSub>) -> impl IntoResponse {
    let sub = {
        let lock = sub_store.lock().unwrap();
        lock.clone()
    };

    let Some(sub) = sub else {
        println!("[send] no subscription stored");
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "no subscription"})),
        );
    };

    println!("[send] sending push to {}", sub.endpoint);

    let payload = json!({
        "title": "Hello from Rust! 🦀",
        "body": "Do you want to accept or reject this notification?"
    })
    .to_string();

    let subscription_info = SubscriptionInfo {
        endpoint: sub.endpoint.clone(),
        keys: SubscriptionKeys {
            p256dh: sub.keys.p256dh.clone(),
            auth: sub.keys.auth.clone(),
        },
    };

    let sig_builder = VapidSignatureBuilder::from_base64(
        VAPID_PRIVATE_KEY,
        URL_SAFE_NO_PAD,
        &subscription_info,
    )
    .expect("failed to build VAPID signature");

    let mut msg_builder = WebPushMessageBuilder::new(&subscription_info);

    msg_builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
    msg_builder.set_vapid_signature(sig_builder.build().expect("failed to sign"));

    // ✅ Add TTL here (must be > 0 for Edge)
    msg_builder.set_ttl(60); // 60 seconds

    // Optional but recommended
    msg_builder.set_urgency(Urgency::Normal);

    let message = msg_builder.build().expect("failed to build message");

    let client = IsahcWebPushClient::new().expect("failed to create client");
    match client.send(message).await {
        Ok(_) => {
            println!("[send] push delivered successfully");
            (StatusCode::OK, Json(json!({"status": "sent"})))
        }
        Err(e) => {
            println!("[send] error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        }
    }
}

#[derive(Debug, Deserialize)]
struct ActionPayload {
    action: String,
    data: Option<serde_json::Value>,
}

async fn handle_action(Json(body): Json<ActionPayload>) -> impl IntoResponse {
    println!("[action] user clicked: '{}' | data: {:?}", body.action, body.data);
    (StatusCode::OK, Json(json!({"received": body.action})))
}

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let sub_store: SharedSub = Arc::new(Mutex::new(None));

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any)
        .allow_origin(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/subscribe", post(subscribe))
        .route("/unsubscribe", post(unsubscribe))
        .route("/send", post(send_push))
        .route("/action", post(handle_action))
        // Serve static files (index.html, sw.js) from ./static/
        .nest_service("/", tower_http::services::ServeDir::new("static"))
        .layer(cors)
        .with_state(sub_store);

    let addr = "0.0.0.0:3000";
    println!("🦀 Backend listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}