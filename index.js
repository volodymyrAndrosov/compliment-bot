const cron = require('node-cron');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID_HER = process.env.CHAT_ID_HER;
const CHAT_ID_ME = process.env.CHAT_ID_ME || '371332060';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : JSON.parse(fs.readFileSync('service-account.json', 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function getPreviousCompliments() {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A2:A',
  });
  return (res.data.values || []).map((row) => row[0]);
}

async function saveCompliment(text) {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [[text]] },
  });
}

async function generateCompliment(history) {
  const historyText = history.length
    ? `Вже були надіслані такі компліменти (не повторюй їх):\n${history.join('\n')}\n\n`
    : '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `${historyText}Напиши один короткий, щирий і унікальний комплімент дівчині українською мовою. Без лапок, без пояснень — тільки сам комплімент.`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.content[0].text.trim();
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendDailyCompliment() {
  console.log('Генерую комплімент...');
  const history = await getPreviousCompliments();
  const compliment = await generateCompliment(history);
  await saveCompliment(compliment);
  await sendMessage(CHAT_ID_HER, compliment);
  const now = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv' });
  await sendMessage(CHAT_ID_ME, `✅ Надіслано о ${now}\n💬 "${compliment}"`);
  console.log('Надіслано:', compliment);
}

// Пересилаємо її повідомлення тобі
async function startPolling() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await res.json();
      for (const update of data.result) {
        offset = update.update_id + 1;
        const chatId = update.message?.chat?.id?.toString();
        const text = update.message?.text;
        if (chatId === CHAT_ID_HER && text) {
          await sendMessage(CHAT_ID_ME, `📨 Вона написала:\n"${text}"`);
        }
      }
    } catch (e) {
      console.error('Polling error:', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

cron.schedule('0 6 * * 1-5', sendDailyCompliment); // 9:00 будні
cron.schedule('0 18 * * 1-5', sendDailyCompliment); // 21:00 будні
cron.schedule('0 7 * * 0,6', sendDailyCompliment); // 10:00 вихідні
cron.schedule('0 18 * * 0,6', sendDailyCompliment); // 21:00 вихідні

startPolling();
console.log('Бот запущено ✓');
