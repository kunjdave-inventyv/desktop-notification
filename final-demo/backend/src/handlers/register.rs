// src/handlers/register.rs

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::types::{
    event, AppState, ErrorPayload, GroupPayload, MessageHistoryPayload,
    RegisterPayload, RegisteredPayload, UserEntry, UserListPayload, UserOnlinePayload, UserState,
    group_key,
};

pub async fn on_register(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<RegisterPayload>,
) {
    let user_id   = payload.user_id.trim().to_string();
    let socket_id = socket.id;

    if user_id.is_empty() {
        let _ = socket.emit(event::REGISTER_ERROR,
            &ErrorPayload { message: "Name cannot be empty".into() });
        return;
    }

    // 1. Send snapshot of all other known users and their online status
    {
        let map = state.users.read().await;
        let users: Vec<UserEntry> = map.values()
            .filter(|u| u.user_id != user_id)
            .map(|u| UserEntry { user_id: u.user_id.clone(), is_online: u.is_online() })
            .collect();
        let _ = socket.emit(event::USER_LIST, &UserListPayload { users });
    }

    // 2. Replay any groups this user belongs to; collect group_ids for history replay
    let group_ids: Vec<String> = {
        let groups = state.groups.read().await;
        let mut ids = Vec::new();
        for g in groups.values() {
            if g.members.contains(&user_id) {
                let _ = socket.emit(event::GROUP_CREATED, &GroupPayload::from(g));
                ids.push(g.group_id.clone());
            }
        }
        ids
    };

    // 3. Replay DM history — every conversation this user participated in.
    //    DM keys are sorted pairs "{a}::{b}", so we match any key where either
    //    side equals user_id.
    {
        let store = state.messages.read().await;
        for (key, messages) in store.iter() {
            if messages.is_empty() { continue; }

            let is_dm_participant = !key.starts_with("group::") && {
                let mut parts = key.splitn(2, "::");
                match (parts.next(), parts.next()) {
                    (Some(a), Some(b)) => a == user_id || b == user_id,
                    _ => false,
                }
            };

            if is_dm_participant {
                let _ = socket.emit(event::MESSAGE_HISTORY, &MessageHistoryPayload {
                    conversation_key: key.clone(),
                    messages:         messages.clone(),
                });
            }
        }
    }

    // 4. Replay group message history for every group the user belongs to
    {
        let store = state.messages.read().await;
        for group_id in &group_ids {
            let key = group_key(group_id);
            if let Some(messages) = store.get(&key) {
                if !messages.is_empty() {
                    let _ = socket.emit(event::MESSAGE_HISTORY, &MessageHistoryPayload {
                        conversation_key: key.clone(),
                        messages:         messages.clone(),
                    });
                }
            }
        }
    }

    // 5. Add this socket to the user's tab list (creates entry on first login)
    {
        let mut map = state.users.write().await;
        let entry = map.entry(user_id.clone()).or_insert_with(|| UserState::new(&user_id));
        entry.socket_ids.push(socket_id);
    }

    // 6. Acknowledge registration to the connecting tab
    let _ = socket.emit(event::REGISTERED,
        &RegisteredPayload { user_id: user_id.clone(), socket_id: socket_id.to_string() });

    // 7. Notify every other online tab that this user just came online
    {
        let map = state.users.read().await;
        for (id, s) in map.iter() {
            if id == &user_id { continue; }
            for sid in &s.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::USER_ONLINE,
                        &UserOnlinePayload { user_id: user_id.clone() });
                }
            }
        }
    }

    info!("[+] '{user_id}' registered (socket {socket_id})");
}