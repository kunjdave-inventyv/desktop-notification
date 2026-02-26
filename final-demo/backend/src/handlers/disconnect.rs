// src/handlers/disconnect.rs — Socket disconnect cleanup.

use socketioxide::extract::{SocketRef, State};
use socketioxide::socket::Sid;
use tracing::info;

use crate::types::{
    event, AppState, CallCancelledPayload, CallEndedPayload, CallTarget,
    GroupCallEndedPayload, GroupMemberLeftPayload, UserOfflinePayload,
};

pub async fn on_disconnect(socket: SocketRef, State(state): State<AppState>) {
    let socket_id: Sid = socket.id;

    // Identify which user owns the disconnecting socket
    let uid = {
        let map = state.users.read().await;
        map.iter()
            .find(|(_, s)| s.socket_ids.contains(&socket_id))
            .map(|(uid, _)| uid.clone())
    };

    let Some(uid) = uid else {
        info!("[-] Unregistered socket {socket_id} disconnected");
        return;
    };

    // Remove the disconnecting socket AND prune any other stale socket_ids
    // that are no longer alive (left over from previous reconnections).
    // Without pruning, a ghost socket_id keeps went_fully_offline = false
    // and the user_offline broadcast never fires.
    let went_fully_offline = {
        let mut map = state.users.write().await;
        if let Some(s) = map.get_mut(&uid) {
            s.socket_ids.retain(|sid| *sid != socket_id);
            s.socket_ids.retain(|sid| socket.broadcast().get_socket(*sid).is_some());
            info!("[-] '{uid}' removed socket {socket_id}, {} live sockets remaining",
                s.socket_ids.len());
            s.socket_ids.is_empty()
        } else {
            false
        }
    };

    // If the user still has other live tabs open, no further action needed
    if !went_fully_offline {
        info!("[-] '{uid}' closed tab {socket_id} (still has other tabs)");
        return;
    }

    // ── Fully offline — clean up any in-progress call ─────────────────────────

    let mut calls = state.calls.write().await;

    // Case 1: user was the callee in a 1-to-1 call (call is keyed by callee's uid)
    if let Some(session) = calls.remove(&uid) {
        let caller_id = session.caller.clone();
        drop(calls);

        let users = state.users.read().await;
        if let Some(cs) = users.get(&caller_id) {
            for sid in &cs.socket_ids {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_ENDED,
                        &CallEndedPayload { reason: format!("'{uid}' disconnected") });
                }
            }
        }
    } else {
        // Case 2: user was the caller in a 1-to-1 call (call is keyed by callee's uid)
        let callee_key: Option<String> = calls.iter()
            .find(|(_, s)| s.caller == uid && matches!(s.target, CallTarget::User(_)))
            .map(|(k, _)| k.clone());

        if let Some(callee_id) = callee_key {
            calls.remove(&callee_id);
            drop(calls);

            let users = state.users.read().await;
            if let Some(cs) = users.get(&callee_id) {
                for sid in &cs.socket_ids {
                    if let Some(peer) = socket.broadcast().get_socket(*sid) {
                        let _ = peer.emit(event::CALL_CANCELLED,
                            &CallCancelledPayload { by: uid.clone() });
                    }
                }
            }
        } else {
            // Case 3: user was the initiator of a group call (call is keyed by group_id)
            let group_caller_key: Option<String> = calls.iter()
                .find(|(_, s)| s.caller == uid && matches!(s.target, CallTarget::Group(_)))
                .map(|(k, _)| k.clone());

            if let Some(group_id) = group_caller_key {
                let _session = calls.remove(&group_id).unwrap();
                drop(calls);

                let groups = state.groups.read().await;
                let users  = state.users.read().await;
                if let Some(group) = groups.get(&group_id) {
                    for member_id in &group.members {
                        if member_id == &uid { continue; }
                        if let Some(ms) = users.get(member_id) {
                            for sid in &ms.socket_ids {
                                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                                    let _ = peer.emit(event::GROUP_CALL_ENDED,
                                        &GroupCallEndedPayload {
                                            group_id: group_id.clone(),
                                            reason: format!("'{uid}' disconnected"),
                                        });
                                }
                            }
                        }
                    }
                }
                // Dropping _session aborts the ring-timeout task
            } else {
                // Case 4: user was a non-caller participant in an active group call
                // Group calls are keyed by group_id not uid, so Case 1 never catches this
                let group_participant_key: Option<String> = calls.iter()
                    .find(|(_, s)| {
                        matches!(s.target, CallTarget::Group(_))
                            && s.caller != uid
                            && s.participants.contains(&uid)
                    })
                    .map(|(k, _)| k.clone());

                if let Some(group_id) = group_participant_key {
                    let session = calls.get_mut(&group_id).unwrap();

                    session.participants.retain(|p| p != &uid);

                    // Remaining real participants (strip sentinels and reject markers)
                    let remaining: Vec<String> = session.participants.iter()
                        .filter(|p| !p.starts_with('-') && !p.starts_with('@'))
                        .cloned()
                        .collect();

                    if remaining.is_empty() {
                        calls.remove(&group_id);
                    }

                    drop(calls);

                    let users = state.users.read().await;
                    let left = GroupMemberLeftPayload {
                        group_id: group_id.clone(),
                        user_id:  uid.clone(),
                    };

                    for participant_id in &remaining {
                        if let Some(ms) = users.get(participant_id) {
                            for sid in &ms.socket_ids {
                                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                                    let _ = peer.emit(event::GROUP_MEMBER_LEFT, &left);
                                }
                            }
                        }
                    }
                } else {
                    drop(calls); // No active call — release lock
                }
            }
        }
    }

    // ── Broadcast user_offline to every other connected user ──────────────────
    let map = state.users.read().await;
    for (id, s) in map.iter() {
        if id == &uid { continue; }
        for sid in &s.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                let _ = peer.emit(event::USER_OFFLINE,
                    &UserOfflinePayload { user_id: uid.clone() });
            }
        }
    }

    info!("[-] '{uid}' fully offline");
}