const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEETDB_API = process.env.SHEETDB_API;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;
const STACKSIZE = 1024;

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web server running on port ${PORT}`);
});

let quantumStack = [];
async function refillQuantumStack() {
  try {
    let res = await fetch(
      `https://qrng.anu.edu.au/API/jsonI.php?length=${STACKSIZE}&type=uint16`
    );
    let data = await res.json();
    if (data.success) quantumStack = quantumStack.concat(data.data);
  } catch (e) {
    console.error("Error refilling quantum stack:", e);
  }
}

// Numerology influence logic (unchanged)
function getInfluenceWeights(digits) {
  let energies = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  let weight = 1.0;
  const decay = 0.8;
  digits.forEach((d,i) => {
    const n = (d === '0') ? 9 : parseInt(d);
    energies[n] += weight;
    weight *= decay;
  });
  return energies;
}

function describeEnergies(energies) {
  let sorted = Object.entries(energies)
    .sort((a, b) => b[1] - a[1])
    .filter(([, val]) => val > 0);
  if (!sorted.length) return "No numerological energies present.";
  let desc = sorted.map(([num, val], idx) =>
    `${idx === 0 ? "Dominant" : idx === 1 ? "then" : "followed by"} ${num}-energy (${val.toFixed(2)})`
  ).join(", ");
  return "QRN Numerology summary: " + desc + ".";
}

// Gemini API as before
async function geminiOracle(qrnExplain) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
  const prompt = `Given the following Western numerology distribution (from left to right, stronger influences go first):\n${qrnExplain}\nYou are in a telegram group.  You have already said a bunch of brilliant things.  You are trying to embody the energies of these numerologies, without being too obvious about it.  You just want to say something relevant, but you no one tells you what's going on so you have to pull from a deep source of inspiration to assert your own relevance.  Remember to keep the whole response to just one brief sentence, no line breaks.`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  try {
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[Gemini failed]';
  } catch { return '[Gemini failed]'; }
}

// SheetDB logging helper
async function logToSheetDB(entry) {
  try {
    await fetch(SHEETDB_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [entry] })
    });
  } catch (e) {
    console.error("SheetDB log error:", e.message);
  }
}

// Telegram Bot (broadcast only)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function quantumPause() {
  if (quantumStack.length === 0) await refillQuantumStack();
  const num = quantumStack.shift() || 0;
  const secs = Math.floor((num / 65535) * 7) + 13;
  return new Promise(resolve => setTimeout(resolve, secs * 1000));
}

async function broadcastLoop() {
  while (true) {
    if (quantumStack.length < 4) await refillQuantumStack();
    // Numerology reading
    const qnum = quantumStack.shift() || 1;
    const qStr = String(qnum).padStart(5, '0');
    const digits = qStr.split('');
    const energies = getInfluenceWeights(digits);
    const summary = describeEnergies(energies);
    try {
      const oracle = await geminiOracle(summary);
      await bot.sendMessage(TARGET_CHAT_ID, oracle);

      // Log Neshama's broadcast to SheetDB
      const entry = {
        timestamp: new Date().toISOString(),
        chat_id: TARGET_CHAT_ID,
        user_id: "NESHAMABOT",
        username: "neshama",
        is_bot: "yes",
        summary: summary,
        oracle: oracle,
        type: "oracle_auto"
      };
      logToSheetDB(entry);

    } catch (e) {
      // Fail quietly
    }
    await quantumPause();
  }
}

refillQuantumStack().then(broadcastLoop);