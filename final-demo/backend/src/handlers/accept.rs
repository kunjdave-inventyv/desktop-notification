// src/handlers/accept.rs — Callee accepts a ringing 1-to-1 call.

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::types::{
    event, AcceptPayload, AppState, CallAcceptedPayload, CallEndedPayload,
    CallStatus, ErrorPayload,
};

pub async fn on_accept(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<AcceptPayload>,
) {
    let AcceptPayload { from, to } = payload; // from=callee, to=caller
    let socket_id = socket.id;

    if !super::call::identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let mut calls = state.calls.write().await;

    let Some(session) = calls.get_mut(&from) else {
        emit_error(&socket, "No active call to accept");
        return;
    };
    if session.caller != to {
        emit_error(&socket, "Caller mismatch");
        return;
    }
    if session.status == CallStatus::Active {
        let _ = socket.emit(event::CALL_ENDED,
            &CallEndedPayload { reason: "Call accepted on another tab".into() });
        return;
    }

    session.status = CallStatus::Active;
    let caller_socket_id = session.caller_socket_id;
    drop(calls);

    let users = state.users.read().await;

    // Notify the originating caller tab
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                let _ = peer.emit(event::CALL_ACCEPTED, &CallAcceptedPayload { by: from.clone() });
            }
        }
    }

    // Dismiss ringing on all other callee tabs
    if let Some(cs) = users.get(&from) {
        for sid in &cs.socket_ids {
            if *sid != socket_id {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_ENDED,
                        &CallEndedPayload { reason: "Answered on another tab".into() });
                }
            }
        }
    }

    // Notify other caller tabs that call is ongoing
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if *sid != caller_socket_id {
                if let Some(peer) = socket.broadcast().get_socket(*sid) {
                    let _ = peer.emit(event::CALL_ACCEPTED,
                        &CallAcceptedPayload { by: from.clone() });
                }
            }
        }
    }

    info!("[✓] '{from}' accepted call from '{to}'");
}

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}