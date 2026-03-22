require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const HF_API_KEY = process.env.HF_API_KEY;

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
          // Step 2: Hugging Face AI response
          const aiReply = await getHFResponse(userMessage);
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

// Function to get Hugging Face AI response
async function getHFResponse(userMessage) {
  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
      { inputs: userMessage },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data && response.data.length > 0) {
      return response.data[0].generated_text;
    } else {
      return "দুঃখিত, আমি এখন উত্তর দিতে পারছি না।";
    }
  } catch (error) {
    console.error("HF error:", error.message);
    return "সার্ভার ব্যস্ত আছে, একটু পরে চেষ্টা করুন।";
  }
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Messenger HF bot server running on port ${PORT}`));
