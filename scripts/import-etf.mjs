// Porting di ImportEtfData (Laravel): per ogni ticker attivo in
// config/etf-watchlist.json, scarica storico prezzi (5 anni) e dati fondo da
// Yahoo Finance, calcola rendimento/volatilità e produce docs/data/etf.json
// (uno snapshot per ticker).
//
// I dati fondo (TER, holdings, dividend yield) richiedono un token che
// Yahoo può negare senza preavviso: se falliscono, il ticker viene comunque
// salvato con prezzo e metriche, solo senza quei campi — mai perso del tutto.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chart, quoteSummary } from '../lib/yahoo.mjs';
import { calculate } from '../lib/etfMetrics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'etf-watchlist.json');
const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'etf.json');
const HISTORY_PATH = path.join(DATA_DIR, 'etf-history.json');

// Yahoo dà già 5 anni di storico ad ogni chiamata: non serve accumulare
// nulla di nostro, basta tenere l'ultima finestra (qui 3 anni, per uno
// sparkline/grafico senza appesantire troppo il JSON) e sovrascriverla ad
// ogni run — Yahoo è la fonte di verità sul passato, non c'è drift da
// gestire come per i BTP (che invece non pubblicano storico).
const HISTORY_WINDOW_DAYS = 3 * 365;

function toIsoDate(timestampSeconds) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function resolveTotalNetAssets(keyStats, fees) {
  if (keyStats?.totalAssets?.raw !== undefined) return keyStats.totalAssets.raw;
  if (fees?.totalNetAssets?.raw !== undefined) return fees.totalNetAssets.raw * 1_000_000;
  return null;
}

async function importTicker(entry) {
  const { ticker, isin } = entry;

  const chartData = await chart(ticker, '5y', '1d');
  if (!chartData || !chartData.timestamps?.length) {
    throw new Error('storico prezzi non disponibile');
  }

  const closes = chartData.quotes.close ?? [];
  const priceHistory = chartData.timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000), close: closes[i] }))
    .filter((p) => p.close !== null && p.close !== undefined);

  if (priceHistory.length === 0) {
    throw new Error('nessun dato di prezzo valido nello storico');
  }

  const metrics = calculate(priceHistory);
  const meta = chartData.meta;
  const latestClose = priceHistory[priceHistory.length - 1];

  const result = {
    ticker,
    isin: isin ?? null,
    nickname: entry.nickname ?? null,
    name: meta.longName ?? meta.shortName ?? null,
    currency: meta.currency ?? null,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    referenced_date: toIsoDate(chartData.timestamps[chartData.timestamps.length - 1]),
    price: meta.regularMarketPrice ?? latestClose.close,
    previous_close: meta.chartPreviousClose ?? null,
    day_high: meta.regularMarketDayHigh ?? null,
    day_low: meta.regularMarketDayLow ?? null,
    fifty_two_week_high: meta.fiftyTwoWeekHigh ?? null,
    fifty_two_week_low: meta.fiftyTwoWeekLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    return_1y: metrics.return_1y,
    return_3y: metrics.return_3y,
    return_5y: metrics.return_5y,
    volatility_1y: metrics.volatility_1y,
    dividend_yield: null,
    ter: null,
    fund_family: null,
    total_net_assets: null,
    stock_position: null,
    bond_position: null,
    cash_position: null,
    other_position: null,
    fundamentals_available: false,
    // Rimosso prima di scrivere etf.json: serve solo per popolare
    // etf-history.json, non va duplicato nello snapshot.
    _priceHistory: priceHistory,
  };

  // Best-effort: se Yahoo nega il crumb (rate limit, endpoint più
  // restrittivo...) teniamo comunque prezzo e metriche calcolati sopra.
  const summary = await quoteSummary(ticker, [
    'fundProfile',
    'summaryDetail',
    'defaultKeyStatistics',
    'topHoldings',
  ]);

  if (summary) {
    const fundProfile = summary.fundProfile ?? {};
    const fees = fundProfile.feesExpensesInvestment ?? {};
    const topHoldings = summary.topHoldings ?? {};
    const keyStats = summary.defaultKeyStatistics ?? {};
    const dividendYield = summary.summaryDetail?.dividendYield?.raw;

    Object.assign(result, {
      fund_family: fundProfile.family ?? null,
      ter: fees.annualReportExpenseRatio?.raw !== undefined ? Math.round(fees.annualReportExpenseRatio.raw * 100 * 1000) / 1000 : null,
      total_net_assets: resolveTotalNetAssets(keyStats, fees),
      stock_position: topHoldings.stockPosition?.raw !== undefined ? Math.round(topHoldings.stockPosition.raw * 100 * 100) / 100 : null,
      bond_position: topHoldings.bondPosition?.raw !== undefined ? Math.round(topHoldings.bondPosition.raw * 100 * 100) / 100 : null,
      cash_position: topHoldings.cashPosition?.raw !== undefined ? Math.round(topHoldings.cashPosition.raw * 100 * 100) / 100 : null,
      other_position: topHoldings.otherPosition?.raw !== undefined ? Math.round(topHoldings.otherPosition.raw * 100 * 100) / 100 : null,
      dividend_yield: dividendYield !== undefined ? Math.round(dividendYield * 100 * 100) / 100 : null,
      fundamentals_available: true,
    });
  }

  return result;
}

export async function importEtfs() {
  const watchlist = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const active = watchlist.filter((e) => e.active);

  const etfs = [];
  const errors = [];
  const history = {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_WINDOW_DAYS);

  for (const entry of active) {
    try {
      const etf = await importTicker(entry);

      history[etf.ticker] = etf._priceHistory
        .filter((p) => p.date >= cutoff)
        .map((p) => ({ d: p.date.toISOString().slice(0, 10), c: p.close }));

      delete etf._priceHistory;
      etfs.push(etf);
    } catch (err) {
      errors.push({ ticker: entry.ticker, message: err.message });
    }
  }

  const snapshot = {
    imported_at: new Date().toISOString(),
    count: etfs.length,
    errors,
    etfs,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2));
  await writeFile(HISTORY_PATH, JSON.stringify(history));

  return snapshot;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshot = await importEtfs();
  console.log(`Importati ${snapshot.count}/${snapshot.count + snapshot.errors.length} ETF.`);
  for (const e of snapshot.errors) {
    console.log(`  fallito ${e.ticker}: ${e.message}`);
  }
}
