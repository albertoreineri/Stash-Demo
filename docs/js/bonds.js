import {
  signed, riskBadge, sparkline, formatDate, makeSortableTable, benchmarksLine,
  netDepositPct, loadBenchmarkOverrides, saveBenchmarkOverrides, toCsv, downloadCsv, euro,
} from './shared.js';
import { getFavorites, toggleFavorite } from './store.js';
import { initSyncUi } from './sync-ui.js';
import { couponLabel, buildBondModalContent } from './bondModal.js';
import { initGuide } from './guide.js';

initGuide('bonds');

const NOMINAL = 10000;

let allBonds = [];
let benchmarks = null;
let viewRows = [];
let currentAmount = 10000;
let favSet = new Set();

// La proiezione è calcolata in build sulla base nominale 10.000€ (quella
// usata dal piano cashflow della fonte): ridimensionarla per un importo
// diverso è una semplice proporzione, non serve ricalcolare i cashflow
// (tutta la formula — costo, cedole, rimborso, tasse — è lineare
// nell'importo). Vedi lib/bondProjector.mjs.
function scaleProjection(projection, amount) {
  if (!projection) return { costToday: null, netProfit: null, netAnnualizedPct: null, method: null };
  const factor = amount / NOMINAL;
  return {
    costToday: projection.cost_today_10k * factor,
    netProfit: projection.net_profit_10k * factor,
    netAnnualizedPct: projection.net_annualized_pct,
    method: projection.method,
  };
}

function buildRows(amount) {
  const depositNetPct = netDepositPct(benchmarks.deposit_account_gross_pct, benchmarks.deposit_tax_rate);

  return allBonds.map((b) => {
    const p = scaleProjection(b.projection, amount);
    const vsInflation = p.netAnnualizedPct !== null ? p.netAnnualizedPct - benchmarks.inflation_pct : null;
    const vsDeposit = p.netAnnualizedPct !== null ? p.netAnnualizedPct - depositNetPct : null;

    return {
      ...b,
      cost_today: p.costToday,
      net_profit: p.netProfit,
      net_annualized_pct: p.netAnnualizedPct,
      method: p.method,
      vs_inflation: vsInflation,
      vs_deposit: vsDeposit,
    };
  });
}

function yearsFromNow(years) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(years * 365));
  return d.toISOString().slice(0, 10);
}

function applyFilters(rows, filters) {
  const minDate = yearsFromNow(filters.yearsMin);
  const maxDate = yearsFromNow(filters.yearsMax);

  return rows
    .filter((b) => b.redemption_date >= minDate && b.redemption_date <= maxDate)
    .filter((b) => !filters.country || b.country === filters.country)
    .filter((b) => !filters.currency || b.currency_code === filters.currency)
    .filter((b) => !filters.maxRisk || (b.risk_score !== null && b.risk_score <= filters.maxRisk))
    .filter((b) => filters.minYield === null || (b.net_annualized_pct !== null && b.net_annualized_pct >= filters.minYield))
    .filter((b) => !filters.onlyFav || favSet.has(b.isin_code));
}

function renderRow(b) {
  const methodLabel = b.method === 'cashflow' ? 'piano cashflow' : b.method === 'estimate' ? 'stima da rendimento' : 'n/d';
  const coupon = couponLabel(b.current_coupon_rate);
  const fav = favSet.has(b.isin_code);

  return `
    <tr title="Proiezione: ${methodLabel}">
      <td><button class="info-btn" data-isin="${b.isin_code}" aria-label="Dettaglio ${b.description ?? ''}">i</button></td>
      <td>
        <div class="name-cell">
          <div class="name-title">
            <button class="fav-btn${fav ? ' on' : ''}" data-fav="${b.isin_code}" aria-pressed="${fav}"
              aria-label="${fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}"
              title="${fav ? 'Rimuovi dai preferiti' : 'Tieni d\'occhio'}">${fav ? '★' : '☆'}</button>
            <span>${b.description ?? ''}</span>
          </div>
          <span class="name-sub">
            ${b.isin_code}
            <span class="method-tag">· ${methodLabel}</span>
            ${coupon ? `<span class="method-tag">· ${coupon}</span>` : ''}
          </span>
        </div>
      </td>
      <td>${b.country ?? ''}</td>
      <td>${formatDate(b.redemption_date)}</td>
      <td>${riskBadge(b.risk_label, b.risk_score)}</td>
      <td>${sparkline(b.sparkline, { suffix: '%' })}</td>
      <td>${b.cost_today !== null ? b.cost_today.toFixed(0) : '—'}</td>
      <td>${signed(b.net_annualized_pct)}</td>
      <td class="bench-cell">
        infl. ${signed(b.vs_inflation, { suffix: 'pt' })}<br>
        dep. ${signed(b.vs_deposit, { suffix: 'pt' })}
      </td>
      <td>${signed(b.net_profit, { digits: 0 })}</td>
    </tr>
  `;
}

const table = makeSortableTable({
  tableId: 'bonds-table',
  tbodyId: 'tbody',
  getRows: () => viewRows,
  defaultKey: 'net_annualized_pct',
  renderRow,
  isFavorite: (b) => favSet.has(b.isin_code),
});

function currentFilters() {
  const minYieldRaw = document.getElementById('f-min-yield').value;
  return {
    yearsMin: parseFloat(document.getElementById('f-years-min').value) || 0,
    yearsMax: parseFloat(document.getElementById('f-years-max').value) || 3,
    country: document.getElementById('f-country').value,
    currency: document.getElementById('f-currency').value,
    maxRisk: parseFloat(document.getElementById('f-risk').value) || null,
    minYield: minYieldRaw === '' ? null : parseFloat(minYieldRaw),
    amount: parseFloat(document.getElementById('f-amount').value) || 10000,
    inflationPct: parseFloat(document.getElementById('f-inflation').value) || 0,
    depositGrossPct: parseFloat(document.getElementById('f-deposit').value) || 0,
    onlyFav: document.getElementById('f-fav').checked,
  };
}

