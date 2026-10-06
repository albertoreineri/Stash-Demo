// Notifica via bot Telegram. Richiede due secret (repo GitHub o env locale):
// TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (vedi README per come crearli).
// Se mancano, non fallisce: logga e basta, così gli script restano
// eseguibili in locale senza configurare nulla.

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID non configurati, notifica saltata.');
    console.log(`[telegram] messaggio che sarebbe stato inviato:\n${text}`);
    return { skipped: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`Invio Telegram fallito: ${JSON.stringify(body)}`);
  }

  return body;
}
