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

    // Reject duplicate name if another live session already holds it
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

    // 1. Send the new tab a snapshot of all other known users and their online status
    {
        let map = state.users.read().await;
        let users: Vec<UserEntry> = map.values()
            .filter(|u| u.user_id != user_id)
            .map(|u| UserEntry { user_id: u.user_id.clone(), is_online: u.is_online() })
            .collect();
        let _ = socket.emit(event::USER_LIST, &UserListPayload { users });
    }

    // 2. Replay any groups this user is already a member of so the tab is in sync
    {
        let groups = state.groups.read().await;
        for g in groups.values() {
            if g.members.contains(&user_id) {
                let _ = socket.emit(event::GROUP_CREATED, &GroupPayload::from(g));
            }
        }
    }

    // 3. Add this socket to the user's tab list (creates entry if first login)
    {
        let mut map = state.users.write().await;
        let entry = map.entry(user_id.clone()).or_insert_with(|| UserState::new(&user_id));
        entry.socket_ids.push(socket_id);
    }

    // 4. Acknowledge registration to the connecting tab
    let _ = socket.emit(event::REGISTERED,
        &RegisteredPayload { user_id: user_id.clone(), socket_id: socket_id.to_string() });

    // 5. Notify every other online tab that this user just came online
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