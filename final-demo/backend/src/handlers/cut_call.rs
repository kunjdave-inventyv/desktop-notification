// src/handlers/cut_call.rs — Either side ends an active 1-to-1 call.

use socketioxide::extract::{Data, SocketRef, State};
use socketioxide::socket::Sid;
use tracing::info;

use crate::types::{
    event, AppState, CallEndedPayload, CallStatus, CallTarget, CutCallPayload, ErrorPayload,
};

pub async fn on_cut_call(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<CutCallPayload>,
) {
    let CutCallPayload { from, to } = payload;
    let socket_id = socket.id;

    if !super::call::identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let mut calls = state.calls.write().await;

    // Case 1: `from` is callee (call keyed by from)
    if let Some(s) = calls.get(&from) {
        if s.caller == to && s.status == CallStatus::Active
            && matches!(&s.target, CallTarget::User(_)) {
            calls.remove(&from);
            drop(calls);
            notify_both_sides(&socket, &state, &from, &to, socket_id).await;
            info!("[☎] '{from}' ended call with '{to}'");
            return;
        }
    }

    // Case 2: `from` is caller (call keyed by to)
    if let Some(s) = calls.get(&to) {
        if s.caller == from && s.status == CallStatus::Active
            && matches!(&s.target, CallTarget::User(_)) {
            calls.remove(&to);
            drop(calls);
            notify_both_sides(&socket, &state, &to, &from, socket_id).await;
            info!("[☎] '{from}' ended call with '{to}'");
            return;
        }
    }

    emit_error(&socket, "No active call to cut");
}

async fn notify_both_sides(
    socket: &SocketRef,
    state: &AppState,
    callee_id: &str,
    caller_id: &str,
    initiator_sid: Sid,
) {
    let users = state.users.read().await;

    let initiator_uid = get_user_for_socket(state, initiator_sid).await;
    let (other_id, same_id) = if initiator_uid.as_deref() == Some(callee_id) {
        (caller_id, callee_id)
    } else {
        (callee_id, caller_id)
    };

    // Notify the other side (all tabs)
    if let Some(s) = users.get(other_id) {
        for sid in &s.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                let _ = peer.emit(event::CALL_ENDED,
                    &CallEndedPayload { reason: format!("Call ended by {same_id}") });
            }
        }
    }

    // Notify same-side other tabs
    if let Some(s) = users.get(same_id) {
        for sid in &s.socket_ids {
            if *sid != initiator_sid {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_ENDED,
                        &CallEndedPayload { reason: "You ended the call".into() });
                }
            }
        }
    }

    // Acknowledge initiating socket
    let _ = socket.emit(event::CALL_ENDED,
        &CallEndedPayload { reason: "Call ended".into() });
}

async fn get_user_for_socket(state: &AppState, socket_id: Sid) -> Option<String> {
    let map = state.users.read().await;
    for (uid, s) in map.iter() {
        if s.socket_ids.contains(&socket_id) {
            return Some(uid.clone());
        }
    }
    None
}

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}