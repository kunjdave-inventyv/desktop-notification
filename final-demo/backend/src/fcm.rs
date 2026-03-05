// src/fcm.rs

use gcp_auth::TokenProvider;
use tracing::{error, info, warn};

use crate::types::FCM_PROJECT_ID;

/// What the caller should do with a token after a send attempt.
#[derive(Debug, PartialEq)]
pub enum TokenStatus {
    Ok,
    /// FCM says the token is permanently invalid:
    /// Caller must evict this token from the user map so it is never retried.
    Evict,
}

// ── Call notification ─────────────────────────────────────────────────────────

pub async fn send_fcm_notification(
    fcm_token: &str,
    from:      &str,
    to:        &str,
    video:     bool,
    auth:      &dyn TokenProvider,
    http:      &reqwest::Client,
) -> TokenStatus {
    let bearer = match get_bearer(auth).await { Some(t) => t, None => return TokenStatus::Ok };

    let url  = format!("https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send");
    
    let title = if video {
        format!("📹 Incoming video call from {from}")
    } else {
        format!("📞 Incoming audio call from {from}")
    };
    
    let body = serde_json::json!({
        "message": {
            "token": fcm_token,
            "data": {
                "action": if video { "incoming_video_call" } else { "incoming_call" },
                "caller": from,
                "callee": to,
                "title":  title,
                "body":   "Tap Accept to answer",
                "video":  if video { "true" } else { "false" },
            },
            "android": { "priority": "high" },
            "apns":    { "headers": { "apns-priority": "10" } },
            "webpush": { "headers": { "Urgency": "high" } },
        }
    });

    send_raw(fcm_token, &url, &bearer, &body, http, "call").await
}

// ── Chat DM notification ──────────────────────────────────────────────────────

pub async fn send_chat_dm_notification(
    fcm_token: &str,
    from:      &str,
    to:        &str,
    content:   &str,
    auth:      &dyn TokenProvider,
    http:      &reqwest::Client,
) -> TokenStatus {
    let bearer = match get_bearer(auth).await { Some(t) => t, None => return TokenStatus::Ok };

    let preview: String = content.chars().take(200).collect();
    let url  = format!("https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send");
    let body = serde_json::json!({
        "message": {
            "token": fcm_token,
            "data": {
                "action":  "chat_message",
                "sender":  from,   // "from" is reserved by FCM
                "to":      to,
                "content": preview,
            },
            "android": { "priority": "high" },
            "apns":    { "headers": { "apns-priority": "10" } },
            "webpush": { "headers": { "Urgency": "high" } },
        }
    });

    send_raw(fcm_token, &url, &bearer, &body, http, "chat-dm").await
}

// ── Chat group notification ───────────────────────────────────────────────────

pub async fn send_chat_group_notification(
    fcm_token:  &str,
    from:       &str,
    group_id:   &str,
    group_name: &str,
    content:    &str,
    auth:       &dyn TokenProvider,
    http:       &reqwest::Client,
) -> TokenStatus {
    let bearer = match get_bearer(auth).await { Some(t) => t, None => return TokenStatus::Ok };

    let preview: String = content.chars().take(200).collect();
    let url  = format!("https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send");
    let body = serde_json::json!({
        "message": {
            "token": fcm_token,
            "data": {
                "action":     "chat_message",
                "sender":     from,   // "from" is reserved by FCM
                "group_id":   group_id,
                "group_name": group_name,
                "content":    preview,
            },
            "android": { "priority": "high" },
            "apns":    { "headers": { "apns-priority": "10" } },
            "webpush": { "headers": { "Urgency": "high" } },
        }
    });

    send_raw(fcm_token, &url, &bearer, &body, http, "chat-group").await
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async fn get_bearer(auth: &dyn TokenProvider) -> Option<String> {
    match auth.token(&["https://www.googleapis.com/auth/firebase.messaging"]).await {
        Ok(t)  => Some(t.as_str().to_owned()),
        Err(e) => { error!("[fcm] token error: {e}"); None }
    }
}

async fn send_raw(
    fcm_token: &str,
    url:       &str,
    bearer:    &str,
    body:      &serde_json::Value,
    http:      &reqwest::Client,
    label:     &str,
) -> TokenStatus {
    let suffix = &fcm_token[fcm_token.len().saturating_sub(12)..];

    match http.post(url).bearer_auth(bearer).json(body).send().await {
        Ok(r) if r.status().is_success() => {
            info!("[fcm/{label}] ✓ push sent to …{suffix}");
            TokenStatus::Ok
        }
        Ok(r) => {
            let status = r.status().as_u16();
            let text   = r.text().await.unwrap_or_default();

            // These two errors are permanent — the token will never work again.
            //   404                       → app uninstalled or storage cleared
            //   403 + SENDER_ID_MISMATCH  → token registered against wrong Firebase project
            if status == 404 || (status == 403 && text.contains("SENDER_ID_MISMATCH")) {
                warn!("[fcm/{label}] ✗ dead token …{suffix} (HTTP {status}) — evicting");
                TokenStatus::Evict
            } else {
                error!("[fcm/{label}] ✗ HTTP {status}: {text}");
                TokenStatus::Ok
            }
        }
        Err(e) => {
            error!("[fcm/{label}] request error: {e}");
            TokenStatus::Ok
        }
    }
}