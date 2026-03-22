require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ১. Webhook Verification
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

          // Lightweight AI Logic: প্রথমে লোকাল চেক করবে
          const localReply = getLightweightResponse(userMessage);

          if (localReply) {
            sendMessage(senderId, localReply);
          } else {
            // যদি লোকাল রিপ্লাই না থাকে, তবে Gemini AI ব্যবহার করবে
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

// ৩. Lightweight local AI Logic (Built-in)
function getLightweightResponse(message) {
  const msg = message.toLowerCase();

  // Keyword Matching
  const knowledgeBase = {
    "hi": "হ্যালো! আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
    "hello": "নমস্কার! কোনো প্রশ্ন থাকলে করতে পারেন।",
    "কেমন আছো": "আমি ভালো আছি, ধন্যবাদ! আপনি কেমন আছেন?",
    "price": "আমাদের পণ্যের দাম ৫০০ টাকা।",
    "অর্ডার": "অর্ডার করতে আপনার নাম এবং মোবাইল নম্বর দিন।",
    "ধন্যবাদ": "আপনাকেও অনেক ধন্যবাদ!",
    "সময়": `এখন সময়: ${new Date().toLocaleTimeString('bn-BD')}`
  };

  for (let key in knowledgeBase) {
    if (msg.includes(key)) {
      return knowledgeBase[key];
    }
  }
  return null; // কোনো মিল না পেলে null পাঠাবে
}

// ৪. রিপ্লাই পাঠানোর ফাংশন
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
    if (err) {
      console.error("Unable to send message:" + err);
    }
  });
}

// ৫. Gemini AI API
async function getGeminiResponse(userMessage) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: userMessage }] }]
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data && response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "দুঃখিত, আমি বিষয়টি বুঝতে পারছি না।";
    }

  } catch (error) {
    console.error("Gemini Error:", error.message);
    return "সার্ভারে সমস্যা হচ্ছে, অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Messenger Gemini bot is live on port ${PORT}`));