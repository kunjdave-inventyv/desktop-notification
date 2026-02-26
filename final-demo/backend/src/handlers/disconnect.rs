// src/handlers/disconnect.rs — Socket disconnect cleanup.

use socketioxide::extract::{SocketRef, State};
use socketioxide::socket::Sid;
use tracing::info;

use crate::types::{
    event, AppState, CallCancelledPayload, CallEndedPayload, CallTarget,
    UserOfflinePayload,
};

pub async fn on_disconnect(socket: SocketRef, State(state): State<AppState>) {
    let socket_id: Sid = socket.id;

    // Find which user owns this socket
    let uid = {
        let map = state.users.read().await;
        map.iter()
            .find(|(_, s)| s.socket_ids.contains(&socket_id))
            .map(|(uid, _)| uid.clone())
    };

    let Some(uid) = uid else { return; };

    // Remove socket from user's tab list
    let went_fully_offline = {
        let mut map = state.users.write().await;
        if let Some(s) = map.get_mut(&uid) {
            s.socket_ids.retain(|sid| *sid != socket_id);
            s.socket_ids.is_empty()
        } else { false }
    };

    if !went_fully_offline {
        info!("[-] '{uid}' closed tab {socket_id} (still has other tabs)");
        return;
    }

    // ── Fully offline — clean up any call ────────────────────────────────────

    let mut calls = state.calls.write().await;

    // Was this user the callee or group target?
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
        // Was this user the caller (for 1-to-1)?
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
            // Was this user the caller for a group call?
            let group_call_key: Option<String> = calls.iter()
                .find(|(_, s)| s.caller == uid && matches!(s.target, CallTarget::Group(_)))
                .map(|(k, _)| k.clone());

            if let Some(group_id) = group_call_key {
                let session = calls.remove(&group_id).unwrap();
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
                                        &crate::types::GroupCallEndedPayload {
                                            group_id: group_id.clone(),
                                            reason: format!("'{uid}' disconnected"),
                                        });
                                }
                            }
                        }
                    }
                }
                let _ = session;
            } else {
                drop(calls);
            }
        }
    }

    // ── Broadcast user_offline ────────────────────────────────────────────────
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