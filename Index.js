require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Webhook verification
app.get("/webhook", (req, res) => {
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async function(entry) {
      let event = entry.messaging[0];
      let senderId = event.sender.id;

      if (event.message && event.message.text) {
        let userMessage = event.message.text;

        // Step 1: FAQ shortcut
        if (userMessage.toLowerCase().includes("price")) {
          sendMessage(senderId, "আমাদের প্রোডাক্টের দাম 500 টাকা।");
        } else {
          // Step 2: AI response
          const aiReply = await getAIResponse(userMessage);
          sendMessage(senderId, aiReply);
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// Function to send message back
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
    if (!err) {
      console.log("Message sent!");
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

// Function to get AI response
async function getAIResponse(userMessage) {
  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userMessage }]
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("AI error:", error);
    return "দুঃখিত, আমি এখন উত্তর দিতে পারছি না।";
  }
}

app.listen(3000, () => console.log("Messenger AI bot server running on port 3000"));
