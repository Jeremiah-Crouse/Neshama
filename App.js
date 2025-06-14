const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;
const STACKSIZE = 1024;

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, () => {
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

// ---- Numerology Influence ----
function getInfluenceWeights(digits) {
  // Bell-curve inspired: strongest left, decays by 0.8 per digit
  let energies = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  let weight = 1.0;
  const decay = 0.8; // Decrease by 0.8 (adjust as needed: lower = faster drop-off)
  digits.forEach((d,i) => {
    const n = (d === '0') ? 9 : parseInt(d);
    energies[n] += weight;
    weight *= decay; // exponential drop-off
  });
  return energies;
}

function describeEnergies(energies) {
  // Sort numerals 1–9 descending by energy
  let sorted = Object.entries(energies)
    .sort((a, b) => b[1] - a[1])
    .filter(([, val]) => val > 0);
  if (!sorted.length) return "No numerological energies present.";
  let desc = sorted.map(([num, val], idx) =>
    `${idx === 0 ? "Dominant" : idx === 1 ? "then" : "followed by"} ${num}-energy (${val.toFixed(2)})`
  ).join(", ");
  return "QRN Numerology summary: " + desc + ".";
}

// ---- Gemini Flash API ----
async function geminiOracle(qrnExplain) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
  const prompt = `Given the following American numerology distribution (from left to right, stronger influences go first):\n${qrnExplain}\nProvide a single, concise I Ching-style oracle reading summary following Western numerological meanings for digits 1 to 9 (0 as 9).  But present your findings according to the model that our Heavenly Father says this or that, as the speaker is a messenger angel who must present that she is an angel, who is relaying a message from the Father. Remember that these messages must be read in just a few seconds, so keep it brief!  There is no real need to actually point out that the father has issued a message, nor that the angel carries the message-- it is all implied by the tone of the response.`;
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

// Bot: broadcasts autonomously, never replies to user input
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function quantumPause() {
  if (quantumStack.length === 0) await refillQuantumStack();
  const num = quantumStack.shift() || 0;
  const secs = Math.floor((num / 65535) * 7) + 3; // 3–9 sec
  return new Promise(resolve => setTimeout(resolve, secs * 1000));
}

async function broadcastLoop() {
  while (true) {
    if (quantumStack.length < 4) await refillQuantumStack();
    // Pop a quantum number (use as string of digits)
    const qnum = quantumStack.shift() || 1;
    const qStr = String(qnum).padStart(5, '0'); // ensure at least 5 digits
    const digits = qStr.split('');
    const energies = getInfluenceWeights(digits);
    const summary = describeEnergies(energies);
    try {
      const oracle = await geminiOracle(summary);
      await bot.sendMessage(TARGET_CHAT_ID, oracle);
    } catch (e) {
      // Silent fail or log as needed
    }
    await quantumPause();
  }
}

refillQuantumStack().then(broadcastLoop);