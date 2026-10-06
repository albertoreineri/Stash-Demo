// Aggiorna config/benchmarks.json con due riferimenti pubblici:
// - inflazione: Eurostat, HICP dell'area euro (variazione annua, ultimo mese disponibile)
// - conto deposito: BCE, tasso sui depositi (deposit facility rate). È un
//   riferimento di mercato, non il tasso di un conto specifico: un conto
//   vincolato di solito paga di più, quindi il confronto è prudente.
// Il sito permette di cambiare entrambi i valori; le modifiche restano nel
// browser di chi le fa, non in questo file.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'benchmarks.json');

async function latestEurostatInflation() {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA&coicop=CP00&unit=RCH_A&lastTimePeriod=1&format=JSON';
  const body = await (await fetch(url)).json();
  const periods = body.dimension.time.category.index;
  const [period] = Object.entries(periods).find(([, pos]) => pos === 0) ?? [];
  const value = body.value['0'];
  if (!period || typeof value !== 'number') throw new Error('risposta Eurostat non leggibile');
  return { value, period };
}

async function latestEcbDepositRate() {
  const url = 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=csvdata';
  const lines = (await (await fetch(url)).text()).trim().split('\n');
  const header = lines[0].split(',');
  const row = lines[lines.length - 1].split(',');
  const date = row[header.indexOf('TIME_PERIOD')];
  const value = Number(row[header.indexOf('OBS_VALUE')]);
  if (!date || Number.isNaN(value)) throw new Error('risposta BCE non leggibile');
  return { value, date };
}

export async function updateBenchmarks() {
  const [inflation, deposit] = await Promise.all([latestEurostatInflation(), latestEcbDepositRate()]);
  const previous = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const next = {
    inflation_pct: inflation.value,
    inflation_source: 'Eurostat, HICP area euro, variazione annua',
    inflation_period: inflation.period,
    deposit_account_gross_pct: deposit.value,
    deposit_source: 'BCE, tasso sui depositi (riferimento di mercato)',
    deposit_date: deposit.date,
    deposit_tax_rate: previous.deposit_tax_rate ?? 0.26,
    updated_at: new Date().toISOString().slice(0, 10),
    note: 'Valori di riferimento pubblici, aggiornati dallo script scripts/update-benchmarks.mjs. Sono una base di confronto, non una previsione: puoi cambiarli nel sito, il cambio resta nel tuo browser.',
  };
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = await updateBenchmarks();
  console.log(`Inflazione ${next.inflation_pct}% (${next.inflation_period}); tasso BCE sui depositi ${next.deposit_account_gross_pct}% (${next.deposit_date})`);
}