// --- Modale di dettaglio ("i" su ogni riga) — contenuto in bondModal.js,
// condiviso col link "Dettagli" del Diario ---

const modalOverlay = document.getElementById('modal-overlay');
const modalPanel = document.getElementById('modal-panel');

function openModal(isin) {
  // Cerca nell'universo intero, non nelle righe filtrate: il link "Dettagli"
  // dal Diario deve aprire la modale anche per un titolo che i filtri
  // correnti (scadenza, paese...) escluderebbero dalla tabella.
  const b = allBonds.find((r) => r.isin_code === isin);
  if (!b) return;
  modalPanel.innerHTML = buildBondModalContent(b, currentAmount);
  modalOverlay.classList.add('open');
  document.getElementById('modal-close').addEventListener('click', closeModal);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalPanel.innerHTML = '';
}

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
document.getElementById('tbody').addEventListener('click', (e) => {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    toggleFavorite('bonds', favBtn.dataset.fav);
    recompute();
    return;
  }
  const btn = e.target.closest('.info-btn');
  if (btn) openModal(btn.dataset.isin);
});

function recompute() {
  const filters = currentFilters();
  currentAmount = filters.amount;
  favSet = getFavorites('bonds');
  benchmarks.inflation_pct = filters.inflationPct;
  benchmarks.deposit_account_gross_pct = filters.depositGrossPct;
  saveBenchmarkOverrides({ inflation_pct: filters.inflationPct, deposit_account_gross_pct: filters.depositGrossPct });
  document.getElementById('benchmarks').textContent = benchmarksLine(benchmarks);

  const rows = buildRows(filters.amount);
  viewRows = applyFilters(rows, filters);
  document.getElementById('meta').textContent =
    `${viewRows.length} titoli su ${allBonds.length} totali · scadenza tra ${filters.yearsMin} e ${filters.yearsMax} anni · ` +
    `${filters.country || 'tutti i paesi'} · ${filters.currency || 'tutte le valute'} · ` +
    `proiezione su ${euro(filters.amount)}`;
  table.render();
}

document.getElementById('filters').addEventListener('input', recompute);

// --- Esportazione CSV (righe attualmente filtrate, con lo stesso importo
// e gli stessi benchmark impostati sullo schermo) ---

const CSV_COLUMNS = [
  { label: 'ISIN', value: (b) => b.isin_code },
  { label: 'Titolo', value: (b) => b.description },
  { label: 'Paese', value: (b) => b.country },
  { label: 'Valuta', value: (b) => b.currency_code },
  { label: 'Scadenza', value: (b) => b.redemption_date },
  { label: 'Cedola %', value: (b) => (b.current_coupon_rate !== null ? b.current_coupon_rate * 100 : '') },
  { label: 'Rating S&P', value: (b) => b.sp_rating },
  { label: "Rating Moody's", value: (b) => b.moodys_rating },
  { label: 'Rating Fitch', value: (b) => b.fitch_rating },
  { label: 'Punteggio rischio', value: (b) => b.risk_score },
  { label: 'Metodo proiezione', value: (b) => b.method },
  { label: 'Costo oggi €', value: (b) => (b.cost_today !== null ? b.cost_today.toFixed(2) : '') },
  { label: 'Guadagno netto €', value: (b) => (b.net_profit !== null ? b.net_profit.toFixed(2) : '') },
  { label: 'Netto annualizzato %', value: (b) => b.net_annualized_pct },
  { label: 'vs inflazione (pt)', value: (b) => b.vs_inflation },
  { label: 'vs conto deposito netto (pt)', value: (b) => b.vs_deposit },
];

document.getElementById('btn-export').addEventListener('click', () => {
  const csv = toCsv(viewRows, CSV_COLUMNS);
  downloadCsv(`stash-obbligazioni-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

fetch('./data/interesting.json')
  .then((r) => r.json())
  .then((data) => {
    allBonds = data.bonds;
    benchmarks = data.benchmarks;

    const overrides = loadBenchmarkOverrides();
    if (overrides) Object.assign(benchmarks, overrides);
    document.getElementById('f-inflation').value = benchmarks.inflation_pct;
    document.getElementById('f-deposit').value = benchmarks.deposit_account_gross_pct;

    const currencies = [...new Set(allBonds.map((b) => b.currency_code).filter(Boolean))].sort();
    const currencySelect = document.getElementById('f-currency');
    for (const c of currencies) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === 'EUR') opt.selected = true;
      currencySelect.appendChild(opt);
    }

    const countries = [...new Set(allBonds.map((b) => b.country).filter(Boolean))].sort();
    const countrySelect = document.getElementById('f-country');
    for (const c of countries) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === 'Italia') opt.selected = true;
      countrySelect.appendChild(opt);
    }

    recompute();

    // Link "Dettagli" dal Diario: ?isin=... apre subito la modale di quel titolo.
    const isin = new URLSearchParams(location.search).get('isin');
    if (isin) openModal(isin);
  })
  .catch((err) => {
    document.getElementById('meta').textContent = 'Errore nel caricamento dei dati: ' + err.message;
  });

// Se online c'è una versione più recente dei preferiti, ridisegna la tabella.
initSyncUi({ onDataChanged: () => { if (benchmarks) recompute(); } });
