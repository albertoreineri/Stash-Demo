// Contenuto del box info di un ETF: usato da etf.js (nella sua pagina) e da
// diario.js (nel Diario, sopra "Osservati") — un'unica fonte così i due posti
// non divergono. Diviso in head/body perché il Diario deve poter ricalcolare
// solo il corpo quando importo/anni/base cambiano, senza ricreare
// l'intestazione (altrimenti i campi perderebbero il focus a ogni modifica).

import { signed, euro } from './shared.js';

function yearsLabel(years) {
  return `${years} ${years === 1 ? 'anno' : 'anni'}`;
}

export function buildEtfHead(e) {
  return `
    <div class="modal-head">
      <div>
        <div class="modal-title">${e.name ?? ''}</div>
        <div class="modal-sub">
          ${e.ticker}${e.isin ? ' · ' + e.isin : ''} · ${e.currency ?? ''} ·
          <a href="https://finance.yahoo.com/quote/${encodeURIComponent(e.ticker)}" target="_blank" rel="noopener noreferrer">Yahoo Finance ↗</a>
        </div>
      </div>
      <button class="modal-close" id="modal-close" data-action="close" aria-label="Chiudi">✕</button>
    </div>`;
}

// `e` qui è già la riga "arricchita" con la proiezione calcolata (vedi
// etfProject.js project()), non il record grezzo di etf.json.
export function buildEtfBody(e) {
  return `
    <div class="modal-section">
      <div class="modal-section-title">Fondo</div>
      <div class="modal-row"><span class="k">Emittente</span><span class="v">${e.fund_family ?? 'n/d'}</span></div>
      <div class="modal-row"><span class="k">TER</span><span class="v">${e.ter !== null && e.ter !== undefined ? e.ter + '%' : 'n/d'}</span></div>
      <div class="modal-row"><span class="k">Volatilità 1 anno</span><span class="v">${e.volatility ?? 'n/d'}%</span></div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Proiezione su ${euro(e.amount)} (rendimento storico ${e.growth_rate}%/anno)</div>
      <p class="modal-note">Proiezione statistica: capitalizza il rendimento storico sugli anni scelti, non una promessa sul futuro.</p>
      <div class="modal-row"><span class="k">Investito oggi</span><span class="v">${euro(e.amount)}</span></div>
      <div class="modal-row"><span class="k">Guadagno da capitale</span><span class="v">${signed(e.capital_gain, { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Guadagno da dividendi</span><span class="v">${signed(e.dividend_gain, { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Guadagno lordo</span><span class="v">${signed(e.gross_gain, { digits: 0 })}</span></div>
      <div class="modal-row"><span class="k">Imposta (26%)</span><span class="v">${euro(e.tax_amount)}</span></div>
      <div class="modal-row total"><span class="k">Guadagno netto</span><span class="v">${signed(e.net_gain, { digits: 0 })}</span></div>
      <div class="modal-subrow">in ${yearsLabel(e.years)}</div>
      <div class="modal-row"><span class="k">Netto annualizzato</span><span class="v">${signed(e.net_annualized_pct)}</span></div>
    </div>
  `;
}

export function buildEtfModalContent(e) {
  return buildEtfHead(e) + buildEtfBody(e);
}
