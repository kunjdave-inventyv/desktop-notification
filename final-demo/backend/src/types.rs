// src/types.rs — Central type definitions shared across all handler modules.

use gcp_auth::TokenProvider;
use serde::{Deserialize, Serialize};
use socketioxide::socket::Sid;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

// ── Constants ─────────────────────────────────────────────────────────────────

pub const FCM_PROJECT_ID: &str = "notification-25684";
pub const RING_TIMEOUT_SEC: u64 = 30; // Seconds before unanswered call auto-cancels

// ── User ──────────────────────────────────────────────────────────────────────

/// A registered user. Persists in-memory even when offline so FCM tokens survive reconnects.
/// user_id doubles as the display name chosen at signup.
#[derive(Debug, Clone)]
pub struct UserState {
    pub user_id:    String,
    pub socket_ids: Vec<Sid>,       // One entry per open browser tab
    pub fcm_tokens: Vec<String>,    // Push tokens for offline notification delivery
}

impl UserState {
    pub fn new(user_id: impl Into<String>) -> Self {
        Self { user_id: user_id.into(), socket_ids: Vec::new(), fcm_tokens: Vec::new() }
    }
    /// User is online if they have at least one connected socket (tab).
    pub fn is_online(&self) -> bool { !self.socket_ids.is_empty() }
}

/// Shared, async-safe map of user_id → UserState.
pub type UserMap = Arc<RwLock<HashMap<String, UserState>>>;

// ── Group ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub group_id:   String,
    pub name:       String,
    pub members:    Vec<String>,    // All member user_ids, including creator
    pub created_by: String,
}

impl Group {
    pub fn new(group_id: impl Into<String>, name: impl Into<String>,
               created_by: impl Into<String>, members: Vec<String>) -> Self {
        Self { group_id: group_id.into(), name: name.into(),
               created_by: created_by.into(), members }
    }
}

/// Shared, async-safe map of group_id → Group.
pub type GroupMap = Arc<RwLock<HashMap<String, Group>>>;

// ── Call session ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum CallStatus { Ringing, Active }

#[derive(Debug, Clone, PartialEq)]
pub enum CallTarget {
    User(String),   // 1-to-1 call
    Group(String),  // Group call
}

impl CallTarget {
    pub fn id(&self) -> &str {
        match self { CallTarget::User(id) | CallTarget::Group(id) => id }
    }
}

/// Accepted participants for group calls.
/// Also holds sentinel strings like `"@total:N"` (invited count) and `"-user_id"` (reject markers).
pub type GroupParticipants = Vec<String>;

#[derive(Debug, Clone)]
pub struct CallSession {
    pub caller:           String,           // User who initiated the call
    pub target:           CallTarget,       // Who/what is being called
    pub status:           CallStatus,
    pub caller_socket_id: Sid,              // Originating tab of the caller
    pub participants:     GroupParticipants,// Group call state; empty for 1-to-1
    pub _timeout_handle:  Arc<tokio::task::AbortHandle>, // Aborts ring-timeout task on drop
}

/// Shared, async-safe map of callee_id/group_id → CallSession.
pub type CallMap = Arc<RwLock<HashMap<String, CallSession>>>;

// ── AppState ──────────────────────────────────────────────────────────────────

/// Cloneable application state injected into every Socket.IO handler.
#[derive(Clone)]
pub struct AppState {
    pub users:  UserMap,
    pub groups: GroupMap,
    pub calls:  CallMap,
    pub auth:   Arc<dyn TokenProvider>, // GCP credential provider for FCM
    pub http:   reqwest::Client,
}

// ── Inbound payloads (client → server) ───────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterPayload      { pub user_id: String }
#[derive(Debug, Deserialize)]
pub struct StoreFcmTokenPayload { pub user_id: String, pub token: String }

// 1-to-1 call events
#[derive(Debug, Deserialize)]
pub struct CallPayload    { pub from: String, pub to: String }
#[derive(Debug, Deserialize)]
pub struct CancelPayload  { pub from: String, pub to: String } // Caller cancels ringing
#[derive(Debug, Deserialize)]
pub struct AcceptPayload  { pub from: String, pub to: String } // from=callee, to=caller
#[derive(Debug, Deserialize)]
pub struct RejectPayload  { pub from: String, pub to: String } // from=callee, to=caller
#[derive(Debug, Deserialize)]
pub struct CutCallPayload { pub from: String, pub to: String } // Either side hangs up

