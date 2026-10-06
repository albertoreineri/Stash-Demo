// Porting di App\Services\EtfMetricsCalculator (Laravel): rendimento
// annualizzato (CAGR) su 1/3/5 anni e volatilità annualizzata dallo storico
// prezzi. Sono metriche storiche, non una proiezione: il passato non
// garantisce il futuro.

const TRADING_DAYS_PER_YEAR = 252;

// Se il punto storico più vicino alla data target (oggi - N anni) è più
// lontano di così, lo storico è insufficiente per quel periodo (es. ETF più
// giovane di N anni): torna null invece di calcolare su un intervallo diverso.
const MAX_TOLERANCE_DAYS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

function diffInDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

function floatDiffInYears(from, to) {
  return diffInDays(to, from) / 365.25;
}

/** @param priceHistory {{date: Date, close: number}[]} */
export function calculate(priceHistory) {
  const sorted = [...priceHistory].sort((a, b) => a.date - b.date);

  if (sorted.length === 0) {
    return { return_1y: null, return_3y: null, return_5y: null, volatility_1y: null };
  }

  const latest = sorted[sorted.length - 1];

  return {
    return_1y: annualizedReturn(sorted, latest, 1),
    return_3y: annualizedReturn(sorted, latest, 3),
    return_5y: annualizedReturn(sorted, latest, 5),
    volatility_1y: annualizedVolatility(sorted, latest.date),
  };
}

function annualizedReturn(sorted, latest, years) {
  const targetDate = new Date(latest.date);
  targetDate.setFullYear(targetDate.getFullYear() - years);

  const past = sorted.find((p) => p.date >= targetDate);
  if (!past || past.close <= 0) return null;
  if (Math.abs(diffInDays(past.date, targetDate)) > MAX_TOLERANCE_DAYS) return null;

  const actualYears = floatDiffInYears(past.date, latest.date);
  if (actualYears <= 0) return null;

  const totalReturn = latest.close / past.close;
  if (totalReturn <= 0) return null;

  return Math.round((totalReturn ** (1 / actualYears) - 1) * 100 * 100) / 100;
}

function annualizedVolatility(sorted, latestDate) {
  const oneYearAgo = new Date(latestDate);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const window = sorted.filter((p) => p.date >= oneYearAgo);
  if (window.length < 20) return null;

  const dailyReturns = [];
  for (let i = 1; i < window.length; i++) {
    const previousClose = window[i - 1].close;
    if (previousClose > 0) {
      dailyReturns.push(window[i].close / previousClose - 1);
    }
  }

  if (dailyReturns.length < 10) return null;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / dailyReturns.length;

  return Math.round(Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100 * 100) / 100;
}
