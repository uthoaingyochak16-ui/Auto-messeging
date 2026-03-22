require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const Groq = require("groq-sdk");

const app = express();
app.use(bodyParser.json());

// Groq Initialize
const groq = new Groq({ apiKey: "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" });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ১. Webhook Verification
app.get("/webhook", (req, res) => {
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ২. ইনকামিং মেসেজ হ্যান্ডেল করা
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    // ফেসবুককে দ্রুত রেসপন্স পাঠানো
    res.status(200).send("EVENT_RECEIVED");

    body.entry.forEach(async function(entry) {
      if (entry.messaging && entry.messaging[0]) {
        let event = entry.messaging[0];
        let senderId = event.sender.id;

        if (event.message && event.message.text) {
          let userMessage = event.message.text;
          console.log(`User says: ${userMessage}`);

          // Groq AI থেকে উত্তর আনা
          const aiReply = await getGroqResponse(userMessage);
          sendMessage(senderId, aiReply);
        }
      }
    });
  }
});

// ৩. Groq AI API কল করার ফাংশন (Super Fast)
async function getGroqResponse(userMessage) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      "messages": [
        {
          "role": "system",
          "content": "You are a helpful AI assistant for a Facebook page. Keep your answers concise and friendly in Bengali or English as per user demand."
        },
        {
          "role": "user",
          "content": userMessage
        }
      ],
      "model": "llama-3.3-70b-versatile", // ল্যামা ৩.৩ বর্তমানে গ্রোকে খুব ভালো কাজ করে
      "temperature": 0.7,
      "max_tokens": 1024,
      "top_p": 1,
      "stream": false
    });

    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error("Groq API Error:", error.message);
    return "দুঃখিত, এআই সার্ভারে কিছুটা সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }
}

// ৪. রিপ্লাই পাঠানোর ফাংশন (Axios ব্যবহার করে)
async function sendMessage(senderId, responseText) {
  try {
    await axios.post(`https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: senderId },
      message: { text: responseText }
    });
    console.log("Message sent via Groq!");
  } catch (err) {
    console.error("Facebook Send Error:", err.response ? err.response.data : err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Groq Messenger Bot is running on port ${PORT}`));