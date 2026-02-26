// src/handlers/group_call.rs

use socketioxide::extract::{Data, SocketRef, State};
use socketioxide::socket::Sid;
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    fcm::send_fcm_notification,
    handlers::group::broadcast_to_members,
    types::{
        event, AppState, CallMap, CallSession, CallStatus, CallTarget,
        ErrorPayload, GroupAcceptPayload, GroupCallEndedPayload,
        GroupCallPayload, GroupCutPayload, GroupIncomingCallPayload,
        GroupMemberJoinedPayload, GroupMemberLeftPayload, GroupRejectPayload,
        UserMap, RING_TIMEOUT_SEC,
    },
};

// ── group_call ────────────────────────────────────────────────────────────────

pub async fn on_group_call(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<GroupCallPayload>,
) {
    let GroupCallPayload { from, group_id } = payload;
    let socket_id: Sid = socket.id;

    if !identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let (group_name, members) = {
        let groups = state.groups.read().await;
        let Some(group) = groups.get(&group_id) else {
            emit_error(&socket, &format!("Group '{group_id}' not found"));
            return;
        };
        if !group.members.contains(&from) {
            emit_error(&socket, "You are not a member of this group");
            return;
        }
        (group.name.clone(), group.members.clone())
    };

    {
        let calls = state.calls.read().await;
        let busy = calls.values().any(|s| {
            (s.caller == from || s.participants.contains(&from))
                && s.status == CallStatus::Active
        });
        if busy {
            emit_error(&socket, "You are already on a call");
            return;
        }
        if calls.contains_key(&group_id) {
            emit_error(&socket, "This group already has an active call");
            return;
        }
    }

    let other_members: Vec<String> = members.iter()
        .filter(|m| **m != from)
        .cloned()
        .collect();

    let incoming = GroupIncomingCallPayload {
        from:       from.clone(),
        group_id:   group_id.clone(),
        group_name: group_name.clone(),
    };

    let users_snap = state.users.read().await;
    for member_id in &other_members {
        if let Some(ms) = users_snap.get(member_id) {
            for sid in &ms.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::GROUP_INCOMING_CALL, &incoming);
                }
            }
            if !ms.fcm_tokens.is_empty() {
                let tokens: Vec<String> = ms.fcm_tokens.clone();
                let (f, gid, http) = (from.clone(), group_id.clone(), state.http.clone());
                let auth = state.auth.clone();
                tokio::spawn(async move {
                    for token in tokens {
                        send_fcm_notification(&token, &f, &gid, auth.as_ref(), &http).await;
                    }
                });
            }
        }
    }
    drop(users_snap);

    // Encode the invited member count as a sentinel in participants so
    // on_group_reject can know when everyone has responded without a new field.
    let non_caller_count = other_members.len();

    let timeout_handle = spawn_group_ring_timeout(
        from.clone(),
        group_id.clone(),
        members.clone(),
        socket.clone(),
        state.calls.clone(),
        state.users.clone(),
    );

    let mut calls = state.calls.write().await;
    calls.insert(group_id.clone(), CallSession {
        caller:           from.clone(),
        target:           CallTarget::Group(group_id.clone()),
        status:           CallStatus::Ringing,
        caller_socket_id: socket_id,
        participants:     vec![from.clone(), format!("@total:{non_caller_count}")],
        _timeout_handle:  timeout_handle,
    });

    info!("[G~] Group call started: '{from}' → group '{group_id}' ({non_caller_count} invited)");
}

// ── group_accept ──────────────────────────────────────────────────────────────

