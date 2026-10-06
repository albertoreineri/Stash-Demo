// Controlla lo storico prezzi ETF (etf-history.json, già scaricato da
// import-etf.mjs) per nuovi minimi a 30 giorni e manda un'email quando ne
// trova — non una previsione, solo un fatto sul prezzo ("oggi è il più
// basso del mese") che potrebbe valere la pena guardare più da vicino.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { detectNewLocalLow } from '../lib/signals.mjs';
import { sendEmail } from '../lib/email.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '..', 'docs', 'data', 'etf-history.json');
const WATCHLIST_PATH = path.join(__dirname, '..', 'config', 'etf-watchlist.json');

const WINDOW_DAYS = 30;

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildEmailHtml(signals) {
  const rows = signals
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 10px; font-weight:600;">${s.name}</td>
        <td style="padding:6px 10px;">${s.ticker}</td>
        <td style="padding:6px 10px;">${formatDate(s.date)}</td>
        <td style="padding:6px 10px;">${s.close.toFixed(2)}</td>
        <td style="padding:6px 10px; color:#c94545;">-${s.drawdownPct}%</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family: system-ui, sans-serif; font-size: 14px; color: #171815;">
      <p>Nuovo minimo a ${WINDOW_DAYS} giorni per ${signals.length} ETF in watchlist:</p>
      <table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="text-align:left; color:#62645d; font-size:12px;">
            <th style="padding:6px 10px;">ETF</th>
            <th style="padding:6px 10px;">Ticker</th>
            <th style="padding:6px 10px;">Data</th>
            <th style="padding:6px 10px;">Prezzo</th>
            <th style="padding:6px 10px;">Dal massimo del periodo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#898781; font-size:12px; margin-top:16px;">
        Solo un fatto sul prezzo (nuovo minimo della finestra), non un consiglio d'acquisto —
        vale la pena guardare il trend più lungo e il motivo del calo prima di decidere.
      </p>
    </div>
  `;
}

export async function checkEtfSignals() {
  const history = JSON.parse(await readFile(HISTORY_PATH, 'utf8').catch(() => '{}'));
  const watchlist = JSON.parse(await readFile(WATCHLIST_PATH, 'utf8').catch(() => '[]'));
  const nameByTicker = Object.fromEntries(watchlist.map((e) => [e.ticker, e.nickname ?? e.ticker]));

  const signals = [];

  for (const [ticker, points] of Object.entries(history)) {
    const signal = detectNewLocalLow(points, { window: WINDOW_DAYS });
    if (signal) signals.push({ ticker, name: nameByTicker[ticker] ?? ticker, ...signal });
  }

  if (signals.length === 0) {
    console.log('Nessun nuovo minimo a 30 giorni da segnalare.');
    return { sent: false, signals };
  }

  await sendEmail(
    `Stash: ${signals.length} ETF a nuovo minimo del mese`,
    buildEmailHtml(signals)
  );

  return { sent: true, signals };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkEtfSignals();
  console.log(
    result.sent
      ? `Email inviata per ${result.signals.length} segnali: ${result.signals.map((s) => s.ticker).join(', ')}`
      : 'Nessuna email inviata.'
  );
}
