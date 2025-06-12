const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const gematriaJSON = require('./gematria_words.json');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN, {polling:true});

let quantumStack = [];
const STACKSIZE = 1024;

// Helper: Pythagorean reduction to 1..9 (sum digits until 1–9)
function pythag(num) {
  let n = num % 65535;
  while (n > 9) n = String(n).split('').reduce((sum,d)=>sum+parseInt(d),0);
  return n || 1; // Avoid 0
}

// Helper: Refill quantum numbers
async function refillQuantumStack() {
  const res = await fetch(`https://qrng.anu.edu.au/API/jsonI.php?length=${STACKSIZE}&type=uint16`);
  const data = await res.json();
  if(data.success) quantumStack = quantumStack.concat(data.data);
}

// Helper: Translate via Google
async function googleTranslate(text) {
  let resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`,
    { method: 'POST', body: JSON.stringify({ q: text, source: 'iw', target: 'en', format: 'text' }),
      headers: {'Content-Type': 'application/json'}}
  );
  let data = await resp.json();
  return data.data.translations[0].translatedText;
}

// Helper: Get word with quantum numbers and gematria JSON
function getWordsFromStack() {
  if (quantumStack.length < 24) refillQuantumStack();
  // 1. N: pop, reduce via pythagorean
  const n_raw = quantumStack.shift();
  const N = pythag(n_raw);
  let words = [];
  const keys = Object.keys(gematriaJSON);
  for (let i = 0; i < N; i++) {
    const idxA = quantumStack.shift();
    const idxB = quantumStack.shift();
    const key = keys[Math.floor(idxA / 65535 * keys.length)];
    const candidates = gematriaJSON[key] || [];
    if (!candidates.length) continue;
    const word = candidates[Math.floor(idxB / 65535 * candidates.length)];
    words.push(word);
  }
  return words;
}

bot.on('message', async msg => {
  if (msg.text)) {
    if (quantumStack.length < 24) await refillQuantumStack();
    const hebWords = getWordsFromStack();
    if (!hebWords.length) return bot.sendMessage(msg.chat.id, "No words generated.");
    const hebString = hebWords.join(' ');
    try {
      const translation = await googleTranslate(hebString);
      bot.sendMessage(msg.chat.id, translation);
    } catch (e) {
      bot.sendMessage(msg.chat.id, "Translation failed.");
    }
  }
});

// Refill stack at startup
refillQuantumStack();
