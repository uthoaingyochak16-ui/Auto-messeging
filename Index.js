require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const { 
    GROQ_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, 
    PAGE_ACCESS_TOKEN, VERIFY_TOKEN, APPS_SCRIPT_URL 
} = process.env;

// ফাইল পাথ কনফিগারেশন
const CONTACT_JSON_PATH = path.join(__dirname, "ContactData.json");
const GRATING_JSON_PATH = path.join(__dirname, "Grating.json");

// JSON রিড করার ফাংশন
function readLocalJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) { return null; }
    return null;
}

// --- ULTRA MULTI-MODEL AI LOGIC ---
async function getAIResponse(userMsg, context) {
    const systemPrompt = `You are a Quantum Method Assistant. Use the provided context (FAQ/Contact Data) to answer briefly and professionally in Bengali or English. Context:\n${context}`;

    // ১. ২০২৬ সালের লেটেস্ট জেমিনি মডেল লিস্ট
    const geminiModels = [
        "gemini-3.1-flash-lite-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-flash",
        "gemini-3.1-pro-preview",
        "gemini-2.5-pro"
    ];

    // ২. গ্রক মডেল লিস্ট
    const groqModels = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"
    ];

    // --- প্রথম ধাপ: Gemini ট্রাই করা ---
    for (const model of geminiModels) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${userMsg}` }] }],
                    generationConfig: { maxOutputTokens: 600, temperature: 0.6 }
                })
            });
            const data = await res.json();
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`Response via Gemini: ${model}`);
                return data.candidates[0].content.parts[0].text;
            }
        } catch (e) { console.error(`${model} failed...`); }
    }

    // --- দ্বিতীয় ধাপ: Groq ট্রাই করা ---
    for (const model of groqModels) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }]
                })
            });
            const data = await res.json();
            if (data.choices?.[0]?.message?.content) {
                console.log(`Response via Groq: ${model}`);
                return data.choices[0].message.content;
            }
        } catch (e) { console.error(`Groq ${model} failed...`); }
    }

    // --- তৃতীয় ধাপ: DeepSeek ট্রাই করা ---
    try {
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }]
            })
        });
        const data = await res.json();
        if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    } catch (e) { console.error("DeepSeek failed."); }

    return "দুঃখিত, আমাদের এআই সার্ভার বর্তমানে ব্যস্ত। কিছুক্ষণ পর আবার চেষ্টা করুন।";
}

// --- মেসেজ প্রসেসিং ---
app.post("/webhook", async (req, res) => {
    res.status(200).send("EVENT_RECEIVED");
    const event = req.body.entry?.[0]?.messaging?.[0];
    const senderId = event?.sender?.id;
    const userMsg = event?.message?.text;

    if (userMsg && senderId) {
        sendAction(senderId, "typing_on");

        let aiReply;
        const greetings = readLocalJSON(GRATING_JSON_PATH);
        
        // গ্রিটিং চেক
        const matched = greetings?.find(g => 
            userMsg.toLowerCase().includes(g.englishGreeting?.toLowerCase()) || 
            userMsg.includes(g.banglaGreeting)
        );

        if (matched) {
            const isBangla = /[অ-হ]/.test(userMsg);
            aiReply = isBangla ? matched.banglaReply : matched.englishReply;
        } 
        // ডাটা সেভ চেক
        else if (userMsg.toLowerCase().startsWith("save:")) {
            const p = userMsg.replace("save:", "").split(",");
            await callAppsScript({ action: "saveUser", name: p[0], phone: p[1], email: p[2], message: p[3] });
            aiReply = "আপনার তথ্যটি সফলভাবে সংরক্ষিত হয়েছে।";
        } 
        // AI সার্চ (FAQ + Contact JSON)
        else {
            const faq = await callAppsScript({ action: "readFAQ" });
            const contactData = readLocalJSON(CONTACT_JSON_PATH);
            const context = `FAQ: ${JSON.stringify(faq.data)}\nContact Details: ${JSON.stringify(contactData)}`;
            aiReply = await getAIResponse(userMsg, context);
        }

        await sendFBMessage(senderId, aiReply);
        sendAction(senderId, "typing_off");
    }
});

// --- হেল্পার ফাংশনস ---
async function sendFBMessage(senderId, text) {
    await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
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

async function callAppsScript(payload) {
    try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        return await res.json();
    } catch (e) { return { data: [] }; }
}

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Quantum Bot is live on port ${PORT}`));