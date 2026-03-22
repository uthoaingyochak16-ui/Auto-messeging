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
    // আপনার লিস্টে এই মডেলটি 'Stable' হিসেবে আছে, এটি ব্যবহার করুন
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: userMessage }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        }
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data && response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না।";
    }

  } catch (error) {
    // এখানে এরর চেক করার জন্য বিস্তারিত লগ দেওয়া হলো
    if (error.response) {
      console.error("Status Code:", error.response.status);
      console.error("Error Message:", JSON.stringify(error.response.data, null, 2));
      
      // যদি ২.০ কাজ না করে, তবে 'gemini-flash-latest' ট্রাই করতে পারেন
      if (error.response.status === 404) {
        return "মডেলটি আপনার অ্যাকাউন্টে সচল নয়। দয়া করে gemini-flash-latest ব্যবহার করুন।";
      }
    }
    return "সার্ভারে কিছুটা সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Messenger Gemini bot is live on port ${PORT}`));