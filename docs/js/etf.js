import {
  signed, sparkline, makeSortableTable, benchmarksLine,
  netDepositPct, loadBenchmarkOverrides, saveBenchmarkOverrides, toCsv, downloadCsv, euro,
} from './shared.js';
import { getFavorites, toggleFavorite } from './store.js';
import { initSyncUi } from './sync-ui.js';
import { project } from './etfProject.js';
import { buildEtfModalContent } from './etfModal.js';
import { initGuide } from './guide.js';
import { initAddEtf } from './etfAdd.js';

initGuide('etf');
initAddEtf(document.getElementById('btn-add-etf'));

let allEtfs = [];
let sparklines = {};
let benchmarks = null;
let viewRows = [];
let favSet = new Set();

function buildRows(years, basis, amount) {
  const returnField = `return_${basis}`;
  const depositNetPct = netDepositPct(benchmarks.deposit_account_gross_pct, benchmarks.deposit_tax_rate);

  return allEtfs
    .map((e) => {
      const p = project(e, returnField, amount, years);
      if (!p) return null;

      return {
        ticker: e.ticker,
        isin: e.isin,
        name: e.name ?? e.nickname,
        currency: e.currency,
        fund_family: e.fund_family,
        ter: e.ter,
        volatility: e.volatility_1y,
        sparkline: sparklines[e.ticker] ?? [],
        amount,
        years,
        growth_rate: p.growth_rate,
        capital_gain: p.capital_gain,
        dividend_gain: p.dividend_gain,
        gross_gain: p.gross_gain,
        tax_amount: p.tax_amount,
        net_gain: p.net_gain,
        net_annualized_pct: p.net_annualized_pct,
        vs_inflation: p.net_annualized_pct !== null ? p.net_annualized_pct - benchmarks.inflation_pct : null,
        vs_deposit: p.net_annualized_pct !== null ? p.net_annualized_pct - depositNetPct : null,
      };
    })
    .filter(Boolean);
}

function renderRow(e) {
  const fav = favSet.has(e.ticker);

  return `
    <tr>
      <td><button class="info-btn" data-ticker="${e.ticker}" aria-label="Dettaglio ${e.name ?? ''}">i</button></td>
      <td>
        <div class="name-cell">
          <div class="name-title">
            <button class="fav-btn${fav ? ' on' : ''}" data-fav="${e.ticker}" aria-pressed="${fav}"
              aria-label="${fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}"
              title="${fav ? 'Rimuovi dai preferiti' : 'Tieni d\'occhio'}">${fav ? '★' : '☆'}</button>
            <span>${e.name ?? ''}</span>
          </div>
          <span class="name-sub">${e.ticker}</span>
        </div>
      </td>
      <td>${e.ter ?? '—'}</td>
      <td>${signed(e.growth_rate)}</td>
      <td>${e.volatility ?? '—'}</td>
      <td>${sparkline(e.sparkline, { valueKey: 'v' })}</td>
      <td>${signed(e.net_annualized_pct)}</td>
      <td class="bench-cell">
        infl. ${signed(e.vs_inflation, { suffix: 'pt' })}<br>
        dep. ${signed(e.vs_deposit, { suffix: 'pt' })}
      </td>
      <td>${signed(e.net_gain, { digits: 0, suffix: '€' })}</td>
    </tr>
  `;
}

// --- Modale di dettaglio ("i" su ogni riga) — contenuto in etfModal.js,
// condiviso col link "Dettagli" del Diario ---

const modalOverlay = document.getElementById('modal-overlay');
const modalPanel = document.getElementById('modal-panel');

function openModal(ticker) {
  const e = viewRows.find((r) => r.ticker === ticker);
  if (!e) return;
  modalPanel.innerHTML = buildEtfModalContent(e);
  modalOverlay.classList.add('open');
  document.getElementById('modal-close').addEventListener('click', closeModal);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalPanel.innerHTML = '';
}

