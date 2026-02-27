// src/handlers/call.rs

use socketioxide::extract::{Data, SocketRef, State};
use socketioxide::socket::Sid;
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    fcm::send_fcm_notification,
    types::{
        event, AppState, CallEndedPayload, CallMap, CallPayload, CallSession,
        CallStatus, CallTarget, ErrorPayload, IncomingCallPayload, UserMap,
        RING_TIMEOUT_SEC,
    },
};

pub async fn on_call(
    socket: SocketRef,
    State(state): State<AppState>,
    Data(payload): Data<CallPayload>,
) {
    let CallPayload { from, to } = payload;
    let socket_id = socket.id;  // Sid

    if from == to {
        emit_error(&socket, "Cannot call yourself");
        return;
    }
    // Ensure the socket actually belongs to the claimed user_id
    if !identity_matches(&state, socket_id, &from).await {
        emit_error(&socket, "Identity mismatch");
        return;
    }

    let users = state.users.read().await;
    let calls = state.calls.read().await;

    let Some(callee_state) = users.get(&to) else {
        emit_error(&socket, &format!("User '{to}' is not registered"));
        return;
    };

    // If a call to this callee already exists from the same caller
    if let Some(existing) = calls.get(&to) {
        if existing.caller != from {
            emit_error(&socket, &format!("'{to}' is busy on another call"));
            return;
        }
        return; 
    }

    // Prevent the caller from placing a new call while already in an active one
    let caller_busy = calls.values().any(|s| {
        (s.caller == from || s.target.id() == from.as_str()) && s.status == CallStatus::Active
    });
    if caller_busy {
        emit_error(&socket, "You are already on a call");
        return;
    }

    // Deliver "incoming_call" to every open tab of the callee
    for sid in &callee_state.socket_ids {
        if let Some(peer) = socket.broadcast().get_socket(*sid) {
            let _ = peer.emit(event::INCOMING_CALL, &IncomingCallPayload { from: from.clone() });
        }
    }

    // If callee is offline but has FCM tokens, send push notifications in a background task
    let fcm_tokens = callee_state.fcm_tokens.clone();
    if !fcm_tokens.is_empty() {
        let (f, t2, http) = (from.clone(), to.clone(), state.http.clone());
        let auth_clone = state.auth.clone();
        tokio::spawn(async move {
            for token in fcm_tokens {
                send_fcm_notification(&token, &f, &t2, auth_clone.as_ref(), &http).await;
            }
        });
    } else if !callee_state.is_online() {
        emit_error(&socket, &format!("'{to}' is offline and has no FCM token registered"));
        return;
    }

    drop(calls);
    drop(users);

    // Start a background task that auto-cancels the call after RING_TIMEOUT_SEC
    let timeout_handle = spawn_ring_timeout(
        from.clone(), to.clone(),
        socket.clone(),
        state.calls.clone(),
        state.users.clone(),
    );

    // Record the call session (keyed by callee id)
    let mut calls = state.calls.write().await;
    calls.insert(to.clone(), CallSession {
        caller:           from.clone(),
        target:           CallTarget::User(to.clone()),
        status:           CallStatus::Ringing,
        caller_socket_id: socket_id,
        participants:     Vec::new(),
        _timeout_handle:  timeout_handle, // Dropping this aborts the timeout task
    });

    info!("[~] Ringing: {from} → {to}");
}

// ── Ring-timeout ──────────────────────────────────────────────────────────────

// Spawns a task that fires after RING_TIMEOUT_SEC.
// If the call is still Ringing at that point, it is removed and both sides are notified.
fn spawn_ring_timeout(
    caller_id: String,
    callee_id: String,
    caller_socket: SocketRef,
    calls: CallMap,
    users: UserMap,
) -> Arc<tokio::task::AbortHandle> {
    let task = tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(RING_TIMEOUT_SEC)).await;

        let mut calls_w = calls.write().await;
        if let Some(s) = calls_w.get(&callee_id) {
            if s.status == CallStatus::Ringing && s.caller == caller_id {
                calls_w.remove(&callee_id);
                drop(calls_w);

                // Tell caller the ring timed out
                let _ = caller_socket.emit(event::CALL_ENDED,
                    &CallEndedPayload { reason: "No answer".into() });
                
                // Dismiss ringing UI on all callee tabs
                let users_r = users.read().await;
                if let Some(cs) = users_r.get(&callee_id) {
                    for sid in &cs.socket_ids {
                        if let Some(peer) = caller_socket.broadcast().get_socket(*sid) {
                            let _ = peer.emit(event::CALL_ENDED,
                                &CallEndedPayload { reason: "No answer".into() });
                        }
                    }
                }

                warn!("[⏱] {caller_id} → {callee_id} timed out");
            }
        }
    });
    Arc::new(task.abort_handle())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}

// Returns true if the given socket_id is registered under user_id.
pub async fn identity_matches(state: &AppState, socket_id: Sid, user_id: &str) -> bool {
    let map = state.users.read().await;
    map.get(user_id)
        .map(|s| s.socket_ids.contains(&socket_id))
        .unwrap_or(false)
}