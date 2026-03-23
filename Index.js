require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const { GROQ_API_KEY, PAGE_ACCESS_TOKEN, VERIFY_TOKEN, APPS_SCRIPT_URL } = process.env;

// ফাইল পাথ
const CONTACT_JSON_PATH = path.join(__dirname, "ContactData.json");
const GRATING_JSON_PATH = path.join(__dirname, "Grating.json");

// JSON রিড করার হেল্পার
function readLocalJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
        return null;
    } catch (e) { return null; }
}

app.post("/webhook", async (req, res) => {
    res.status(200).send("EVENT_RECEIVED");
    const entries = req.body.entry;

    for (const entry of entries) {
        const event = entry.messaging[0];
        const senderId = event.sender.id;
        const userMsg = event.message?.text;

        if (userMsg) {
            sendAction(senderId, "typing_on");
            let aiReply;

            // ১. গ্রিটিং ফাইল থেকে কাস্টম রিপ্লাই চেক করা
            const greetings = readLocalJSON(GRATING_JSON_PATH);
            const matchedGreeting = greetings?.find(g => 
                userMsg.toLowerCase().includes(g.englishGreeting?.toLowerCase()) || 
                userMsg.includes(g.banglaGreeting)
            );

            if (matchedGreeting) {
                // বাংলা গ্রিটিং হলে বাংলা রিপ্লাই, নাহলে ইংরেজি
                aiReply = userMsg.match(/[bn]/) ? matchedGreeting.banglaReply : matchedGreeting.englishReply;
            } 
            // ২. ডাটা সেভ লজিক
            else if (userMsg.toLowerCase().startsWith("save:")) {
                const parts = userMsg.replace("save:", "").split(",");
                await callAppsScript({
                    action: "saveUser",
                    name: parts[0]?.trim(),
                    phone: parts[1]?.trim(),
                    email: parts[2]?.trim(),
                    message: parts[3]?.trim()
                });
                aiReply = "আপনার তথ্য সফলভাবে সেভ করা হয়েছে।";
            } 
            // ৩. AI রিপ্লাই (FAQ + Contact Data)
            else {
                const faq = await callAppsScript({ action: "readFAQ" });
                const contactData = readLocalJSON(CONTACT_JSON_PATH);
                
                const context = `
                    Instructions: Use the FAQ and Contact Data to answer.
                    FAQ: ${JSON.stringify(faq.data)}
                    Contact Info: ${JSON.stringify(contactData)}
                `;

                aiReply = await getGroqResponse(userMsg, context);
            }

            await sendFBMessage(senderId, aiReply);
            sendAction(senderId, "typing_off");
        }
    }
});

// Groq AI Call
async function getGroqResponse(userMsg, context) {
    try {
        // টাইম-আউট কন্ট্রোল করার জন্য (৫ সেকেন্ডের বেশি হলে এরর দেবে না)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); 

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${GROQ_API_KEY}`, 
                "Content-Type": "application/json" 
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { 
                        role: "system", 
                        content: "You are a Quantum Method Assistant. Use the following context only if relevant. Keep answers short and polite.\n\nContext: " + context 
                    },
                    { role: "user", content: userMsg }
                ],
                max_tokens: 500, // রেসপন্স ফাস্ট করার জন্য টোকেন কমানো হলো
                temperature: 0.5
            })
        });

        clearTimeout(timeout);
        const json = await res.json();
        
        if (json.choices && json.choices[0]) {
            return json.choices[0].message.content;
        } else {
            throw new Error("Invalid API Response");
        }

    } catch (e) {
        console.error("Groq Error:", e.name === 'AbortError' ? "Timeout" : e.message);
        // ইউজারকে একটু ভালো মেসেজ দেওয়া
        return "দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না। অনুগ্রহ করে কিছুক্ষণ পর আবার প্রশ্ন করুন অথবা আমাদের হটলাইনে যোগাযোগ করুন।";
    }
}

// Apps Script Call
async function callAppsScript(payload) {
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        return await res.json();
    } catch (e) { return { data: [] }; }
}

// FB Message Functions
async function sendFBMessage(senderId, text) {
    fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text } })
    });
}

async function sendAction(senderId, action) {
    fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: senderId }, sender_action: action })
    }).catch(() => {});
}

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);