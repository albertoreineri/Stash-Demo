// Calcolo dello stato degli acquisti registrati nel diario, a partire dai
// dati di mercato che il sito già scarica (interesting.json, etf.json).
// Solo funzioni pure, nessun DOM: così si testano da Node.
//
// Approssimazioni dichiarate:
// - Per un BTP/BOT il "valore oggi" è quanto costerebbe comprarlo oggi
//   (prezzo + rateo da projection.cost_today_10k), non il prezzo di vendita:
//   sotto la differenza denaro/lettera, ma è la stima coerente con la
//   colonna "costo" del resto del sito.
// - Il guadagno netto atteso a scadenza usa il rimborso e le cedole future
//   del piano cashflow, tolto ciò che hai pagato e la tassa del titolo
//   (12,5% Stato italiano, 26% altri) sul guadagno positivo: è una stima,
//   non il calcolo esatto dell'intermediario.

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / DAY_MS);
}

export function buildContext(bonds = [], etfs = []) {
  return {
    bonds: new Map(bonds.map((b) => [b.isin_code, b])),
    etfsByIsin: new Map(etfs.filter((e) => e.isin).map((e) => [e.isin.toUpperCase(), e])),
    etfsByTicker: new Map(etfs.map((e) => [e.ticker.toUpperCase(), e])),
  };
}

// Conto deposito: interessi lordi = capitale × tasso × giorni / 365, tassati
// al 26% (come da banca, verificato sui saldi reali). Si fermano alla
// scadenza. Ritorna { accrued, full } in euro netti, o null se mancano dati.
const DEPOSIT_TAX = 0.26;
const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;

function daysBetween(fromISO, toISO) {
  return Math.round((new Date(`${toISO}T00:00:00`) - new Date(`${fromISO}T00:00:00`)) / DAY_MS_LOCAL);
}

export function depositInterest(p, now = new Date()) {
  const cost = num(p.cost);
  const rate = num(p.rate_gross);
  if (!cost || rate === null || !p.date || !p.maturity) return null;

  const total = Math.max(0, daysBetween(p.date, p.maturity));
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const elapsed = Math.min(total, Math.max(0, daysBetween(p.date, todayISO)));

  const netPerDay = (cost * (rate / 100)) / 365 * (1 - DEPOSIT_TAX);
  return { accrued: netPerDay * elapsed, full: netPerDay * total };
}

export function computeStatus(p, ctx, now = new Date()) {
  const cost = num(p.cost) ?? 0;
  const quantity = num(p.quantity);
  const couponsReceived = num(p.coupons_received) ?? 0;
  const ident = (p.ident ?? '').trim().toUpperCase();

  let value = null;
  let auto = false;
  let maturity = p.maturity || null;
  let expectedNet = null;
  let note = null;

  if (p.kind === 'bond' && ident && quantity > 0) {
    const bond = ctx.bonds.get(ident);
    if (bond) {
      const factor = quantity / 10000;
      const projection = bond.projection;
      maturity = bond.redemption_date;

      if (projection?.method === 'cashflow') {
        value = projection.cost_today_10k * factor;
        auto = true;
        const redemption = (projection.redemption_10k + projection.coupon_income_10k) * factor;
        const gross = redemption + couponsReceived - cost;
        expectedNet = gross - (projection.tax_rate ?? 0) * Math.max(0, gross);
      } else if (bond.price !== null && bond.price !== undefined) {
        value = (bond.price / 100) * quantity;
        auto = true;
      }
    } else {
      note = 'ISIN non trovato nei dati: valore a mano';
    }
  } else if ((p.kind === 'etf' || p.kind === 'fund' || p.kind === 'certificate') && ident && quantity > 0) {
    const etf = ctx.etfsByIsin.get(ident) ?? ctx.etfsByTicker.get(ident);
    if (etf && etf.currency === 'EUR' && etf.price !== null && etf.price !== undefined) {
      value = quantity * etf.price;
      auto = true;
    } else if (etf) {
      note = `quotato in ${etf.currency}: valore a mano`;
    } else {
      note = 'non è nella watchlist ETF: valore a mano';
    }
  }

  if (p.kind === 'deposit') {
    const interest = depositInterest(p, now);
    if (interest) {
      value = cost + interest.accrued;
      auto = true;
      expectedNet = interest.full;
    }
  }

  if (value === null) {
    const manual = num(p.manual_value);
    if (manual !== null) value = manual;
  }

  const pl = value === null ? null : value + couponsReceived - cost;

  return {
    value,
    source: value === null ? null : auto ? 'auto' : 'manual',
    pl,
    plPct: pl === null || cost <= 0 ? null : (pl / cost) * 100,
    maturity,
    daysLeft: daysUntil(maturity, now),
    expectedNet,
    note,
  };
}

export function summarize(purchases, statuses) {
  let invested = 0;
  let current = 0;
  let withoutValue = 0;
  let next = null;

  purchases.forEach((p, i) => {
    const cost = num(p.cost) ?? 0;
    const status = statuses[i];
    invested += cost;

    if (status.value === null) {
      current += cost;
      withoutValue += 1;
    } else {
      current += status.value + (num(p.coupons_received) ?? 0);
    }

    if (status.daysLeft !== null && status.daysLeft >= 0 && (!next || status.daysLeft < next.days)) {
      next = { name: p.name, days: status.daysLeft, date: status.maturity };
    }
  });

  const diff = current - invested;

  return {
    invested,
    current,
    diff,
    diffPct: invested > 0 ? (diff / invested) * 100 : null,
    withoutValue,
    next,
  };
}
