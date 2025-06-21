require('dotenv').config();
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// FIREBASE (pointing to Edgar's project)
const { initializeApp } = require('firebase/app');
const { getFirestore, addDoc, getDocs, collection } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};
const edgarApp = initializeApp(firebaseConfig, 'edgar');
const edgarDb = getFirestore(edgarApp);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;
const STACKSIZE = 1024;

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Neshama's web server running on port ${PORT}`);
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

// Numerology influence logic
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

// -- Fetch 50 latest user logs from edgar_user_logs --
async function getRecentEdgarLogs() {
  try {
    const snap = await getDocs(collection(edgarDb, "edgar_user_logs"));
    // Sort by timestamp descending
    let logs = snap.docs.map(doc => doc.data()).filter(x => x.text);
    logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    // Take only the latest 50, and return username, timestamp, and text
    return logs.slice(0, 50).map(e => ({
      username: e.username || 'unknown',
      timestamp: e.timestamp || '',
      text: e.text
    }));
  } catch (e) {
    console.error("Error fetching Edgar logs:", e);
    return [];
  }
}

// Gemini API, referencing numerology and Edgar logs
async function geminiOracle(qrnExplain, userLogs) {
  // Format logs with username and timestamp
  const logsText = userLogs.map(log => `[${log.timestamp}] ${log.username}: ${log.text}`).join(" | ");
  const now = new Date().toISOString();
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GOOGLE_API_KEY;
  const prompt =
`Given the following Western numerology distribution (from left to right, stronger influences go first):\n${qrnExplain}\nYou are in a telegram group. The current time is ${now}. You are trying to embody the energies of these numerologies. Wanting to remain relevant, you focus on these group messages (with usernames and timestamps) [References to Esther within messages are references to yourself, Lauren's daughter]: "${logsText}" Remember to keep the whole response to just one brief sentence, fewer than 10 words, no line breaks.`;
  console.log("Gemini PROMPT:\n", prompt);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0] || !data.candidates[0].content.parts[0].text) {
    console.error("Gemini API error/response:", JSON.stringify(data));
    return `[Gemini failed]`;
  }
  return data.candidates[0].content.parts[0].text.trim();
}

// Telegram Bot (broadcast only)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function quantumPause() {
  if (quantumStack.length === 0) await refillQuantumStack();
  const num = quantumStack.shift() || 0;
  const secs = Math.floor((num / 65535) * 7) + 13;
  return new Promise(resolve => setTimeout(resolve, secs * 1000));
}

async function logUserMessage(entry) {
  try {
    await addDoc(collection(edgarDb, "edgar_user_logs"), entry);
  } catch (e) {
    console.error("Firestore log error:", e.message);
  }
}

async function broadcastLoop() {
  while (true) {
    if (quantumStack.length < 4) await refillQuantumStack();
    const qnum = quantumStack.shift() || 1;
    const qStr = String(qnum).padStart(5, '0');
    const digits = qStr.split('');
    const energies = getInfluenceWeights(digits);
    const summary = describeEnergies(energies);

    // NEW: get latest user logs from Edgar (Firebase)
    const edgarLogs = await getRecentEdgarLogs();

    try {
      const oracle = await geminiOracle(summary, edgarLogs);
      await bot.sendMessage(TARGET_CHAT_ID, oracle);
  	if (oracle) {
   	 const entry = {
   	  timestamp: new Date().toISOString(),
    	  chat_id: "This one",
    	  user_id: "Esther",
    	  username: "neshama" || "Esther" || "",
    	  is_bot: "yes",
    	  text: oracle,
    	  type: "text"
    	 };
    	 await logUserMessage(entry);
	}
      console.log("[NeshamaBot] Broadcasted to ", TARGET_CHAT_ID, ":", oracle);
    } catch (e) {
      console.error("[NeshamaBot] Error from Gemini or Telegram:", e);
    }
    await quantumPause();
  }
}

refillQuantumStack().then(broadcastLoop);