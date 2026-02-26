pub mod register;       // User registration & presence
pub mod store_fcm_token;// Save push notification token for offline delivery
pub mod call;           // Initiate a 1-to-1 call
pub mod cancel;         // Caller cancels a ringing call
pub mod accept;         // Callee accepts a ringing call
pub mod reject;         // Callee rejects a ringing call
pub mod cut_call;       // Either side ends an active call
pub mod disconnect;     // Socket disconnect cleanup
pub mod group;          // Group CRUD (create / add member / remove member)
pub mod group_call;     // Group call lifecycle (start / accept / reject / leave)