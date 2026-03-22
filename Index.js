require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// Environment Variables (Render-এর সেটিংস থেকে এগুলো সেট করতে হবে)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ১. Webhook Verification (Facebook Messenger-এর সাথে কানেক্ট করার জন্য)
app.get("/webhook", (req, res) => {
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// ২. ইনকামিং মেসেজ হ্যান্ডেল করা
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async function(entry) {
      if (entry.messaging && entry.messaging[0]) {
        let event = entry.messaging[0];
        let senderId = event.sender.id;

        if (event.message && event.message.text) {
          let userMessage = event.message.text;
          console.log(`Received message: ${userMessage}`);

          // FAQ Shortcut (ঐচ্ছিক)
          if (userMessage.toLowerCase().includes("price")) {
            sendMessage(senderId, "আমাদের প্রোডাক্টের দাম ৫০০ টাকা।");
          } else {
            // Gemini AI থেকে উত্তর আনা
            const aiReply = await getGeminiResponse(userMessage);
            sendMessage(senderId, aiReply);
          }
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ৩. রিপ্লাই পাঠানোর ফাংশন
function sendMessage(senderId, responseText) {
  let requestBody = {
    recipient: { id: senderId },
    message: { text: responseText }
  };

  request({
    uri: "https://graph.facebook.com/v12.0/me/messages",
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: "POST",
    json: requestBody
  }, (err, res, body) => {
    if (!err) {
      console.log("Message sent to user!");
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

// ৪. Gemini AI API কল করার ফাংশন (Fix for 401/402 Error)
async function getGeminiResponse(userMessage) {
  try {
    // মডেলের নাম 'gemini-1.5-flash' এর বদলে 'gemini-1.5-flash-latest' অথবা 'gemini-pro' দিন
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: userMessage }] }]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "দুঃখিত, আমি কোনো উত্তর খুঁজে পাইনি।";
    }

  } catch (error) {
    if (error.response) {
      console.error("Gemini API Error:", error.response.data);
    } else {
      console.error("System Error:", error.message);
    }
    return "দুঃখিত, সার্ভারে কিছুটা সমস্যা হচ্ছে। পরে চেষ্টা করুন।";
  }
}

// সার্ভার চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Messenger Gemini bot is live on port ${PORT}`));