// Group management
#[derive(Debug, Deserialize)]
pub struct CreateGroupPayload {
    pub created_by: String,
    pub name:       String,
    pub members:    Vec<String>,
}
#[derive(Debug, Deserialize)]
pub struct AddGroupMemberPayload {
    pub group_id: String,
    pub added_by: String,
    pub user_id:  String,
}
#[derive(Debug, Deserialize)]
pub struct RemoveGroupMemberPayload {
    pub group_id:   String,
    pub removed_by: String,
    pub user_id:    String,
}

// Group call events
#[derive(Debug, Deserialize)]
pub struct GroupCallPayload   { pub from: String, pub group_id: String }
#[derive(Debug, Deserialize)]
pub struct GroupAcceptPayload { pub from: String, pub group_id: String }
#[derive(Debug, Deserialize)]
pub struct GroupRejectPayload { pub from: String, pub group_id: String }
#[derive(Debug, Deserialize)]
pub struct GroupCutPayload    { pub from: String, pub group_id: String }

// ── Event name constants (server → client) ────────────────────────────────────

pub mod event {
    // Presence
    pub const REGISTERED:           &str = "registered";
    pub const USER_LIST:            &str = "user_list";
    pub const USER_ONLINE:          &str = "user_online";
    pub const USER_OFFLINE:         &str = "user_offline";
    pub const REGISTER_ERROR:       &str = "register_error";

    // 1-to-1 call lifecycle
    pub const INCOMING_CALL:        &str = "incoming_call";
    pub const CALL_ACCEPTED:        &str = "call_accepted";
    pub const CALL_REJECTED:        &str = "call_rejected";
    pub const CALL_CANCELLED:       &str = "call_cancelled";
    pub const CALL_ENDED:           &str = "call_ended";

    // Group management
    pub const GROUP_CREATED:        &str = "group_created";
    pub const GROUP_UPDATED:        &str = "group_updated";
    pub const GROUP_DELETED:        &str = "group_deleted";

    // Group call lifecycle
    pub const GROUP_INCOMING_CALL:  &str = "group_incoming_call";
    pub const GROUP_MEMBER_JOINED:  &str = "group_member_joined";
    pub const GROUP_MEMBER_LEFT:    &str = "group_member_left";
    pub const GROUP_CALL_ENDED:     &str = "group_call_ended";

    pub const ERROR:                &str = "error";
}

// ── Outbound payloads (server → client) ──────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct RegisteredPayload { pub user_id: String, pub socket_id: String }

#[derive(Debug, Serialize, Clone)]
pub struct UserEntry { pub user_id: String, pub is_online: bool }

#[derive(Debug, Serialize)]
pub struct UserListPayload   { pub users: Vec<UserEntry> }
#[derive(Debug, Serialize)]
pub struct UserOnlinePayload { pub user_id: String }
#[derive(Debug, Serialize)]
pub struct UserOfflinePayload{ pub user_id: String }

// 1-to-1 call responses
#[derive(Debug, Serialize)]
pub struct IncomingCallPayload  { pub from: String }
#[derive(Debug, Serialize)]
pub struct CallAcceptedPayload  { pub by: String }
#[derive(Debug, Serialize)]
pub struct CallRejectedPayload  { pub by: String }
#[derive(Debug, Serialize)]
pub struct CallCancelledPayload { pub by: String }
#[derive(Debug, Serialize)]
pub struct CallEndedPayload     { pub reason: String }

// Group management responses
#[derive(Debug, Serialize, Clone)]
pub struct GroupPayload {
    pub group_id:   String,
    pub name:       String,
    pub members:    Vec<String>,
    pub created_by: String,
}
impl From<&Group> for GroupPayload {
    fn from(g: &Group) -> Self {
        Self { group_id: g.group_id.clone(), name: g.name.clone(),
               members: g.members.clone(), created_by: g.created_by.clone() }
    }
}
#[derive(Debug, Serialize)]
pub struct GroupDeletedPayload { pub group_id: String }

// Group call responses
#[derive(Debug, Serialize)]
pub struct GroupIncomingCallPayload {
    pub from:       String,
    pub group_id:   String,
    pub group_name: String,
}
#[derive(Debug, Serialize)]
pub struct GroupMemberJoinedPayload { pub group_id: String, pub user_id: String }
#[derive(Debug, Serialize)]
pub struct GroupMemberLeftPayload   { pub group_id: String, pub user_id: String }
#[derive(Debug, Serialize)]
pub struct GroupCallEndedPayload    { pub group_id: String, pub reason: String }

#[derive(Debug, Serialize)]
pub struct ErrorPayload { pub message: String }