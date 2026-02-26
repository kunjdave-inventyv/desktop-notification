// src/handlers/reject.rs — Callee rejects a ringing 1-to-1 call.

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::types::{
    event, AppState, CallEndedPayload, CallRejectedPayload, CallStatus,
    ErrorPayload, RejectPayload,
};

pub async fn on_reject(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<RejectPayload>,
) {
    let RejectPayload { from, to } = payload; // from=callee, to=caller
    let socket_id = socket.id;

    if !super::call::identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let mut calls = state.calls.write().await;
    let valid = calls.get(&from)
        .map(|s| s.caller == to && s.status == CallStatus::Ringing)
        .unwrap_or(false);

    if !valid {
        emit_error(&socket, "No ringing call to reject");
        return;
    }

    let caller_socket_id = calls[&from].caller_socket_id;
    calls.remove(&from);
    drop(calls);

    let users = state.users.read().await;

    // Notify the originating caller tab
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if *sid == caller_socket_id {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_REJECTED,
                        &CallRejectedPayload { by: from.clone() });
                }
                break;
            }
        }
    }

    // Dismiss ringing on all other callee tabs
    if let Some(cs) = users.get(&from) {
        for sid in &cs.socket_ids {
            if *sid != socket_id {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_ENDED,
                        &CallEndedPayload { reason: "Rejected on another tab".into() });
                }
            }
        }
    }

    info!("[✗] '{from}' rejected call from '{to}'");
}

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}