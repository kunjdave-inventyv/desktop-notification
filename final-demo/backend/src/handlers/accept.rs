// // src/handlers/accept.rs — Callee accepts a ringing 1-to-1 call.

// use socketioxide::extract::{Data, SocketRef, State};
// use tracing::info;

// use crate::types::{
//     event, AcceptPayload, AppState, CallAcceptedPayload, CallEndedPayload,
//     CallStatus, ErrorPayload,
// };

// pub async fn on_accept(
//     socket: SocketRef,
//     State(state): State<AppState>,
//     Data(payload): Data<AcceptPayload>,
// ) {
//     let AcceptPayload { from, to } = payload; // from=callee, to=caller
//     let socket_id = socket.id;

//     if !super::call::identity_matches(&state, socket_id, &from).await {
//         emit_error(&socket, "Identity mismatch");
//         return;
//     }

//     let mut calls = state.calls.write().await;

//     let Some(session) = calls.get_mut(&from) else {
//         emit_error(&socket, "No active call to accept");
//         return;
//     };
//     if session.caller != to {
//         emit_error(&socket, "Caller mismatch");
//         return;
//     }

//     // Guard against double-accept: call was already answered on another tab
//     if session.status == CallStatus::Active {
//         let _ = socket.emit(event::CALL_ENDED,
//             &CallEndedPayload { reason: "Call accepted on another tab".into() });
//         return;
//     }

//     session.status = CallStatus::Active;
//     let caller_socket_id = session.caller_socket_id;
//     drop(calls);

//     let users = state.users.read().await;

//     // Notify all tabs of the caller that their call was accepted
//     if let Some(cs) = users.get(&to) {
//         for sid in &cs.socket_ids {
//             if let Some(peer) = socket.broadcast().get_socket(*sid) {
//                 let _ = peer.emit(event::CALL_ACCEPTED, &CallAcceptedPayload { by: from.clone() });
//             }
//         }
//     }

//     // Dismiss the ringing UI on all other callee tabs (they lost the race)
//     if let Some(cs) = users.get(&from) {
//         for sid in &cs.socket_ids {
//             if *sid != socket_id {
//                 if let Some(peer) = socket.broadcast().get_socket(*sid) {
//                     let _ = peer.emit(event::CALL_ENDED,
//                         &CallEndedPayload { reason: "Answered on another tab".into() });
//                 }
//             }
//         }
//     }

//     // Notify other caller tabs (not the one that placed the call) so they show "in call" state
//     if let Some(cs) = users.get(&to) {
//         for sid in &cs.socket_ids {
//             if *sid != caller_socket_id {
//                 if let Some(peer) = socket.broadcast().get_socket(*sid) {
//                     let _ = peer.emit(event::CALL_ACCEPTED,
//                         &CallAcceptedPayload { by: from.clone() });
//                 }
//             }
//         }
//     }

//     info!("[✓] '{from}' accepted call from '{to}'");
// }

// fn emit_error(socket: &SocketRef, message: &str) {
//     let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
// }
// src/handlers/accept.rs — Callee accepts a ringing 1-to-1 call.
// LiveKit: on accept → create room → generate tokens → send to both sides.

use socketioxide::extract::{Data, SocketRef, State};
use tracing::info;

use crate::{
    livekit::{create_room, dm_room_name, generate_token},
    types::{
        event, AcceptPayload, AppState, CallAcceptedPayload, CallEndedPayload,
        CallStatus, ErrorPayload, LiveKitTokenPayload,
    },
};

// event name for livekit token (add to your event mod in types.rs)
const EV_LIVEKIT_TOKEN: &str = "livekit_token";

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

    // Guard against double-accept
    if session.status == CallStatus::Active {
        let _ = socket.emit(event::CALL_ENDED,
            &CallEndedPayload { reason: "Call accepted on another tab".into() });
        return;
    }

    session.status = CallStatus::Active;
    let caller_socket_id = session.caller_socket_id;
    drop(calls);

    // ── LiveKit: create room + generate tokens ────────────────────────────────
    let room_name = dm_room_name(&from, &to);
    let lk = &state.livekit;

    // Create the room (idempotent — safe to call even if room exists)
    create_room(lk, &room_name).await;

    // Generate one token per participant
    let callee_token = generate_token(lk, &room_name, &from);
    let caller_token = generate_token(lk, &room_name, &to);

    let users = state.users.read().await;

    // ── Notify caller tabs ────────────────────────────────────────────────────
    if let Some(cs) = users.get(&to) {
        for sid in &cs.socket_ids {
            if let Some(peer) = socket.broadcast().get_socket(*sid) {
                // 1. call_accepted signal
                let _ = peer.emit(event::CALL_ACCEPTED, &CallAcceptedPayload { by: from.clone() });

                // 2. livekit token (only to the tab that placed the call)
                if *sid == caller_socket_id {
                    if let Some(ref token) = caller_token {
                        let _ = peer.emit(EV_LIVEKIT_TOKEN, &LiveKitTokenPayload {
                            room:  room_name.clone(),
                            token: token.clone(),
                            url:   lk.url.clone(),
                        });
                    }
                }
            }
        }
    }

    // ── Dismiss ringing on other callee tabs ──────────────────────────────────
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

    // ── Send LiveKit token to the accepting callee tab ────────────────────────
    if let Some(ref token) = callee_token {
        let _ = socket.emit(EV_LIVEKIT_TOKEN, &LiveKitTokenPayload {
            room:  room_name.clone(),
            token: token.clone(),
            url:   lk.url.clone(),
        });
    }

    info!("[✓] '{from}' accepted call from '{to}' — LiveKit room '{room_name}'");
}

fn emit_error(socket: &SocketRef, message: &str) {
    let _ = socket.emit(event::ERROR, &ErrorPayload { message: message.to_owned() });
}