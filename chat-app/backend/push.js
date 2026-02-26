const webpush = require("web-push");

// In a real app, these should be in .env and generated only once
const vapidKeys = {
    publicKey: 'BNabC-w7D0OU7BafBOdV_ZU2BlPkt_TEXFxqtDWRNLU8X__dPDrY0hU3VQNr2Rq10c8RCRq8dVMizjNmoNApvFc',
    privateKey: 'LrQTxs53jWCHEouN3ehj70hb0MtOUOJXuJPUfXv_xJQ'
};

webpush.setVapidDetails(
    'mailto:example@yourdomain.org',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const subscriptions = new Map(); 

function subscribeUser(userId, subscription) {
    subscriptions.set(userId, subscription);
}

function sendPushNotification(userId, payload) {
    const subscription = subscriptions.get(userId);
    if (subscription) {
        console.log(`Attempting to send push to ${subscription}`);
        webpush.sendNotification(subscription, JSON.stringify(payload))
            .then(() => console.log(`Push sent successfully to ${userId}`))
            .catch(err => console.error(`Push notification failed for ${userId}:`, err));
    } else {
        console.warn(`No subscription found for user: ${userId}`);
    }
}

function hasSubscription(userId) {
    return subscriptions.has(userId);
}

module.exports = { subscribeUser, sendPushNotification, hasSubscription };
