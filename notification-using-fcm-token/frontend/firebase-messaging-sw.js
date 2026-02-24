importScripts(
  "https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyBn6oyGwcMmkxfAN5oDQYUkazm-7TKiHO0",
  authDomain: "notification-25684.firebaseapp.com",
  projectId: "notification-25684",
  messagingSenderId: "572073347602",
  appId: "1:572073347602:web:a23cfb9769182f1759a6cb",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);

  const notificationTitle = payload.data ? payload.data.title : "New Message";
  const notificationOptions = {
    body: payload.data ? payload.data.body : "You have received a new background message.",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