modalOverlay.addEventListener('click', (ev) => {
  if (ev.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeModal();
});
document.getElementById('tbody').addEventListener('click', (ev) => {
  const favBtn = ev.target.closest('.fav-btn');
  if (favBtn) {
    toggleFavorite('etfs', favBtn.dataset.fav);
    recompute();
    return;
  }
  const btn = ev.target.closest('.info-btn');
  if (btn) openModal(btn.dataset.ticker);
});

const table = makeSortableTable({
  tableId: 'etf-table',
  tbodyId: 'tbody',
  getRows: () => viewRows,
  defaultKey: 'net_annualized_pct',
  renderRow,
  isFavorite: (e) => favSet.has(e.ticker),
});

function currentFilters() {
  return {
    years: parseFloat(document.getElementById('f-years').value) || 5,
    basis: document.getElementById('f-basis').value,
    amount: parseFloat(document.getElementById('f-amount').value) || 10000,
    inflationPct: parseFloat(document.getElementById('f-inflation').value) || 0,
    depositGrossPct: parseFloat(document.getElementById('f-deposit').value) || 0,
    onlyFav: document.getElementById('f-fav').checked,
  };
}

function recompute() {
  const filters = currentFilters();
  favSet = getFavorites('etfs');
  benchmarks.inflation_pct = filters.inflationPct;
  benchmarks.deposit_account_gross_pct = filters.depositGrossPct;
  saveBenchmarkOverrides({ inflation_pct: filters.inflationPct, deposit_account_gross_pct: filters.depositGrossPct });
  document.getElementById('benchmarks').textContent = benchmarksLine(benchmarks);

  viewRows = buildRows(filters.years, filters.basis, filters.amount)
    .filter((r) => !filters.onlyFav || favSet.has(r.ticker));
  document.getElementById('meta').textContent =
    `${viewRows.length} ETF · proiezione a ${filters.years} anni su ${euro(filters.amount)} ` +
    `(base rendimento: ${filters.basis})`;
  table.render();
}

document.getElementById('filters').addEventListener('input', recompute);

// --- Esportazione CSV (righe attualmente calcolate, con anni/base/importo
// e benchmark impostati sullo schermo) ---

const CSV_COLUMNS = [
  { label: 'Ticker', value: (e) => e.ticker },
  { label: 'ISIN', value: (e) => e.isin },
  { label: 'Nome', value: (e) => e.name },
  { label: 'Emittente', value: (e) => e.fund_family },
  { label: 'Valuta', value: (e) => e.currency },
  { label: 'TER %', value: (e) => e.ter },
  { label: 'Volatilità 1a %', value: (e) => e.volatility },
  { label: 'Rendimento storico %', value: (e) => e.growth_rate },
  { label: 'Guadagno netto €', value: (e) => e.net_gain },
  { label: 'Netto annualizzato %', value: (e) => e.net_annualized_pct },
  { label: 'vs inflazione (pt)', value: (e) => e.vs_inflation },
  { label: 'vs conto deposito netto (pt)', value: (e) => e.vs_deposit },
];

document.getElementById('btn-export').addEventListener('click', () => {
  const csv = toCsv(viewRows, CSV_COLUMNS);
  downloadCsv(`stash-etf-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

Promise.all([
  fetch('./data/etf.json').then((r) => r.json()),
  fetch('./data/etf-interesting.json').then((r) => r.json()),
]).then(([etfData, interestingData]) => {
  allEtfs = etfData.etfs;
  benchmarks = interestingData.benchmarks;
  sparklines = Object.fromEntries(interestingData.etfs.map((e) => [e.ticker, e.sparkline]));

  const overrides = loadBenchmarkOverrides();
  if (overrides) Object.assign(benchmarks, overrides);
  document.getElementById('f-inflation').value = benchmarks.inflation_pct;
  document.getElementById('f-deposit').value = benchmarks.deposit_account_gross_pct;

  recompute();

  // Link "Dettagli" dal Diario: ?ticker=... apre subito la modale di quell'ETF.
  const ticker = new URLSearchParams(location.search).get('ticker');
  if (ticker) openModal(ticker);
}).catch((err) => {
  document.getElementById('meta').textContent = 'Errore nel caricamento dei dati: ' + err.message;
});

// Se online c'è una versione più recente dei preferiti, ridisegna la tabella.
initSyncUi({ onDataChanged: () => { if (benchmarks) recompute(); } });
