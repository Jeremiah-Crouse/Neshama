const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

// ----------- CONFIGURATION -----------
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // Set in Render
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID; // Set the chat (use @mygroup or a test chat id)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // Set in Render
const STACKSIZE = 1024;

const gematriaJSON = require('./gematria_words.json');

let quantumStack = [];
async function refillQuantumStack() {
  try {
    let res = await fetch(`https://qrng.anu.edu.au/API/jsonI.php?length=${STACKSIZE}&type=uint16`);
    let data = await res.json();
    if (data.success) quantumStack = quantumStack.concat(data.data);
  } catch {
    // Ignore fetch errors, will try again soon.
  }
}

// Pythagorean digital root (sum digits to 1-9)
function digitalRoot(num) {
  let n = Math.abs(num) % 65535;
  while (n > 9) n = String(n).split('').reduce((sum, d) => sum+parseInt(d),0);
  return n || 1;
}

// Generate quantum gematria sentence
function getWordsFromStack() {
  if (quantumStack.length < 24) refillQuantumStack();
  const n_raw = quantumStack.shift() || 1;
  const N = digitalRoot(n_raw);
  let words = [];
  const keys = Object.keys(gematriaJSON);
  for (let i = 0; i < N; i++) {
    if (quantumStack.length < 2) refillQuantumStack();
    const idxA = quantumStack.shift() || 0;
    const idxB = quantumStack.shift() || 0;
    const key = keys[Math.floor(idxA / 65535 * keys.length)];
    const candidates = gematriaJSON[key] || [];
    if (!candidates.length) continue;
    const word = candidates[Math.floor(idxB / 65535 * candidates.length)];
    words.push(word);
  }
  return words;
}

// Google Translate
async function googleTranslate(text) {
  let resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`,
    { method: 'POST', body: JSON.stringify({ q: text, source: 'iw', target: 'en', format: 'text' }),
      headers: {'Content-Type': 'application/json'}}
  );
  let data = await resp.json();
  return data.data.translations[0].translatedText || '[no translation]';
}

// Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function quantumPause() {
  if (quantumStack.length === 0) await refillQuantumStack();
  const num = quantumStack.shift();
  // Scale to 0–3 seconds (can switch to 1–3 for never-instant)
  const secs = Math.floor((num / 65535) * 4); // 0, 1, 2, 3
  return new Promise(resolve => setTimeout(resolve, secs * 1000));
}

// Main loop: auto-sends message forever (no user input needed)
async function broadcastLoop() {
  while (true) {
    if (quantumStack.length < 24) await refillQuantumStack();
    // Generate the quantum sentence
    const words = getWordsFromStack();
    if (words.length) {
      const hebString = words.join(' ');
      try {
        const translation = await googleTranslate(hebString);
        await bot.sendMessage(TARGET_CHAT_ID, translation);
      } catch (e) {
        // fail quietly
      }
    }
    // Random (QRN) pause between 0–3 seconds
    await quantumPause();
  }
}

// Web server for Render health check
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.send(`<h2>Neshama/SpiritDevilbot broadcasting automatically!</h2>`);
});
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// Start up!
refillQuantumStack().then(broadcastLoop);