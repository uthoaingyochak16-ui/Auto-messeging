require("dotenv").config();
const express = require("express");
const axios = require("axios");
const Groq = require("groq-sdk");

const app = express();
app.use(express.json());

// Groq ক্লায়েন্ট ইনিশিয়ালাইজেশন (সিকিউর পদ্ধতি)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
        // ফেসবুককে দ্রুত ২০০ রেসপন্স পাঠানো যাতে ডুপ্লিকেট মেসেজ না আসে
        res.status(200).send("EVENT_RECEIVED");

        body.entry.forEach(async (entry) => {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                const userMessage = webhook_event.message.text;
                
                // Groq AI থেকে রেসপন্স জেনারেট করা
                const aiResponse = await getGroqAIResponse(userMessage);
                
                // ফেসবুকে রিপ্লাই পাঠানো
                await sendFBMessage(sender_psid, aiResponse);
            }
        });
    } else {
        res.sendStatus(404);
    }
});

// ৩. Groq AI কল করার ফাংশন
async function getGroqAIResponse(message) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "You are a helpful assistant for a CUET student's project. Answer clearly in Bengali or English." 
                },
                { role: "user", content: message }
            ],
            model: "llama-3.3-70b-versatile", // আপনার ফ্রি টায়ারের জন্য সেরা মডেল
            temperature: 0.7,
            max_tokens: 1024,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        if (error.status === 429) {
            return "আমি এই মুহূর্তে অনেক বেশি মেসেজ পাচ্ছি। ১ মিনিট পর চেষ্টা করুন।";
        }
        console.error("Groq API Error:", error.message);
        return "দুঃখিত, বর্তমানে এআই সার্ভারে কিছুটা সমস্যা হচ্ছে।";
    }
}

// ৪. ফেসবুক মেসেজ পাঠানোর ফাংশন
async function sendFBMessage(psid, responseText) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            message: { text: responseText }
        });
    } catch (error) {
        console.error("FB Send Error:", error.response ? error.response.data : error.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));