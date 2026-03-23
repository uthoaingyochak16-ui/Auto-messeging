require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

const { GROQ_API_KEY, PAGE_ACCESS_TOKEN, VERIFY_TOKEN, APPS_SCRIPT_URL } = process.env;

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
            if (userMsg.toLowerCase().includes("save:")) {
                const parts = userMsg.replace("save:", "").split(",");
                await callAppsScript({
                    action: "saveUser",
                    name: parts[0]?.trim(),
                    phone: parts[1]?.trim(),
                    email: parts[2]?.trim(),
                    message: parts[3]?.trim()
                });
                aiReply = "ধন্যবাদ! আপনার তথ্যটি UserData শিটে সেভ করা হয়েছে।";
            } else {
                // FAQ থেকে ডাটা নিয়ে AI রিপ্লাই
                const faq = await callAppsScript({ action: "readFAQ" });
                
                // AI-এর জন্য কনটেক্সট তৈরি (Question, Answer, Links)
                const faqContext = faq.data.map(item => 
                    `Q: ${item.Question}\nA: ${item.Answer}\nLink: ${item["Related Links"] || 'N/A'}`
                ).join("\n\n");

                aiReply = await getGroqResponse(userMsg, faqContext);
            }

            await sendFBMessage(senderId, aiReply);
            sendAction(senderId, "typing_off");
        }
    }
});

// Groq AI Call
async function getGroqResponse(userMsg, context) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
                { 
                    role: "system", 
                    content: `You are a helpful assistant for CUET students. Use the FAQ data provided. If a relevant link exists for the answer, include it at the end. Answer in Bengali or English naturally.\n\nContext:\n${context}` 
                },
                { role: "user", content: userMsg }
            ]
        })
    });
    const json = await res.json();
    return json.choices[0].message.content;
}

// Helper: Apps Script Call
async function callAppsScript(payload) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    });
    return res.json();
}

// Facebook Send Function
async function sendFBMessage(senderId, text) {
    await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text } })
    });
}

// Typing action
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