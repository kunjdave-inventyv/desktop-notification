// src/handlers/cancel.rs — Caller cancels a ringing 1-to-1 call.

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::types::{event, AppState, CallCancelledPayload, CallStatus, CancelPayload, ErrorPayload};

pub async fn on_cancel(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<CancelPayload>,
) {
    let CancelPayload { from, to } = payload;

    if !super::call::identity_matches(&state, socket.id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let mut calls = state.calls.write().await;
    // Only valid if the call is still Ringing and was placed by this caller
    let valid = calls.get(&to)
        .map(|s| s.caller == from && s.status == CallStatus::Ringing)
        .unwrap_or(false);

    if !valid { return; }

    calls.remove(&to);
    drop(calls);
    
    // Notify all callee tabs so they dismiss the incoming-call UI
    let users = state.users.read().await;
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                let _ = peer.emit(event::CALL_CANCELLED,
                    &CallCancelledPayload { by: from.clone() });
            }
        }
    }

    info!("[✗] {from} cancelled call → {to}");
}

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}