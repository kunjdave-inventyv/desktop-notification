// src/handlers/register.rs

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::types::{
    event, AppState, ErrorPayload, GroupPayload, RegisterPayload, RegisteredPayload,
    UserEntry, UserListPayload, UserOnlinePayload, UserState,
};

pub async fn on_register(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<RegisterPayload>,
) {
    let user_id   = payload.user_id.trim().to_string();
    let socket_id = socket.id;   // Sid directly

    if user_id.is_empty() {
        let _ = socket.emit(event::REGISTER_ERROR,
            &ErrorPayload { message: "Name cannot be empty".into() });
        return;
    }

    // ── Uniqueness / re-login check ───────────────────────────────────────────
    {
        let map = state.users.read().await;
        if let Some(existing) = map.get(&user_id) {
            if existing.is_online() {
                let _ = socket.emit(event::REGISTER_ERROR,
                    &ErrorPayload { message: format!("Name '{user_id}' is already taken") });
                return;
            }
        }
    }

    // ── 1. Send full user list to the new tab ─────────────────────────────────
    {
        let map = state.users.read().await;
        let users: Vec<UserEntry> = map.values()
            .filter(|u| u.user_id != user_id)
            .map(|u| UserEntry { user_id: u.user_id.clone(), is_online: u.is_online() })
            .collect();
        let _ = socket.emit(event::USER_LIST, &UserListPayload { users });
    }

    // ── 2. Send all groups this user is already a member of ───────────────────
    {
        let groups = state.groups.read().await;
        for g in groups.values() {
            if g.members.contains(&user_id) {
                let _ = socket.emit(event::GROUP_CREATED, &GroupPayload::from(g));
            }
        }
    }

    // ── 3. Add socket to user's connection list ───────────────────────────────
    {
        let mut map = state.users.write().await;
        let entry = map.entry(user_id.clone()).or_insert_with(|| UserState::new(&user_id));
        entry.socket_ids.push(socket_id);
    }

    // ── 4. Acknowledge ────────────────────────────────────────────────────────
    let _ = socket.emit(event::REGISTERED,
        &RegisteredPayload { user_id: user_id.clone(), socket_id: socket_id.to_string() });

    // ── 5. Broadcast user_online to every other online tab ────────────────────
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