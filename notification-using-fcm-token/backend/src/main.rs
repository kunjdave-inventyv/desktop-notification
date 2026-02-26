use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, sync::Arc};
use tower_http::cors::{Any, CorsLayer};

// ─── Shared app state ────────────────────────────────────────────────────────

struct AppState {
    http: Client,
}

// ─── Request / response types ────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendRequest {
    fcm_tokens: Option<Vec<String>>,
    title: Option<String>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SendResponse {
    message: String,
    success_count: u32,
    failure_count: u32,
    tokens: Vec<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
}

// ─── FCM API types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct FcmMulticastMessage {
    data: FcmData,
    tokens: Vec<String>,
}

#[derive(Serialize)]
struct FcmData {
    title: String,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FcmResponse {
    success_count: Option<u32>,
    failure_count: Option<u32>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Obtain a Google OAuth2 access token using Application Default Credentials.
/// Reads GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service-account
/// JSON file, then exchanges it for a short-lived bearer token via Google's
/// token endpoint.
async fn get_access_token(http: &Client) -> Result<String, String> {
    let creds_path = env::var("GOOGLE_APPLICATION_CREDENTIALS")
        .map_err(|_| "GOOGLE_APPLICATION_CREDENTIALS not set".to_string())?;

    let creds_raw = std::fs::read_to_string(&creds_path)
        .map_err(|e| format!("Failed to read credentials file: {e}"))?;

    let creds: Value = serde_json::from_str(&creds_raw)
        .map_err(|e| format!("Failed to parse credentials JSON: {e}"))?;

    let client_email = creds["client_email"]
        .as_str()
        .ok_or("Missing client_email in credentials")?;

    let private_key = creds["private_key"]
        .as_str()
        .ok_or("Missing private_key in credentials")?;

    // Build a JWT assertion for the Google token endpoint
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let header = base64_url_encode(r#"{"alg":"RS256","typ":"JWT"}"#.as_bytes());
    let claims = base64_url_encode(
        serde_json::to_string(&json!({
            "iss": client_email,
            "scope": "https://www.googleapis.com/auth/firebase.messaging",
            "aud": "https://oauth2.googleapis.com/token",
            "exp": now + 3600,
            "iat": now
        }))
        .unwrap()
        .as_bytes(),
    );

    let signing_input = format!("{header}.{claims}");
    let signature = sign_rs256(private_key, signing_input.as_bytes())?;
    let jwt = format!("{signing_input}.{signature}");

    // Exchange JWT for access token
    let resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;

    let token_json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    token_json["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No access_token in response: {token_json}"))
}

fn base64_url_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    URL_SAFE_NO_PAD.encode(input)
}

fn sign_rs256(pem: &str, data: &[u8]) -> Result<String, String> {
    use pkcs8::DecodePrivateKey;
    use rsa::{sha2::Sha256, RsaPrivateKey};
    use rsa::signature::{RandomizedSigner, SignatureEncoding};
    use rsa::pkcs1v15::SigningKey;

    let private_key =
        RsaPrivateKey::from_pkcs8_pem(pem).map_err(|e| format!("Invalid private key: {e}"))?;

    let signing_key = SigningKey::<Sha256>::new(private_key);
    let mut rng = rand::thread_rng();
    let sig = signing_key
        .sign_with_rng(&mut rng, data)
        .to_bytes();

    Ok(base64_url_encode(&sig))
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async fn send_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SendRequest>,
) -> Result<Json<SendResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate tokens
    let tokens = payload.fcm_tokens.unwrap_or_default();
    if tokens.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid fcmTokens. Must be a non-empty array.".into(),
                details: None,
            }),
        ));
    }

    // Validate title + body
    let title = payload.title.filter(|s| !s.is_empty()).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Title and body are required.".into(),
                details: None,
            }),
        )
    })?;

    let body = payload.body.filter(|s| !s.is_empty()).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Title and body are required.".into(),
                details: None,
            }),
        )
    })?;

    println!("Sending message to {} tokens", tokens.len());

    // Get OAuth2 access token
    let access_token = get_access_token(&state.http).await.map_err(|e| {
        eprintln!("Auth error: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to authenticate with Google".into(),
                details: Some(e),
            }),
        )
    })?;

    // Read project_id from credentials file
    let creds_path = env::var("GOOGLE_APPLICATION_CREDENTIALS").unwrap_default();
    let project_id = get_project_id(&creds_path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to read project_id".into(),
                details: Some(e),
            }),
        )
    })?;

    // Build FCM request
    let fcm_url = format!(
        "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    );

    // FCM v1 API only supports single messages; we replicate sendEachForMulticast
    let mut success_count = 0u32;
    let mut failure_count = 0u32;

    for token in &tokens {
        let fcm_body = json!({
            "message": {
                "token": token,
                "data": {
                    "title": title,
                    "body": body
                }
            }
        });

        let resp = state
            .http
            .post(&fcm_url)
            .bearer_auth(&access_token)
            .json(&fcm_body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => success_count += 1,
            Ok(r) => {
                eprintln!("FCM error for token {token}: {}", r.status());
                failure_count += 1;
            }
            Err(e) => {
                eprintln!("Request error for token {token}: {e}");
                failure_count += 1;
            }
        }
    }

    println!("Successfully sent messages: {success_count}");

    Ok(Json(SendResponse {
        message: "Successfully sent message".into(),
        success_count,
        failure_count,
        tokens,
    }))
}

async fn ping_handler() -> Json<Value> {
    let creds = env::var("GOOGLE_APPLICATION_CREDENTIALS").unwrap_or_default();
    println!("process env: {creds}");
    Json(json!({
        "message": "Successfully pinged test",
        "file": creds
    }))
}

// ─── Utilities ────────────────────────────────────────────────────────────────

fn get_project_id(creds_path: &str) -> Result<String, String> {
    let raw = std::fs::read_to_string(creds_path)
        .map_err(|e| format!("Cannot read credentials: {e}"))?;
    let v: Value =
        serde_json::from_str(&raw).map_err(|e| format!("Cannot parse credentials: {e}"))?;
    v["project_id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing project_id".into())
}

// Convenience trait so we can call .unwrap_default() on env::var results
trait UnwrapDefault {
    fn unwrap_default(self) -> String;
}
impl UnwrapDefault for Result<String, env::VarError> {
    fn unwrap_default(self) -> String {
        self.unwrap_or_default()
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    // Load .env file if present
    dotenvy::dotenv().ok();

    let state = Arc::new(AppState {
        http: Client::new(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::DELETE,
            Method::PUT,
            Method::PATCH,
        ])
        .allow_headers(Any);

    let app = Router::new()
        .route("/send", post(send_handler))
        .route("/ping", get(ping_handler))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started on port 3000");
    axum::serve(listener, app).await.unwrap();
}