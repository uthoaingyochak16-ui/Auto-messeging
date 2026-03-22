require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Environment Variables
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ১. ফেসবুক ওয়েবহুক ভেরিফিকেশন
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
        res.status(200).send("EVENT_RECEIVED");

        body.entry.forEach(async (entry) => {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let senderId = event.sender.id;

                if (event.message && event.message.text) {
                    const userMsg = event.message.text;
                    const aiReply = await getGroqResponse(userMsg);
                    await sendFBMessage(senderId, aiReply);
                }
            }
        });
    }
});

// ৩. Groq API Call (Axios দিয়ে সরাসরি)
async function getGroqResponse(message) {
    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: message }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Groq Error:", error.response ? error.response.data : error.message);
        return "সার্ভারে কিছুটা সমস্যা হচ্ছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।";
    }
}

// ৪. ফেসবুক মেসেজ পাঠানো
async function sendFBMessage(senderId, text) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: senderId },
            message: { text: text }
        });
    } catch (error) {
        console.error("FB Error:", error.response ? error.response.data : error.message);
    }
}

// Render-এর জন্য PORT 10000 বাইন্ডিং জরুরি
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server is live on port ${PORT}`));