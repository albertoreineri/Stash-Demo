// Contenuto del box info di un'obbligazione: usato da bonds.js (nella sua
// pagina) e da diario.js (nel Diario, sopra "Osservati") — un'unica fonte
// così i due posti non divergono. Diviso in head/body perché il Diario deve
// poter ricalcolare solo il corpo quando l'importo cambia, senza ricreare
// l'intestazione (altrimenti il campo importo perderebbe il focus a ogni
// cifra digitata).

import { signed, riskBadge, formatDate, euro } from './shared.js';

const NOMINAL = 10000;

// current_coupon_rate arriva dalla fonte come frazione (0.0625 = 6,25%),
// diversamente da net_ytm/gross_ytm che sono già in "punti percentuale".
export function couponLabel(rate) {
  if (rate === null || rate === undefined) return null;
  const pct = Number((rate * 100).toFixed(3));
  return pct === 0 ? 'ZC (zero coupon)' : `cedola ${pct}%`;
}

function durationLabel(years) {
  if (years === null || years === undefined) return null;
  const totalMonths = Math.round(years * 12);
  if (totalMonths <= 0) return null;

  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const yLabel = `${y} ann${y === 1 ? 'o' : 'i'}`;
  const mLabel = `${m} mes${m === 1 ? 'e' : 'i'}`;

  if (y === 0) return mLabel;
  if (m === 0) return yLabel;
  return `${yLabel} e ${mLabel}`;
}

function scaleField(v, amount) {
  return v === null || v === undefined ? null : v * (amount / NOMINAL);
}

export function buildBondHead(b) {
  return `
    <div class="modal-head">
      <div>
        <div class="modal-title">${b.description ?? ''}</div>
        <div class="modal-sub">${b.isin_code} · ${b.country ?? ''} · ${b.currency_code ?? ''}</div>
      </div>
      <button class="modal-close" id="modal-close" data-action="close" aria-label="Chiudi">✕</button>
    </div>`;
}

export function buildBondBody(b, amount) {
  const p = b.projection;
  const s = (v) => scaleField(v, amount);
  const ratingsLine = `S&P ${b.sp_rating ?? 'n/d'} · Moody's ${b.moodys_rating ?? 'n/d'} · Fitch ${b.fitch_rating ?? 'n/d'}`;
  const coupon = couponLabel(b.current_coupon_rate);
  const couponLine = coupon === 'ZC (zero coupon)'
    ? 'Zero coupon (nessuna cedola, rimborso a scadenza sopra il prezzo pagato)'
    : coupon
      ? `${coupon.replace('cedola ', '')} annuo`
      : 'n/d';

  let projectionHtml;
  if (!p) {
    projectionHtml = `<p class="modal-note">Nessuna proiezione disponibile per questo titolo.</p>`;
  } else if (p.method === 'cashflow') {
    projectionHtml = `
      <div class="modal-row"><span class="k">Prezzo pagato</span><span class="v">${euro(s(p.purchase_price_10k))}</span></div>
      <div class="modal-row"><span class="k">Rateo lordo pagato</span><span class="v">${euro(s(p.accrued_interest_paid_10k))}</span></div>
      <div class="modal-row total"><span class="k">Costo totale oggi</span><span class="v">${euro(s(p.cost_today_10k))}</span></div>
      <div class="modal-row"><span class="k">Cedole incassate</span><span class="v">${euro(s(p.coupon_income_10k))}</span></div>
      <div class="modal-row"><span class="k">Rimborso a scadenza</span><span class="v">${euro(s(p.redemption_10k))}</span></div>
      <div class="modal-row"><span class="k">Guadagno da capitale</span><span class="v">${signed(s(p.capital_gain_10k), { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Guadagno da cedole</span><span class="v">${signed(s(p.coupon_gain_10k), { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Guadagno lordo</span><span class="v">${signed(s(p.gross_profit_10k), { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Imposta (${(p.tax_rate * 100).toFixed(1)}%)</span><span class="v">${euro(s(p.tax_amount_10k))}</span></div>
      <div class="modal-row total"><span class="k">Guadagno netto</span><span class="v">${signed(s(p.net_profit_10k), { digits: 0 })}</span></div>
      <div class="modal-subrow">in ${durationLabel(p.years_to_maturity)} (entro il ${formatDate(p.maturity_date)})</div>
      <div class="modal-row"><span class="k">Netto annualizzato</span><span class="v">${signed(p.net_annualized_pct)}</span></div>
    `;
  } else {
    projectionHtml = `
      <p class="modal-note">Nessun piano cashflow per questo titolo: stima dal rendimento dichiarato dalla fonte,
      capitalizzato sugli anni residui — non scomponibile in capitale/cedole.</p>
      <div class="modal-row"><span class="k">Investito oggi</span><span class="v">${euro(amount)}</span></div>
      <div class="modal-row"><span class="k">Ricevuto lordo stimato</span><span class="v">${euro(s(p.gross_received_10k))}</span></div>
      <div class="modal-row total"><span class="k">Ricevuto netto stimato</span><span class="v">${euro(s(p.net_received_10k))}</span></div>
      <div class="modal-subrow">in ${durationLabel(p.years_to_maturity)} (entro il ${formatDate(p.maturity_date)})</div>
      <div class="modal-row"><span class="k">Netto annualizzato</span><span class="v">${signed(p.net_annualized_pct)}</span></div>
    `;
  }

  return `
    <div class="modal-section">
      <div class="modal-section-title">Titolo</div>
      <div class="modal-row"><span class="k">Emittente</span><span class="v">${b.issuer_description ?? 'n/d'}</span></div>
      <div class="modal-row"><span class="k">Cedola</span><span class="v">${couponLine}</span></div>
      <div class="modal-row"><span class="k">Rating</span><span class="v">${ratingsLine}</span></div>
      <div class="modal-row"><span class="k">Rischio</span><span class="v">${riskBadge(b.risk_label, b.risk_score)}</span></div>
      <div class="modal-row"><span class="k">Scadenza</span><span class="v">${formatDate(b.redemption_date)}</span></div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Proiezione su ${euro(amount)} (${p?.method === 'cashflow' ? 'piano cashflow' : 'stima'})</div>
      ${projectionHtml}
    </div>
  `;
}

export function buildBondModalContent(b, amount) {
  return buildBondHead(b) + buildBondBody(b, amount);
}
