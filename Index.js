require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const { GROQ_API_KEY, PAGE_ACCESS_TOKEN, VERIFY_TOKEN, APPS_SCRIPT_URL } = process.env;

// ফাইল পাথ কনফিগারেশন
const CONTACT_JSON_PATH = path.join(__dirname, "Contact_Data.json");
const GRATING_JSON_PATH = path.join(__dirname, "Grating.json");

// JSON রিড করার হেল্পার ফাংশন
function readLocalJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, "utf8");
            return JSON.parse(data);
        }
        return null;
    } catch (e) {
        console.error(`Error reading JSON from ${filePath}:`, e);
        return null;
    }
}

// ১. ফেসবুক ওয়েব হুক ভেরিফিকেশন
app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// ২. ইনকামিং মেসেজ হ্যান্ডেলিং
app.post("/webhook", async (req, res) => {
    const { body } = req;
    if (body.object === "page") {
        res.status(200).send("EVENT_RECEIVED");

        for (const entry of body.entry) {
            const event = entry.messaging[0];
            const senderId = event.sender.id;
            const userMsg = event.message?.text;

            if (userMsg) {
                sendAction(senderId, "typing_on");

                let aiReply;
                
                // ক. গ্রিটিং চেক করা (Greeting Logic)
                const greetings = readLocalJSON(GRATING_JSON_PATH);
                const isGreeting = greetings?.keywords?.some(k => userMsg.toLowerCase().includes(k.toLowerCase()));

                if (isGreeting) {
                    aiReply = greetings.welcome_message || "Hello! How can I help you today?";
                } 
                // খ. ডাটা সেভ করার লজিক
                else if (userMsg.toLowerCase().startsWith("save:")) {
                    const parts = userMsg.replace("save:", "").split(",");
                    await callAppsScript({
                        action: "saveUser",
                        name: parts[0]?.trim(),
                        phone: parts[1]?.trim(),
                        email: parts[2]?.trim(),
                        message: parts[3]?.trim()
                    });
                    aiReply = "ধন্যবাদ! আপনার তথ্যটি সফলভাবে সেভ করা হয়েছে।";
                } 
                // গ. FAQ (Sheets) এবং Contact (JSON) প্রসেসিং
                else {
                    const faq = await callAppsScript({ action: "readFAQ" });
                    const contactData = readLocalJSON(CONTACT_JSON_PATH);
                    
                    const faqContext = faq.data.map(item => 
                        `Q: ${item.Question}\nA: ${item.Answer}\nLink: ${item["Related Links"] || 'N/A'}`
                    ).join("\n\n");

                    const fullContext = `
                        Instructions: Use the FAQ and Contact JSON below. 
                        Contact Data includes Divisional, Regional locations and emails.
                        
                        --- FAQ DATA ---
                        ${faqContext}
                        
                        --- LOCAL CONTACT JSON ---
                        ${JSON.stringify(contactData)}
                    `;

                    aiReply = await getGroqResponse(userMsg, fullContext);
                }

                await sendFBMessage(senderId, aiReply);
                sendAction(senderId, "typing_off");
            }
        }
    }
});

// ৩. Groq AI কল (Native Fetch)
async function getGroqResponse(userMsg, context) {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${GROQ_API_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are a helpful CUET Assistant. Answer briefly in Bengali or English based on the context.\n" + context },
                    { role: "user", content: userMsg }
                ],
                max_tokens: 800
            })
        });
        const json = await res.json();
        return json.choices[0]?.message?.content || "I couldn't process that.";
    } catch (e) {
        return "সার্ভারে সমস্যা হচ্ছে, পরে চেষ্টা করুন।";
    }
}

// ৪. Apps Script কল (Google Sheets)
async function callAppsScript(payload) {
    try {
        const res = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        return { data: [] };
    }
}

// ৫. ফেসবুক মেসেজ পাঠানো
async function sendFBMessage(senderId, text) {
    try {
        await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: senderId }, message: { text } })
        });
    } catch (e) {
        console.error("FB Send Error:", e);
    }
}

// ৬. টাইপিং ইন্ডিকেটর
async function sendAction(senderId, action) {
    fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: senderId }, sender_action: action })
    }).catch(() => {});
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bot is live with JSON support on ${PORT}`));