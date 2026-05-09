const { google } = require('googleapis');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync('service-account.json', 'utf8')),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function test() {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: '1YReTY_jfgIixgCF7vc3OrKrBwySlvjyIMsUAgq-o5yo',
    range: 'Sheet1!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [['тест']] },
  });
  console.log('✅ Працює!');
}

test().catch(console.error);
