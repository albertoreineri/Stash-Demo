// Porting di App\Services\BondReturnProjector::projectGross/applyItalianTax
// (Laravel). Calcola su una base nominale fissa (10.000€, la stessa usata
// dalla fonte per i cashflow) cosa succede tenendo il titolo fino a
// scadenza: costo di ingresso oggi, cedole incassate, rimborso, guadagno
// lordo/netto scomposto in capitale/cedole, tassazione italiana (12,5% se
// emittente Stato italiano, 26% altrimenti).
//
// Il risultato è sempre "per 10.000€ investiti": la pagina lo riscala
// linearmente per l'importo scelto dall'utente (tutta la formula è
// proporzionale all'importo, non serve ricalcolare da capo i cashflow ad
// ogni cambio di importo — vedi docs/index.html).

const NOMINAL_BASIS = 10000;
const STANDARD_TAX_RATE = 0.26;
const ITALIAN_GOVERNMENT_TAX_RATE = 0.125;
const ITALIAN_GOVERNMENT_ISSUER_CODE = 'GOV_IT';

const DAY_MS = 24 * 60 * 60 * 1000;

function floatDiffInYears(from, to) {
  return (to.getTime() - from.getTime()) / DAY_MS / 365.25;
}

/**
 * @param cashflows {{type: string, desc: string, date: string, amount: number}[]}
 *   Già esclusi gli eventi "Taxes" in fase di import (non servono a questo
 *   calcolo, che applica una propria tassazione italiana semplificata).
 */
export function projectGross(cashflows) {
  if (!cashflows || cashflows.length === 0) return null;

  const sorted = [...cashflows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const settlementDate = sorted[0].date;
  const maturityDate = sorted[sorted.length - 1].date;

  const settlement = sorted.filter((c) => c.date === settlementDate);
  const future = sorted.filter((c) => c.date > settlementDate);

  const sumByDescription = (rows, desc) => rows.filter((c) => c.desc === desc).reduce((s, c) => s + c.amount, 0);

  const purchasePrice = -1 * sumByDescription(settlement, 'Pagamento nominale');
  const accruedInterestPaid = -1 * sumByDescription(settlement, 'Rateo lordo');
  const costToday = -1 * settlement.reduce((s, c) => s + c.amount, 0);
  const otherCostsToday = costToday - purchasePrice - accruedInterestPaid;

  const couponIncome = sumByDescription(future, 'Incasso cedola lorda');
  const redemption = sumByDescription(future, 'Rimborso nominale');
  const totalReceived = future.reduce((s, c) => s + c.amount, 0);
  const otherFutureIncome = totalReceived - couponIncome - redemption;

  const capitalGain = redemption - purchasePrice;
  const couponGain = couponIncome - accruedInterestPaid;

  const yearsToMaturity = floatDiffInYears(new Date(settlementDate), new Date(maturityDate));
  const grossProfit = totalReceived - costToday;

  return {
    settlement_date: settlementDate,
    maturity_date: maturityDate,
    years_to_maturity: round2(yearsToMaturity),
    cost_today: round2(costToday),
    purchase_price: round2(purchasePrice),
    accrued_interest_paid: round2(accruedInterestPaid),
    other_costs_today: round2(otherCostsToday),
    coupon_income: round2(couponIncome),
    redemption: round2(redemption),
    other_future_income: round2(otherFutureIncome),
    capital_gain: round2(capitalGain),
    coupon_gain: round2(couponGain),
    gross_profit: round2(grossProfit),
    gross_return_pct: costToday > 0 ? round2((grossProfit / costToday) * 100) : null,
    gross_annualized_pct: annualize(costToday, totalReceived, yearsToMaturity),
  };
}

export function applyItalianTax(grossProjection, issuerCode) {
  const rate = issuerCode === ITALIAN_GOVERNMENT_ISSUER_CODE ? ITALIAN_GOVERNMENT_TAX_RATE : STANDARD_TAX_RATE;

  const taxableGain = Math.max(0, grossProjection.capital_gain) + Math.max(0, grossProjection.coupon_gain);
  const taxAmount = round2(taxableGain * rate);

  const netProfit = round2(grossProjection.gross_profit - taxAmount);
  const costToday = grossProjection.cost_today;
  const totalReceivedNet = costToday + netProfit;

  return {
    ...grossProjection,
    tax_rate: rate,
    tax_amount: taxAmount,
    net_profit: netProfit,
    net_return_pct: costToday > 0 ? round2((netProfit / costToday) * 100) : null,
    net_annualized_pct: annualize(costToday, totalReceivedNet, grossProjection.years_to_maturity),
  };
}

function annualize(invested, received, years) {
  if (invested <= 0 || years <= 0) return null;
  const totalReturn = received / invested;
  if (totalReturn <= 0) return null;
  return round2((totalReturn ** (1 / years) - 1) * 100);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export { NOMINAL_BASIS };
