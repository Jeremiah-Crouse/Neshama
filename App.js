const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

// ---- Express Web Server ----
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ---- Quantum Stack & Gematria ----
const gematriaJSON = require('./gematria_words.json');
let quantumStack = [];
const STACKSIZE = 1024;

async function refillQuantumStack() {
  try {
    let res = await fetch(`https://qrng.anu.edu.au/API/jsonI.php?length=${STACKSIZE}&type=uint16`);
    let data = await res.json();
    if (data.success) quantumStack = quantumStack.concat(data.data);
  } catch {
    // If refilling fails, stack will be retried next time
  }
}

// Pythagorean digital root (sum digits to get 1–9)
function digitalRoot(num) {
  let n = Math.abs(num) % 65535;
  while (n > 9) n = String(n).split('').reduce((sum, d) => sum+parseInt(d),0);
  return n || 1;
}

function getWordsFromStack() {
  if (quantumStack.length < 24) refillQuantumStack();
  const n_raw = quantumStack.shift() || 1;
  const N = digitalRoot(n_raw);
  let words = [];
  const keys = Object.keys(gematriaJSON);
  for (let i = 0; i < N; i++) {
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

// ---- Google Translate API ----
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // set this as a Render env var

async function googleTranslate(text) {
  let resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`,
    { method: 'POST', body: JSON.stringify({ q: text, source: 'iw', target: 'en', format: 'text' }),
      headers: {'Content-Type': 'application/json'}}
  );
  let data = await resp.json();
  return data.data.translations[0].translatedText || '[no translation]';
}

// ---- Telegram Bot ----
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // set this as a Render env var
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on('message', async msg => {
  if (!msg.text) return;
  if (quantumStack.length < 24) await refillQuantumStack();
  const hebWords = getWordsFromStack();
  if (!hebWords.length) {
    bot.sendMessage(msg.chat.id, "No words generated (try again).");
    return;
  }
  const hebString = hebWords.join(' ');
  try {
    const translation = await googleTranslate(hebString);
    // RESPONDS ONLY WITH THE ENGLISH TRANSLATION (as requested)
    bot.sendMessage(msg.chat.id, translation);
  } catch (e) {
    bot.sendMessage(msg.chat.id, "Translation failed.");
  }
});

// Initial quantum refill
refillQuantumStack();