pub async fn on_group_accept(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<GroupAcceptPayload>,
) {
    let GroupAcceptPayload { from, group_id } = payload;
    let socket_id: Sid = socket.id;

    if !identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let mut calls = state.calls.write().await;
    let Some(session) = calls.get_mut(&group_id) else {
        emit_error(&socket, "No active group call to accept");
        return;
    };
    if !matches!(&session.target, CallTarget::Group(gid) if gid == &group_id) {
        emit_error(&socket, "Call target mismatch");
        return;
    }
    if session.participants.contains(&from) {
        return; // duplicate — ignore
    }
    // Remove any prior reject marker for this user (edge case: they somehow re-accepted)
    let reject_marker = format!("-{from}");
    session.participants.retain(|p| p != &reject_marker);

    session.participants.push(from.clone());
    if session.status == CallStatus::Ringing {
        session.status = CallStatus::Active;
    }

    // Real participants for broadcast (strip sentinels)
    let real_participants: Vec<String> = session.participants.iter()
        .filter(|p| !p.starts_with('-') && !p.starts_with('@'))
        .cloned()
        .collect();
    drop(calls);

    let joined = GroupMemberJoinedPayload { group_id: group_id.clone(), user_id: from.clone() };
    let users = state.users.read().await;
    for uid in &real_participants {
        if uid == &from { continue; }
        if let Some(ms) = users.get(uid) {
            for sid in &ms.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::GROUP_MEMBER_JOINED, &joined);
                }
            }
        }
    }
    let _ = socket.emit(event::GROUP_MEMBER_JOINED, &joined);

    // Dismiss ringing on all OTHER tabs of the acceptor
    if let Some(ms) = users.get(&from) {
        for sid in &ms.socket_ids {
            if *sid != socket_id {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::GROUP_CALL_ENDED,
                        &GroupCallEndedPayload {
                            group_id: group_id.clone(),
                            reason: "Answered on another tab".into(),
                        });
                }
            }
        }
    }

    info!("[G✓] '{from}' joined group call '{group_id}'");
}

// ── group_reject ──────────────────────────────────────────────────────────────

pub async fn on_group_reject(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<GroupRejectPayload>,
) {
    let GroupRejectPayload { from, group_id } = payload;
    let socket_id: Sid = socket.id;

    if !identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    // Bail early if call is gone
    {
        let calls_r = state.calls.read().await;
        if calls_r.get(&group_id).is_none() { return; }
    }

    // Dismiss other tabs of the rejecting user
    {
        let users = state.users.read().await;
        if let Some(ms) = users.get(&from) {
            for sid in &ms.socket_ids {
                if *sid != socket_id {
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::GROUP_CALL_ENDED,
                            &GroupCallEndedPayload {
                                group_id: group_id.clone(),
                                reason: "Rejected on another tab".into(),
                            });
                    }
                }
            }
        }
    }

    // Acknowledge rejection to the rejecting tab immediately
    let _ = socket.emit(event::GROUP_CALL_ENDED,
        &GroupCallEndedPayload { group_id: group_id.clone(), reason: "You declined".into() });

    let all_declined = {
        let mut calls_w = state.calls.write().await;
        let Some(session) = calls_w.get_mut(&group_id) else { return; };

        let reject_marker = format!("-{from}");
        
        if !session.participants.contains(&reject_marker)
            && !session.participants.contains(&from)
        {
            session.participants.push(reject_marker);
        }

        let caller = session.caller.clone();

        // How many non-caller members were originally invited?
        let total_invited: usize = session.participants.iter()
            .find(|p| p.starts_with("@total:"))
            .and_then(|s| s["@total:".len()..].parse().ok())
            .unwrap_or(0);

        // Count real (non-caller) acceptors
        let acceptors: usize = session.participants.iter()
            .filter(|p| {
                let s = p.as_str();
                s != caller.as_str() && !s.starts_with('-') && !s.starts_with('@')
            })
            .count();

        // Count rejectors
        let rejectors: usize = session.participants.iter()
            .filter(|p| p.starts_with('-'))
            .count();

        let total_responded = acceptors + rejectors;

        // End the call only when every invitee has responded AND no one accepted
        acceptors == 0 && total_responded >= total_invited
    };

    if all_declined {
        end_group_call_fully(&socket, &state, &group_id, "All members declined").await;
    }

    info!("[G✗] '{from}' declined group call '{group_id}'");
}

// ── group_cut ─────────────────────────────────────────────────────────────────

