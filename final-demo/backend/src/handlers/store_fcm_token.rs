// src/handlers/store_fcm_token.rs

use socketioxide::extract::{Data, State};
use tracing::info;

use crate::types::{AppState, StoreFcmTokenPayload, UserState};

pub async fn on_store_fcm_token(
    State(state): State<AppState>,
    Data(payload): Data<StoreFcmTokenPayload>,
) {
    let mut map = state.users.write().await;
    let entry = map.entry(payload.user_id.clone())
        .or_insert_with(|| UserState::new(&payload.user_id));
    if !entry.fcm_tokens.contains(&payload.token) {
        entry.fcm_tokens.push(payload.token);
    }
    info!("[fcm] token stored for '{}' ({} total)", payload.user_id, entry.fcm_tokens.len());
}