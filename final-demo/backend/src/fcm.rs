use gcp_auth::TokenProvider;
use tracing::{error, info};

use crate::types::FCM_PROJECT_ID;

pub async fn send_fcm_notification(
    fcm_token: &str,
    from: &str,
    to: &str,
    auth: &dyn TokenProvider,
    http: &reqwest::Client,
) {
    let scopes = &["https://www.googleapis.com/auth/firebase.messaging"];

    let token = match auth.token(scopes).await {
        Ok(t) => t,
        Err(e) => {
            error!("[fcm] token error: {e}");
            return;
        }
    };

    let url = format!(
        "https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send"
    );

    let body = serde_json::json!({
        "message": {
            "token": fcm_token,
            "data": {
                "action": "incoming_call",
                "caller": from,
                "callee": to,
                "title":  format!("📞 Incoming call from {from}"),
                "body":   "Tap Accept to answer",
            },
            "android": { "priority": "high" },
            "apns":    { "headers": { "apns-priority": "10" } },
            "webpush": { "headers": { "Urgency": "high" } },
        }
    });

    let suffix = &fcm_token[fcm_token.len().saturating_sub(12)..];

    match http
        .post(&url)
        .bearer_auth(token.as_str())
        .json(&body)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            info!("[fcm] ✓ push sent to …{suffix}");
        }
        Ok(r) => {
            error!(
                "[fcm] ✗ HTTP {}: {}",
                r.status(),
                r.text().await.unwrap_or_default()
            );
        }
        Err(e) => error!("[fcm] request error: {e}"),
    }
}