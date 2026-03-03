// src/livekit.rs — LiveKit room + token helpers

use livekit_api::{
    access_token::{AccessToken, VideoGrants},
    services::room::{CreateRoomOptions, RoomClient},
};
use tracing::error;

/// Read LiveKit config from environment variables.
/// Call once at startup and store in AppState.
pub struct LiveKitConfig {
    pub url:        String,   // ws:// — sent to clients for SDK connection
    pub api_url:    String,   // http:// — used by Rust for room management API
    pub api_key:    String,
    pub api_secret: String,
}

impl LiveKitConfig {
    pub fn from_env() -> Self {
        Self {
            url:        std::env::var("LIVEKIT_URL").expect("LIVEKIT_URL must be set"),
            api_url:    std::env::var("LIVEKIT_API_URL").expect("LIVEKIT_API_URL must be set"),
            api_key:    std::env::var("LIVEKIT_API_KEY").expect("LIVEKIT_API_KEY must be set"),
            api_secret: std::env::var("LIVEKIT_API_SECRET").expect("LIVEKIT_API_SECRET must be set"),
        }
    }
}

// ── Room management ───────────────────────────────────────────────────────────

/// Create a LiveKit room. Returns room name on success.
/// For 1-to-1 calls:  room_name = "call::{caller}::{callee}"
/// For group calls:   room_name = "group::{group_id}"
pub async fn create_room(config: &LiveKitConfig, room_name: &str) -> bool {
    let client = RoomClient::with_api_key(&config.api_url, &config.api_key, &config.api_secret);

    match client.create_room(room_name, CreateRoomOptions {
        empty_timeout:        300,  // auto-delete room after 5 min if empty
        max_participants:     50,
        ..Default::default()
    }).await {
        Ok(_)  => { tracing::info!("[livekit] Room '{}' created", room_name); true }
        Err(e) => { error!("[livekit] Failed to create room '{}': {e}", room_name); false }
    }
}

/// Delete a LiveKit room (called when call ends).
pub async fn delete_room(config: &LiveKitConfig, room_name: &str) {
    let client = RoomClient::with_api_key(&config.api_url, &config.api_key, &config.api_secret);
    if let Err(e) = client.delete_room(room_name).await {
        error!("[livekit] Failed to delete room '{}': {e}", room_name);
    } else {
        tracing::info!("[livekit] Room '{}' deleted", room_name);
    }
}

// ── Token generation ──────────────────────────────────────────────────────────

/// Generate a LiveKit JWT token for a participant to join a room.
/// TTL is 1 hour.
pub fn generate_token(
    config:    &LiveKitConfig,
    room_name: &str,
    identity:  &str,   // user_id
) -> Option<String> {
    let grants = VideoGrants {
        room:             room_name.to_owned(),
        room_join:        true,
        can_publish:      true,
        can_subscribe:    true,
        can_publish_data: true,
        ..Default::default()
    };

    match AccessToken::with_api_key(&config.api_key, &config.api_secret)
        .with_identity(identity)
        .with_ttl(std::time::Duration::from_secs(3600))
        .with_grants(grants)
        .to_jwt()
    {
        Ok(token) => {
            tracing::info!("[livekit] Token generated for '{}' in room '{}'", identity, room_name);
            Some(token)
        }
        Err(e) => {
            error!("[livekit] Token generation failed for '{}': {e}", identity);
            None
        }
    }
}

// ── Room name helpers ─────────────────────────────────────────────────────────

/// Canonical room name for a 1-to-1 call (alphabetically sorted so both sides get the same name).
pub fn dm_room_name(a: &str, b: &str) -> String {
    if a <= b {
        format!("call::{a}::{b}")
    } else {
        format!("call::{b}::{a}")
    }
}

/// Canonical room name for a group call.
pub fn group_room_name(group_id: &str) -> String {
    format!("group::{group_id}")
}