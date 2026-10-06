// Orchestratore chiamato dal workflow schedulato (.github/workflows/update.yml):
// importa, calcola lo screening, notifica i nuovi ingressi rispetto al run
// precedente (letto da data/interesting.json prima di sovrascriverlo).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { importBonds } from './import-bonds.mjs';
import { importCashflows } from './import-cashflows.mjs';
import { screen } from './screen.mjs';
import { notifyNewEntries } from './notify.mjs';
import { importEtfs } from './import-etf.mjs';
import { screenEtfs } from './screen-etf.mjs';
import { checkEtfSignals } from './notify-etf-signals.mjs';
import { importFunds } from './import-funds.mjs';
import { sendTelegramMessage } from '../lib/telegram.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERESTING_PATH = path.join(__dirname, '..', 'docs', 'data', 'interesting.json');

async function readPreviousInteresting() {
  try {
    return JSON.parse(await readFile(INTERESTING_PATH, 'utf8'));
  } catch {
    return { bonds: [] };
  }
}

async function main() {
  const previous = await readPreviousInteresting();

  const importResult = await importBonds();
  console.log(
    `Importati ${importResult.count} titoli (${importResult.skipped} righe scartate) da ${importResult.source_url}`
  );

  const cashflowResult = await importCashflows();
  console.log(
    `Cashflow importati per ${cashflowResult.isins} titoli (${cashflowResult.events} eventi) da ${cashflowResult.url}`
  );

  const parsedOptions = process.env.SCREEN_OPTIONS ? JSON.parse(process.env.SCREEN_OPTIONS) : {};
  const current = await screen(parsedOptions);
  console.log(`Screening: ${current.total_candidates} titoli salvati.`);

  const { sent, newEntries } = await notifyNewEntries(previous, current);
  console.log(sent ? `Notifica inviata per ${newEntries.length} nuovi titoli.` : 'Nessuna notifica da inviare.');

  const etfSnapshot = await importEtfs();
  console.log(`ETF importati: ${etfSnapshot.count}/${etfSnapshot.count + etfSnapshot.errors.length}.`);

  // Fondi e certificati fuori watchlist: un errore su uno non blocca il resto.
  const fundSnapshot = await importFunds();
  console.log(`Fondi importati: ${fundSnapshot.count}/${fundSnapshot.count + fundSnapshot.errors.length}.`);

  const etfParsedOptions = process.env.ETF_SCREEN_OPTIONS ? JSON.parse(process.env.ETF_SCREEN_OPTIONS) : {};
  const etfScreening = await screenEtfs(etfParsedOptions);
  console.log(`Screening ETF: ${etfScreening.etfs.length} fondi valutati.`);

  if (etfSnapshot.errors.length > 0) {
    const message =
      `<b>ETF non aggiornati</b>\n\n` +
      etfSnapshot.errors.map((e) => `• ${e.ticker}: ${e.message}`).join('\n');
    await sendTelegramMessage(message);
  }

  const signalResult = await checkEtfSignals();
  console.log(
    signalResult.sent
      ? `Email inviata per ${signalResult.signals.length} nuovi minimi: ${signalResult.signals.map((s) => s.ticker).join(', ')}`
      : 'Nessun nuovo minimo da segnalare.'
  );
}

await main();
