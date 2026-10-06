// Porting di ConfrontoTitoli + TitoliInteressanti (Laravel): a partire dallo
// snapshot bonds.json calcola risk score, rendimento-per-rischio e — dove
// disponibile il piano cashflow (bond-cashflows.json) — la proiezione
// precisa a scadenza (costo di ingresso, cedole, rimborso, tassazione
// italiana 12,5%/26%, porting di lib/bondProjector.mjs). Dove il cashflow
// manca, stima dal rendimento netto/lordo capitalizzato (meno preciso, ma
// meglio di niente: flaggato "method: estimate" così il sito lo segnala).
//
// A differenza della v1, non applica più un taglio a scadenza/valuta né un
// "top N" a livello di build: produce l'intero universo con un piano
// cashflow o un rendimento valido, e lascia filtri/ordinamento al sito
// (interattivi, lato client) — coerente con come funzionava ConfrontoTitoli
// in Laravel (query dal vivo, non una lista pre-tagliata).
//
// Accumula anche lo storico (bonds-history.json, un punto al giorno per
// ISIN) da cui calcola sparkline e delta a 30 giorni, e il confronto con i
// benchmark (inflazione, conto deposito) da config/benchmarks.json.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { score, label, yieldPerRisk } from '../lib/riskScorer.mjs';
import { loadSeries, saveSeries, upsertToday, recentPoints, trendDelta } from '../lib/timeseries.mjs';
import { projectGross, applyItalianTax } from '../lib/bondProjector.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const INPUT_PATH = path.join(DATA_DIR, 'bonds.json');
const CASHFLOWS_PATH = path.join(DATA_DIR, 'bond-cashflows.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'interesting.json');
const HISTORY_PATH = path.join(DATA_DIR, 'bonds-history.json');
const BENCHMARKS_PATH = path.join(__dirname, '..', 'config', 'benchmarks.json');

const NOMINAL = 10000;

function round2(n) {
  return n === null || n === undefined ? null : Math.round(n * 100) / 100;
}

/** Fallback per i titoli senza dettaglio cashflow: stima da net_ytm/gross_ytm
 * (già annualizzati dalla fonte) capitalizzati sugli anni residui. Meno
 * preciso di projectGross (nessuna scomposizione capitale/cedole, nessuna
 * tassazione nostra: il net_ytm è "già netto secondo la fonte"). */
function projectFromYield(bond, today) {
  if (!bond.redemption_date || bond.net_ytm === null) return null;

  const years = Math.max((new Date(bond.redemption_date) - today) / (1000 * 60 * 60 * 24 * 365.25), 0.01);
  const netRate = bond.net_ytm / 100;
  const grossRate = (bond.gross_ytm ?? bond.net_ytm) / 100;

  const netReceived = NOMINAL * (1 + netRate) ** years;
  const grossReceived = NOMINAL * (1 + grossRate) ** years;

  return {
    method: 'estimate',
    settlement_date: today.toISOString().slice(0, 10),
    maturity_date: bond.redemption_date,
    years_to_maturity: round2(years),
    cost_today_10k: NOMINAL,
    gross_received_10k: round2(grossReceived),
    net_received_10k: round2(netReceived),
    gross_profit_10k: round2(grossReceived - NOMINAL),
    net_profit_10k: round2(netReceived - NOMINAL),
    tax_rate: null,
    gross_annualized_pct: round2(bond.gross_ytm ?? bond.net_ytm),
    net_annualized_pct: round2(bond.net_ytm),
  };
}

// Scomposizione completa (porting di projectGross/applyItalianTax): tenuta
// per intero nel JSON, non solo il risultato finale, così il sito può
// mostrare *perché* un titolo rende quel netto — non solo il numero.
function projectFromCashflow(cashflowEvents, issuerCode) {
  const gross = projectGross(cashflowEvents.map((e) => ({ type: e.t, desc: e.d, date: e.dt, amount: e.a })));
  if (!gross) return null;

  const net = applyItalianTax(gross, issuerCode);

  return {
    method: 'cashflow',
    settlement_date: net.settlement_date,
    maturity_date: net.maturity_date,
    years_to_maturity: net.years_to_maturity,
    cost_today_10k: net.cost_today,
    purchase_price_10k: net.purchase_price,
    accrued_interest_paid_10k: net.accrued_interest_paid,
    coupon_income_10k: net.coupon_income,
    redemption_10k: net.redemption,
    capital_gain_10k: net.capital_gain,
    coupon_gain_10k: net.coupon_gain,
    gross_profit_10k: net.gross_profit,
    net_profit_10k: net.net_profit,
    tax_rate: net.tax_rate,
    tax_amount_10k: net.tax_amount,
    gross_annualized_pct: net.gross_annualized_pct,
    net_annualized_pct: net.net_annualized_pct,
  };
}

export async function screen(options = {}) {
  const opts = { ...options };
  const snapshot = JSON.parse(await readFile(INPUT_PATH, 'utf8'));
  const benchmarks = JSON.parse(await readFile(BENCHMARKS_PATH, 'utf8'));
  const cashflows = JSON.parse(await readFile(CASHFLOWS_PATH, 'utf8').catch(() => '{}'));
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const scored = snapshot.bonds
    .filter((b) => b.redemption_date && b.redemption_date > todayStr)
    .map((b) => {
      const riskScore = score(b.sp_rating, b.moodys_rating, b.fitch_rating);
      const projection = cashflows[b.isin_code]
        ? projectFromCashflow(cashflows[b.isin_code], b.issuer_code)
        : projectFromYield(b, today);

      return {
        ...b,
        risk_score: riskScore,
        risk_label: label(riskScore),
        yield_per_risk: yieldPerRisk(b.net_ytm, riskScore),
        projection,
      };
    });

  // Storico: aggiorna il punto di oggi per tutto l'universo (non un
  // sottoinsieme filtrato), così qualunque titolo ha già una storia quando
  // l'utente stringe i filtri lato client.
  const history = await loadSeries(HISTORY_PATH);
  const todaysPoints = new Map(
    scored.map((b) => [b.isin_code, { y: b.net_ytm, g: b.gross_ytm, p: b.price, r: b.risk_score }])
  );
  upsertToday(history, todaysPoints, todayStr, { staleDays: 400 });
  await saveSeries(HISTORY_PATH, history);

  const withHistory = scored.map((b) => ({
    ...b,
    net_ytm_trend_30d: trendDelta(history, b.isin_code, 'y', 30),
    sparkline: recentPoints(history, b.isin_code, 'y', 30),
  }));

  const result = {
    computed_at: new Date().toISOString(),
    options: opts,
    benchmarks,
    total_candidates: withHistory.length,
    bonds: withHistory,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(result));

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsedOptions = process.env.SCREEN_OPTIONS ? JSON.parse(process.env.SCREEN_OPTIONS) : {};
  const result = await screen(parsedOptions);
  console.log(`Screening completato: ${result.total_candidates} titoli salvati in docs/data/interesting.json`);
}
