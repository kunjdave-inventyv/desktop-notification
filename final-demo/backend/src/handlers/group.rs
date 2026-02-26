// src/handlers/group.rs — Group CRUD: create, add member, remove member.

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;
use uuid::Uuid;

use crate::types::{
    event, AddGroupMemberPayload, AppState, CreateGroupPayload, ErrorPayload,
    Group, GroupDeletedPayload, GroupPayload, RemoveGroupMemberPayload,
};

// ── create_group ──────────────────────────────────────────────────────────────

pub async fn on_create_group(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<CreateGroupPayload>,
) {
    let CreateGroupPayload { created_by, name, mut members } = payload;
    let name = name.trim().to_string();

    if name.is_empty() {
        emit_error(&socket, "Group name cannot be empty");
        return;
    }
    if !identity_registered(&state, &created_by).await {
        emit_error(&socket, &format!("User '{created_by}' is not registered"));
        return;
    }

    // Creator must be included in the member list
    if !members.contains(&created_by) {
        members.insert(0, created_by.clone());
    }
    members.dedup();// Remove any duplicate user_ids

    // Validate that every listed member actually exists
    {
        let users = state.users.read().await;
        for m in &members {
            if !users.contains_key(m.as_str()) {
                emit_error(&socket, &format!("User '{m}' is not registered"));
                return;
            }
        }
    }

    let group_id = Uuid::new_v4().to_string();
    let group    = Group::new(&group_id, &name, &created_by, members.clone());
    let payload  = GroupPayload::from(&group);

    {
        let mut groups = state.groups.write().await;
        groups.insert(group_id.clone(), group);
    }

    // Notify all members (including creator) about the new group
    broadcast_to_members(&socket, &state, &members, event::GROUP_CREATED, &payload).await;

    info!("[G+] Group '{}' ({}) created by '{}'", name, group_id, created_by);
}

// ── add_group_member ──────────────────────────────────────────────────────────

pub async fn on_add_group_member(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<AddGroupMemberPayload>,
) {
    let AddGroupMemberPayload { group_id, added_by, user_id } = payload;

    if !identity_registered(&state, &user_id).await {
        emit_error(&socket, &format!("User '{user_id}' is not registered"));
        return;
    }

    let updated_payload = {
        let mut groups = state.groups.write().await;
        let Some(group) = groups.get_mut(&group_id) else {
            emit_error(&socket, &format!("Group '{group_id}' not found"));
            return;
        };
        if !group.members.contains(&added_by) {
            emit_error(&socket, "You are not a member of this group");
            return;
        }
        if group.members.contains(&user_id) {
            emit_error(&socket, &format!("'{user_id}' is already in the group"));
            return;
        }
        group.members.push(user_id.clone());
        GroupPayload::from(&*group)
    };

    // Broadcast the updated member list to all current members (including the new one)
    let members = updated_payload.members.clone();
    broadcast_to_members(&socket, &state, &members, event::GROUP_UPDATED, &updated_payload).await;

    info!("[G~] '{user_id}' added to group '{}' by '{added_by}'", group_id);
}

// ── remove_group_member ───────────────────────────────────────────────────────

pub async fn on_remove_group_member(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<RemoveGroupMemberPayload>,
) {
    let RemoveGroupMemberPayload { group_id, removed_by, user_id } = payload;

    let result = {
        let mut groups = state.groups.write().await;
        let Some(group) = groups.get_mut(&group_id) else {
            emit_error(&socket, &format!("Group '{group_id}' not found"));
            return;
        };
        let self_leave = removed_by == user_id;
        let is_creator = removed_by == group.created_by;
        let is_member  = group.members.contains(&removed_by);

        if !is_member {
            emit_error(&socket, "You are not a member of this group");
            return;
        }
        // Only creator can remove others; anyone can remove themselves
        if !self_leave && !is_creator {
            emit_error(&socket, "Only the group creator can remove others");
            return;
        }
        if !group.members.contains(&user_id) {
            emit_error(&socket, &format!("'{user_id}' is not in the group"));
            return;
        }

        let old_members = group.members.clone();
        group.members.retain(|m| m != &user_id);

        // If no members remain, delete the group entirely
        if group.members.is_empty() {
            let gid = group_id.clone();
            groups.remove(&gid);
            (old_members, None::<GroupPayload>)
        } else {
            (old_members, Some(GroupPayload::from(&*group)))
        }
    };

    let (old_members, maybe_payload) = result;

    match maybe_payload {
        // Group still has members — broadcast updated member list
        Some(updated) => {
            broadcast_to_members(&socket, &state, &old_members, event::GROUP_UPDATED, &updated).await;
        }
        // Group is now empty — tell everyone it was deleted
        None => {
            let del = GroupDeletedPayload { group_id: group_id.clone() };
            broadcast_to_members(&socket, &state, &old_members, event::GROUP_DELETED, &del).await;
            info!("[G-] Group '{}' deleted (last member left)", group_id);
        }
    }

    info!("[G~] '{user_id}' removed from group '{}' by '{removed_by}'", group_id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}

async fn identity_registered(state: &AppState, user_id: &str) -> bool {
    state.users.read().await.contains_key(user_id)
}

// Emits `event_name` with `payload` to every open tab of every user in `members`.
// The initiating socket is not reachable via broadcast(), so it is handled separately.
pub async fn broadcast_to_members<P: serde::Serialize>(
    socket: &SocketRef,
    state: &AppState,
    members: &[String],
    event_name: &'static str,
    payload: &P,
) {
    let users = state.users.read().await;
    for member_id in members {
        if let Some(ms) = users.get(member_id) {
            for sid in &ms.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event_name, payload);
                } else if *sid == socket.id {
                    // Initiating socket is not reachable via broadcast() — emit directly.
                    let _ = socket.emit(event_name, payload);
                }
            }
        }
    }
}