pub async fn on_group_cut(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<GroupCutPayload>,
) {
    let GroupCutPayload { from, group_id } = payload;
    let socket_id: Sid = socket.id;

    if !identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let (is_caller, remaining) = {
        let mut calls = state.calls.write().await;
        let Some(session) = calls.get_mut(&group_id) else {
            emit_error(&socket, "No active group call");
            return;
        };
        let is_caller = session.caller == from;
        // Remove this user (real acceptor uid only)
        session.participants.retain(|p| p != &from);
        // Real remaining participants (strip sentinels/reject-markers)
        let remaining: Vec<String> = session.participants.iter()
            .filter(|p| !p.starts_with('-') && !p.starts_with('@'))
            .cloned()
            .collect();

        if is_caller || remaining.is_empty() {
            calls.remove(&group_id);
        }
        (is_caller, remaining)
    };

    let users = state.users.read().await;
    let groups = state.groups.read().await;
    let all_members: Vec<String> = groups.get(&group_id)
        .map(|g| g.members.clone())
        .unwrap_or_default();

    if is_caller || remaining.is_empty() {
        drop(groups);
        for member_id in &all_members {
            if member_id == &from { continue; }
            if let Some(ms) = users.get(member_id) {
                for sid in &ms.socket_ids {
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::GROUP_CALL_ENDED,
                            &GroupCallEndedPayload {
                                group_id: group_id.clone(),
                                reason: format!("'{from}' ended the call"),
                            });
                    }
                }
            }
        }
        let _ = socket.emit(event::GROUP_CALL_ENDED,
            &GroupCallEndedPayload { group_id: group_id.clone(), reason: "Call ended".into() });
        info!("[G☎] '{from}' ended group call '{group_id}'");
    } else {
        drop(groups);
        let left = GroupMemberLeftPayload { group_id: group_id.clone(), user_id: from.clone() };
        for uid in &remaining {
            if let Some(ms) = users.get(uid) {
                for sid in &ms.socket_ids {
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::GROUP_MEMBER_LEFT, &left);
                    }
                }
            }
        }
        let _ = socket.emit(event::GROUP_CALL_ENDED,
            &GroupCallEndedPayload { group_id: group_id.clone(), reason: "You left the call".into() });
        info!("[G☎] '{from}' left group call '{group_id}' ({} remaining)", remaining.len());
    }
}

// ── Ring-timeout for group calls ──────────────────────────────────────────────

fn spawn_group_ring_timeout(
    caller_id: String,
    group_id:  String,
    members:   Vec<String>,
    caller_socket: SocketRef,
    calls:     CallMap,
    users:     UserMap,
) -> Arc<tokio::task::AbortHandle> {
    let task = tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(RING_TIMEOUT_SEC)).await;

        let mut calls_w = calls.write().await;
        if let Some(s) = calls_w.get(&group_id) {
            if s.status == CallStatus::Ringing && s.caller == caller_id {
                calls_w.remove(&group_id);
                drop(calls_w);

                let _ = caller_socket.emit(event::GROUP_CALL_ENDED,
                    &GroupCallEndedPayload {
                        group_id: group_id.clone(),
                        reason: "No answer".into(),
                    });

                let users_r = users.read().await;
                for member_id in &members {
                    if member_id == &caller_id { continue; }
                    if let Some(ms) = users_r.get(member_id) {
                        for sid in &ms.socket_ids {
                            if let Some(peer) = caller_socket.broadcast().get_socket(*sid) {
                                let _ = peer.emit(event::GROUP_CALL_ENDED,
                                    &GroupCallEndedPayload {
                                        group_id: group_id.clone(),
                                        reason: "No answer".into(),
                                    });
                            }
                        }
                    }
                }

                warn!("[⏱] Group call '{group_id}' timed out");
            }
        }
    });
    Arc::new(task.abort_handle())
}

// ── Shared helper to forcibly terminate a group call ─────────────────────────

async fn end_group_call_fully(
    socket: &SocketRef,
    state: &AppState,
    group_id: &str,
    reason: &str,
) {
    let mut calls = state.calls.write().await;
    let Some(session) = calls.remove(group_id) else { return; };

    // Strip sentinels — only notify real participants (acceptors including caller)
    let real_participants: Vec<String> = session.participants.iter()
        .filter(|p| !p.starts_with('-') && !p.starts_with('@'))
        .cloned()
        .collect();
    drop(calls);

    let users = state.users.read().await;
    let my_sid = socket.id;
    for uid in &real_participants {
        if let Some(ms) = users.get(uid) {
            for sid in &ms.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::GROUP_CALL_ENDED,
                        &GroupCallEndedPayload {
                            group_id: group_id.to_string(),
                            reason: reason.to_owned(),
                        });
                } else if *sid == my_sid {
                    let _ = socket.emit(event::GROUP_CALL_ENDED,
                        &GroupCallEndedPayload {
                            group_id: group_id.to_string(),
                            reason: reason.to_owned(),
                        });
                }
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}

async fn identity_matches(state: &AppState, socket_id: Sid, user_id: &str) -> bool {
    let map = state.users.read().await;
    map.get(user_id)
        .map(|s| s.socket_ids.contains(&socket_id))
        .unwrap_or(false)
}