// === SETUP AND IMPORTS ===
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

// --- Web server (for Render health checks) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// --- Quantum stack support ---
const STACKSIZE = 1024;
let quantumStack = [];
async function refillQuantumStack() {
  try {
    let res = await fetch(`https://qrng.anu.edu.au/API/jsonI.php?length=${STACKSIZE}&type=uint16`);
    let data = await res.json();
    if (data.success) quantumStack = quantumStack.concat(data.data);
  } catch {
    // Ignore fetch errors, will try again next request if stack is low
  }
}

// --- Gematria data ---
const gematriaJSON = require('./gematria_words.json');
function digitalRoot(num) {
  let n = Math.abs(num) % 65535;
  while (n > 9) n = String(n).split('').reduce((sum,d) => sum+parseInt(d),0);
  return n || 1;
}

// --- Google Translate ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
async function googleTranslate(text) {
  let resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`,
    { method: 'POST', body: JSON.stringify({ q: text, source: 'iw', target: 'en', format: 'text' }),
      headers: {'Content-Type': 'application/json'}}
  );
  let data = await resp.json();
  return data.data.translations[0].translatedText || '[no translation]';
}

// --- Telegram --
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// --- Main message handler ---
bot.on('message', async msg => {
  if (!msg.text) return;
  if (quantumStack.length < 24) await refillQuantumStack();

  // Quantum-driven 33.33% chance to reply
  const decisionNum = quantumStack.shift();
  //if (decisionNum > (65536 / 3)) return;

  // Get # of words via digitalRoot; build word list
  const n_raw = quantumStack.shift() || 1;
  const N = digitalRoot(n_raw);
  let words = [];
  const keys = Object.keys(gematriaJSON);
  for (let i = 0; i < N; i++) {
    if (quantumStack.length < 2) await refillQuantumStack();
    const idxA = quantumStack.shift() || 0;
    const idxB = quantumStack.shift() || 0;
    const key = keys[Math.floor(idxA / 65535 * keys.length)];
    const candidates = gematriaJSON[key] || [];
    if (!candidates.length) continue;
    const word = candidates[Math.floor(idxB / 65535 * candidates.length)];
    words.push(word);
  }
  if (!words.length) return; // don't translate nothing

  const hebString = words.join(' ');
  try {
    const translation = await googleTranslate(hebString);
    bot.sendMessage(msg.chat.id, translation);
  } catch (e) {
    bot.sendMessage(msg.chat.id, "Translation failed.");
  }
});

// --- Initialize QRN stack on startup ---
refillQuantumStack();