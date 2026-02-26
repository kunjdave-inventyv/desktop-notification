mod fcm;
mod handlers;
mod types;

use std::{collections::HashMap, path::PathBuf, sync::Arc};

use axum::{http::Method, response::IntoResponse, routing::get, Json, Router};
use gcp_auth::CustomServiceAccount;
use socketioxide::{extract::SocketRef, SocketIo};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use handlers::{
    accept::on_accept,
    call::on_call,
    cancel::on_cancel,
    cut_call::on_cut_call,
    disconnect::on_disconnect,
    group::{on_add_group_member, on_create_group, on_remove_group_member},
    group_call::{on_group_accept, on_group_call, on_group_cut, on_group_reject},
    register::on_register,
    reject::on_reject,
    store_fcm_token::on_store_fcm_token,
};
use types::AppState;


const EV_REGISTER:            &str = "register";
const EV_STORE_FCM:           &str = "store_fcm_token";
const EV_CALL:                &str = "call";
const EV_CANCEL:              &str = "cancel";
const EV_ACCEPT:              &str = "accept";
const EV_REJECT:              &str = "reject";
const EV_CUT_CALL:            &str = "cut_call";
const EV_CREATE_GROUP:        &str = "create_group";
const EV_ADD_GROUP_MEMBER:    &str = "add_group_member";
const EV_REMOVE_GROUP_MEMBER: &str = "remove_group_member";
const EV_GROUP_CALL:          &str = "group_call";
const EV_GROUP_ACCEPT:        &str = "group_accept";
const EV_GROUP_REJECT:        &str = "group_reject";
const EV_GROUP_CUT:           &str = "group_cut";

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenvy::dotenv().ok();

    // ── GCP / FCM ─────────────────────────────────────────────────────────────
    let sa_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS")
        .expect("GOOGLE_APPLICATION_CREDENTIALS must be set");

    let service_account = CustomServiceAccount::from_file(PathBuf::from(&sa_path))
        .expect("Failed to load service-account JSON");

    let auth: Arc<dyn gcp_auth::TokenProvider> = Arc::new(service_account);

    let scopes = &["https://www.googleapis.com/auth/firebase.messaging"];
    match auth.token(scopes).await {
        Ok(t)  => info!("[fcm] credentials OK — prefix: {}…", &t.as_str()[..20]),
        Err(e) => tracing::warn!("[fcm] startup credential check failed: {e}"),
    }

    let state = AppState {
        users:  Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        groups: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        calls:  Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        auth,
        http:   reqwest::Client::new(),
    };

    // ── Socket.IO ─────────────────────────────────────────────────────────────
    let (sio_layer, io) = SocketIo::builder()
        .with_state(state)
        .build_layer();

    io.ns("/", |socket: SocketRef| {
        socket.on(EV_REGISTER,  on_register);
        socket.on(EV_STORE_FCM, on_store_fcm_token);

        socket.on(EV_CALL,      on_call);
        socket.on(EV_CANCEL,    on_cancel);
        socket.on(EV_ACCEPT,    on_accept);
        socket.on(EV_REJECT,    on_reject);
        socket.on(EV_CUT_CALL,  on_cut_call);

        socket.on(EV_CREATE_GROUP,        on_create_group);
        socket.on(EV_ADD_GROUP_MEMBER,    on_add_group_member);
        socket.on(EV_REMOVE_GROUP_MEMBER, on_remove_group_member);

        socket.on(EV_GROUP_CALL,   on_group_call);
        socket.on(EV_GROUP_ACCEPT, on_group_accept);
        socket.on(EV_GROUP_REJECT, on_group_reject);
        socket.on(EV_GROUP_CUT,    on_group_cut);

        socket.on_disconnect(on_disconnect);
    });

    // ── HTTP ──────────────────────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/ping", get(ping_handler))
        .layer(sio_layer)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await.unwrap();
    info!("Server listening on http://127.0.0.1:3001");
    axum::serve(listener, app).await.unwrap();
}

async fn ping_handler() -> impl IntoResponse {
    Json(serde_json::json!({ "message": "pong" }))
}

// FCM token management (store multiple tokens per user, avoid duplicates, etc.)
// conflict of calls and groups (e.g. if a user is in a call and gets added to a group, or vice versa) is not handled in this demo, but could be an interesting extension.
// if user gets disconnected (e.g. network issues) without proper "cut call", the server currently has no way to detect that, so the call would remain active until the user tries to register again or the server restarts. so if user is on the call and disconnect then it should send cut call 