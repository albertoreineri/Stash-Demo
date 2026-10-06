// Porting di EtfInteressanti (Laravel): proietta il capitale investito oggi
// ipotizzando che il rendimento storico scelto (1/3/5 anni) continui per gli
// anni indicati. Nessun flusso contrattuale come le obbligazioni: è una
// proiezione statistica sul passato, non una promessa.
//
// Guadagno scomposto in "da capitale" (variazione prezzo, dal rendimento
// storico) e "da dividendi" (flusso non reinvestito, somma semplice sugli
// anni). Tassazione: aliquota fissa 26% sul guadagno lordo (semplificazione:
// nessuna quota al 12,5% anche se l'ETF investe in titoli di Stato italiani).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const INPUT_PATH = path.join(DATA_DIR, 'etf.json');
const HISTORY_PATH = path.join(DATA_DIR, 'etf-history.json');
const BENCHMARKS_PATH = path.join(__dirname, '..', 'config', 'benchmarks.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'etf-interesting.json');

const TAX_RATE = 0.26;
const SPARKLINE_DAYS = 90;

/** Ultimi `days` punti di prezzo, indicizzati a 100 sul primo della finestra. */
function indexedSparkline(history, ticker, days) {
  const points = (history[ticker] ?? []).slice(-days);
  if (points.length === 0) return [];

  const base = points[0].c;
  if (!base) return [];

  return points.map((p) => ({ d: p.d, v: Math.round((p.c / base) * 100 * 100) / 100 }));
}

const DEFAULT_OPTIONS = {
  years: 5,
  returnBasis: '3y', // '1y' | '3y' | '5y'
  amount: 10000,
};

function annualize(invested, final, years) {
  if (invested <= 0 || years <= 0 || final <= 0) return null;
  return Math.round(((final / invested) ** (1 / years) - 1) * 100 * 100) / 100;
}

function project(etf, returnField, amount, years, sparkline) {
  const growthRate = etf[returnField];

  const capitalFinal = amount * (1 + growthRate / 100) ** years;
  const capitalGain = capitalFinal - amount;

  // Dividendo distribuito: esce dal fondo, non si capitalizza sul prezzo
  // (a differenza di un ETF ad accumulazione). Somma semplice sugli anni.
  const dividendYield = etf.dividend_yield;
  const dividendGain = dividendYield ? amount * (dividendYield / 100) * years : 0;

  const grossGain = capitalGain + dividendGain;
  const grossFinal = amount + grossGain;

  const taxAmount = Math.round(Math.max(0, grossGain) * TAX_RATE * 100) / 100;
  const netGain = grossGain - taxAmount;
  const netFinal = amount + netGain;
  const netAnnualizedPct = annualize(amount, netFinal, years);

  return {
    ticker: etf.ticker,
    isin: etf.isin,
    name: etf.name ?? etf.nickname,
    currency: etf.currency,
    ter: etf.ter,
    growth_rate: Math.round(growthRate * 100) / 100,
    volatility: etf.volatility_1y,
    dividend_yield: dividendYield,
    invested: Math.round(amount * 100) / 100,
    capital_gain: Math.round(capitalGain * 100) / 100,
    dividend_gain: Math.round(dividendGain * 100) / 100,
    gross_gain: Math.round(grossGain * 100) / 100,
    gross_return_pct: amount > 0 ? Math.round((grossGain / amount) * 100 * 100) / 100 : null,
    gross_annualized_pct: annualize(amount, grossFinal, years),
    tax_amount: taxAmount,
    net_gain: Math.round(netGain * 100) / 100,
    net_annualized_pct: netAnnualizedPct,
    sparkline,
  };
}

export async function screenEtfs(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const snapshot = JSON.parse(await readFile(INPUT_PATH, 'utf8'));
  const history = JSON.parse(await readFile(HISTORY_PATH, 'utf8').catch(() => '{}'));
  const benchmarks = JSON.parse(await readFile(BENCHMARKS_PATH, 'utf8'));
  const returnField = `return_${opts.returnBasis}`;

  const projected = snapshot.etfs
    .filter((e) => e[returnField] !== null && e[returnField] !== undefined)
    .map((e) =>
      project(e, returnField, opts.amount, opts.years, indexedSparkline(history, e.ticker, SPARKLINE_DAYS))
    );

  const ranked = projected.sort((a, b) => b.gross_gain - a.gross_gain);

  const result = {
    computed_at: new Date().toISOString(),
    options: opts,
    benchmarks,
    etfs: ranked,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2));

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsedOptions = process.env.ETF_SCREEN_OPTIONS ? JSON.parse(process.env.ETF_SCREEN_OPTIONS) : {};
  const result = await screenEtfs(parsedOptions);
  console.log(`Screening ETF completato: ${result.etfs.length} fondi valutati, salvati in docs/data/etf-interesting.json`);
}
