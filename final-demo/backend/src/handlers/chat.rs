// src/handlers/chat.rs

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;
use uuid::Uuid;

use crate::{
    fcm::{send_chat_dm_notification, send_chat_group_notification, TokenStatus},
    types::{
        event, AppState, DirectMessagePayload, ErrorPayload, GroupMessagePayload,
        SendDirectMessagePayload, SendGroupMessagePayload, StoredMessage,
        UserMap, dm_key, group_key,
    },
};

// ── 1-to-1 direct message ─────────────────────────────────────────────────────

pub async fn on_send_message(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<SendDirectMessagePayload>,
) {
    let SendDirectMessagePayload { from, to, content } = payload;
    let content = content.trim().to_string();

    if content.is_empty() { emit_error(&socket, "Message cannot be empty"); return; }
    if from == to         { emit_error(&socket, "Cannot message yourself");  return; }

    if !super::call::identity_matches(&state, socket.id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    {
        let users = state.users.read().await;
        if !users.contains_key(&to) {
            emit_error(&socket, &format!("User '{to}' is not registered"));
            return;
        }
    }

    let message_id = Uuid::new_v4().to_string();
    let timestamp  = chrono::Utc::now().to_rfc3339();
    let key        = dm_key(&from, &to);

    // ── Store ─────────────────────────────────────────────────────────────────
    {
        let mut store = state.messages.write().await;
        store.entry(key).or_insert_with(Vec::new).push(StoredMessage {
            message_id: message_id.clone(),
            from:       from.clone(),
            target:     to.clone(),
            content:    content.clone(),
            timestamp:  timestamp.clone(),
        });
    }

    let outbound = DirectMessagePayload {
        message_id: message_id.clone(),
        from:       from.clone(),
        to:         to.clone(),
        content:    content.clone(),
        timestamp,
    };

    let users = state.users.read().await;

    // ── Deliver to recipient's open tabs ──────────────────────────────────────
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                let _ = peer.emit(event::DIRECT_MESSAGE, &outbound);
            }
        }
    }

    // ── FCM push — always, regardless of online status ────────────────────────
    let tokens = users.get(&to)
        .map(|cs| cs.fcm_tokens.clone())
        .unwrap_or_default();
    drop(users);

    if !tokens.is_empty() {
        let (f, t2, c) = (from.clone(), to.clone(), content.clone());
        let auth_clone = state.auth.clone();
        let http       = state.http.clone();
        let users_map  = state.users.clone();
        tokio::spawn(async move {
            for token in tokens {
                let status = send_chat_dm_notification(
                    &token, &f, &t2, &c,
                    auth_clone.as_ref(), &http,
                ).await;
                if status == TokenStatus::Evict {
                    evict_token(&users_map, &t2, &token).await;
                }
            }
        });
    } else {
        // Re-acquire to finish the echo + ack below
        let _ = state.users.read().await;
    }

    // ── Echo to sender's other open tabs ──────────────────────────────────────
    {
        let users = state.users.read().await;
        if let Some(cs) = users.get(&from) {
            for sid in &cs.socket_ids {
                if *sid != socket.id {
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::DIRECT_MESSAGE, &outbound);
                    }
                }
            }
        }
    }

    // ── Ack sending tab ───────────────────────────────────────────────────────
    let _ = socket.emit(event::MESSAGE_SENT, &outbound);

    info!("[💬] DM '{from}' → '{to}' (id: {})", &message_id[..8]);
}

// ── Group message ─────────────────────────────────────────────────────────────

pub async fn on_send_group_message(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<SendGroupMessagePayload>,
) {
    let SendGroupMessagePayload { from, group_id, content } = payload;
    let content = content.trim().to_string();

    if content.is_empty() {
        emit_error(&socket, "Message cannot be empty");
        return;
    }
    if !super::call::identity_matches(&state, socket.id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let (members, group_name) = {
        let groups = state.groups.read().await;
        let Some(group) = groups.get(&group_id) else {
            emit_error(&socket, &format!("Group '{group_id}' not found"));
            return;
        };
        if !group.members.contains(&from) {
            emit_error(&socket, "You are not a member of this group");
            return;
        }
        (group.members.clone(), group.name.clone())
    };

    let message_id = Uuid::new_v4().to_string();
    let timestamp  = chrono::Utc::now().to_rfc3339();
    let key        = group_key(&group_id);

    // ── Store ─────────────────────────────────────────────────────────────────
    {
        let mut store = state.messages.write().await;
        store.entry(key).or_insert_with(Vec::new).push(StoredMessage {
            message_id: message_id.clone(),
            from:       from.clone(),
            target:     group_id.clone(),
            content:    content.clone(),
            timestamp:  timestamp.clone(),
        });
    }

    let outbound = GroupMessagePayload {
        message_id: message_id.clone(),
        from:       from.clone(),
        group_id:   group_id.clone(),
        content:    content.clone(),
        timestamp,
    };

    // ── Deliver via socket + collect FCM targets in one pass ──────────────────
    // FCM targets = (member_id, token) for every member except the sender.
    let mut fcm_targets: Vec<(String, String)> = Vec::new();

    {
        let users = state.users.read().await;
        for member_id in &members {
            if let Some(ms) = users.get(member_id) {
                // Socket delivery to every open tab except the sending one
                for sid in &ms.socket_ids {
                    if *sid == socket.id { continue; }
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::GROUP_MESSAGE, &outbound);
                    }
                }
                // Collect FCM tokens — skip sender
                if member_id != &from {
                    for token in &ms.fcm_tokens {
                        fcm_targets.push((member_id.clone(), token.clone()));
                    }
                }
            }
        }
    }

    // ── FCM push — always, for every member except sender ────────────────────
    if !fcm_targets.is_empty() {
        let (f, gid, gname, c) = (
            from.clone(), group_id.clone(), group_name.clone(), content.clone(),
        );
        let auth_clone = state.auth.clone();
        let http       = state.http.clone();
        let users_map  = state.users.clone();
        tokio::spawn(async move {
            for (member_id, token) in fcm_targets {
                let status = send_chat_group_notification(
                    &token, &f, &gid, &gname, &c,
                    auth_clone.as_ref(), &http,
                ).await;
                if status == TokenStatus::Evict {
                    evict_token(&users_map, &member_id, &token).await;
                }
            }
        });
    }

    // ── Ack sending tab ───────────────────────────────────────────────────────
    let _ = socket.emit(event::MESSAGE_SENT, &outbound);

    info!("[💬] Group msg '{from}' → '{group_id}' (id: {})", &message_id[..8]);
}

// ── Token eviction ────────────────────────────────────────────────────────────

async fn evict_token(users: &UserMap, user_id: &str, token: &str) {
    let mut map = users.write().await;
    if let Some(u) = map.get_mut(user_id) {
        let before = u.fcm_tokens.len();
        u.fcm_tokens.retain(|t| t != token);
        if u.fcm_tokens.len() < before {
            tracing::warn!(
                "[fcm] evicted dead token for '{user_id}' ({} remaining)",
                u.fcm_tokens.len()
            );
        }
    }
}

// ── Helper ────────────────────────────────────────────────────────────────────

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}