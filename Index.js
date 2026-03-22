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
    // ফেসবুককে সাথে সাথে জানিয়ে দিন যে ইভেন্ট পেয়েছেন
    res.status(200).send("EVENT_RECEIVED"); 

    body.entry.forEach(async function(entry) {
      if (entry.messaging && entry.messaging[0]) {
        let event = entry.messaging[0];
        let senderId = event.sender.id;

        if (event.message && event.message.text) {
          let userMessage = event.message.text;
          
          // এখানে AI কল করুন
          const aiReply = await getGeminiResponse(userMessage);
          sendMessage(senderId, aiReply);
        }
      }
    });
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
    // ১. স্ট্যাবল মডেল ইউআরএল (v1beta)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: userMessage }] }],
        // ২. সেফটি সেটিংস (যাতে উত্তর ব্লক না হয়)
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        // ৩. কনফিগারেশন (উত্তরের ধরন ঠিক রাখতে)
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024, // খুব বড় উত্তর দিয়ে কোটা শেষ করবে না
        }
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data && response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "দুঃখিত, আমি এই মুহূর্তে উত্তরটি তৈরি করতে পারছি না।";
    }

  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.error("Rate Limit Exceeded (429)");
      return "আমি এখন একটু ব্যস্ত (লিমিট শেষ), দয়া করে ১ মিনিট পর আবার মেসেজ দিন।";
    }
    console.error("Gemini Error:", error.response ? error.response.data : error.message);
    return "দুঃখিত, সার্ভারে কিছুটা সমস্যা হচ্ছে। পরে চেষ্টা করুন।";
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Messenger Gemini bot is live on port ${PORT}`));