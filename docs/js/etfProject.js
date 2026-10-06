// Proiezione statistica su un ETF: capitalizza il rendimento storico scelto
// sugli anni scelti, aggiunge i dividendi (semplici, non reinvestiti) e
// applica la tassa 26% fissa sul guadagno. Nessun cashflow da leggere (a
// differenza delle obbligazioni), quindi si ricalcola all'istante da capo
// ogni volta — usato sia da etf.js (pagina ETF) sia da diario.js (Osservati).

const TAX_RATE = 0.26;

function annualize(invested, final, years) {
  if (invested <= 0 || years <= 0 || final <= 0) return null;
  return Math.round(((final / invested) ** (1 / years) - 1) * 100 * 100) / 100;
}

export function project(etf, returnField, amount, years) {
  const growthRate = etf[returnField];
  if (growthRate === null || growthRate === undefined) return null;

  const capitalFinal = amount * (1 + growthRate / 100) ** years;
  const capitalGain = capitalFinal - amount;

  const dividendYield = etf.dividend_yield;
  const dividendGain = dividendYield ? amount * (dividendYield / 100) * years : 0;

  const grossGain = capitalGain + dividendGain;
  const grossFinal = amount + grossGain;

  const taxAmount = Math.max(0, grossGain) * TAX_RATE;
  const netGain = grossGain - taxAmount;
  const netFinal = amount + netGain;

  return {
    growth_rate: Math.round(growthRate * 100) / 100,
    capital_gain: Math.round(capitalGain * 100) / 100,
    dividend_gain: Math.round(dividendGain * 100) / 100,
    gross_gain: Math.round(grossGain * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    net_gain: Math.round(netGain * 100) / 100,
    net_annualized_pct: annualize(amount, netFinal, years),
  };
}
