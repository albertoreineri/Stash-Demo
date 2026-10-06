// interesting.json ora contiene l'intero universo di titoli (screening e
// filtri sono interattivi lato sito, non più tagliati in build) — quindi
// non ha più senso diffare "tutto contro tutto": si spammerebbe l'intera
// lista ad ogni cambiamento minimo. Notify si ritaglia una sua "prima
// pagina" fissa (scadenza breve, EUR, investment grade, ordinata per
// rendimento/rischio) e notifica solo i titoli nuovi lì dentro.

import { sendTelegramMessage } from '../lib/telegram.mjs';

const HEADLINE_FILTER = {
  maxYears: 3,
  currency: 'EUR',
  minInvestmentGrade: true,
  top: 20,
};

function maxRedemptionDate(years) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(years * 365));
  return d.toISOString().slice(0, 10);
}

export function headlineBonds(bonds = []) {
  const limitDate = maxRedemptionDate(HEADLINE_FILTER.maxYears);

  return bonds
    .filter((b) => b.redemption_date <= limitDate)
    .filter((b) => b.currency_code === HEADLINE_FILTER.currency)
    .filter((b) => b.risk_score !== null && b.risk_score <= 10) // investment grade, vedi lib/riskScorer.mjs
    .filter((b) => b.yield_per_risk !== null)
    .sort((a, b) => b.yield_per_risk - a.yield_per_risk)
    .slice(0, HEADLINE_FILTER.top);
}

export function diffNewEntries(previousBonds = [], currentBonds = []) {
  const previousIsins = new Set(previousBonds.map((b) => b.isin_code));
  return currentBonds.filter((b) => !previousIsins.has(b.isin_code));
}

export function formatMessage(newEntries) {
  const lines = [
    `<b>Nuovi titoli interessanti</b> (scadenza entro ${HEADLINE_FILTER.maxYears} anni, ` +
      `${HEADLINE_FILTER.currency}, investment grade)`,
    '',
  ];

  for (const b of newEntries) {
    lines.push(
      `• <b>${b.description}</b> (${b.isin_code})\n` +
        `  netto ${b.net_ytm}% · rischio ${b.risk_label} · scad. ${b.redemption_date}`
    );
  }

  return lines.join('\n');
}

export async function notifyNewEntries(previous, current) {
  const previousHeadline = headlineBonds(previous.bonds ?? []);
  const currentHeadline = headlineBonds(current.bonds ?? []);
  const newEntries = diffNewEntries(previousHeadline, currentHeadline);

  if (newEntries.length === 0) {
    console.log('Nessun titolo nuovo rispetto al run precedente, notifica non inviata.');
    return { sent: false, newEntries };
  }

  const message = formatMessage(newEntries);
  await sendTelegramMessage(message);

  return { sent: true, newEntries };
}
