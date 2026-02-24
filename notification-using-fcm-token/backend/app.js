// Source - https://stackoverflow.com/q/77659210
// Posted by st3ph4nn, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-23, License - CC BY-SA 4.0

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import express from "express";
import "dotenv/config";
import cors from "cors";

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
  })
);

app.use(function (req, res, next) {
  res.setHeader("Content-Type", "application/json");
  next();
});

initializeApp({
  credential: applicationDefault(),
});

app.post("/send", function (req, res) {
  const receivedTokens = req.body.fcmTokens;
  const { title, body } = req.body;

  if (!Array.isArray(receivedTokens) || receivedTokens.length === 0) {
    return res.status(400).json({
      error: "Invalid fcmTokens. Must be a non-empty array.",
    });
  }

  if (!title || !body) {
    return res.status(400).json({
      error: "Title and body are required.",
    });
  }

  console.log(`Sending message to ${receivedTokens.length} tokens`);

  const message = {
    data: {
      title: title,
      body: body,
    },
    tokens: receivedTokens,
  };

  getMessaging()
    .sendEachForMulticast(message)
    .then((response) => {
      console.log("Successfully sent messages:", response.successCount);
      res.status(200).json({
        message: "Successfully sent message",
        successCount: response.successCount,
        failureCount: response.failureCount,
        tokens: receivedTokens,
      });
    })
    .catch((error) => {
      console.error("Error sending message:", error);
      res.status(500).json({
        error: "Failed to send FCM message",
        details: error.message || error,
      });
    });
});

app.get("/ping", function (req, res) {
  console.log("process env: ", process.env.GOOGLE_APPLICATION_CREDENTIALS);
  res.status(200).json({
    message: "Successfully pinged test",
    file: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
});

app.listen(3000, function () {
  console.log("Server started on port 3000");
});

