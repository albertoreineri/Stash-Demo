import { loadData, saveData, mutate, toggleFavorite, newId, normalizeData } from './store.js';
import { buildContext, computeStatus, summarize } from './portfolio.js';
import { signed, formatDate, esc, euro } from './shared.js';
import { initSyncUi } from './sync-ui.js';
import { renderRich, toolbarHtml, attachEditor } from './richtext.js';
import { buildBondHead, buildBondBody } from './bondModal.js';
import { buildEtfHead, buildEtfBody } from './etfModal.js';
import { project } from './etfProject.js';
import { initGuide } from './guide.js';

initGuide('diario');

const KIND_LABELS = {
  bond: 'Obbligazione',
  etf: 'ETF',
  deposit: 'Conto deposito',
  fund: 'Fondo comune',
  certificate: 'Certificato / strutturato',
  other: 'Altro',
};

const TAGS = ['Acquisto', 'Vendita', 'Dubbio', 'Riflessione', 'Decisione'];

let ctx = buildContext();

// Filtro per broker/banca sulla tabella Acquisti (vuoto = tutti).
let purchaseBroker = '';

// Colore di ciascun broker (etichetta nella tabella); il testo è scuro
// solo dove lo sfondo è chiaro, per leggibilità.
const BROKER_STYLE = {
  'Intesa Sanpaolo': { color: '#458725', text: '#ffffff' },
  'Tinaba': { color: '#EC692C', text: '#ffffff' },
  'Directa': { color: '#74D8F1', text: '#0b2b33' },
};
const GUARANTEED_COLOR = '#1FB58F';

// Ordinamento della tabella Acquisti. Di default: scadenza più vicina prima;
// chi non ha scadenza (ETF, fondi) va in fondo, in qualunque direzione.
let purchaseSort = { key: 'maturity', desc: false };

const PURCHASE_SORT_VALUE = {
  name: (p) => p.name ?? '',
  date: (p) => p.date ?? null,
  cost: (p) => readNumber(p.cost),
  value: (p, s) => s.value,
  pl: (p, s) => s.pl,
  maturity: (p, s) => s.maturity ?? null,
  expectedNet: (p, s) => s.expectedNet,
};

function sortPurchases(rows) {
  const value = PURCHASE_SORT_VALUE[purchaseSort.key];
  const dir = purchaseSort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = value(a.p, a.s);
    const bv = value(b.p, b.s);
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv, 'it') : av - bv;
    return cmp * dir;
  });
}

function renderSortHeaders() {
  document.querySelectorAll('#purchases-table th[data-sort]').forEach((th) => {
    const active = th.dataset.sort === purchaseSort.key;
    th.classList.toggle('sorted', active);
    th.classList.toggle('desc', active && purchaseSort.desc);
  });
}

document.getElementById('purchases-table').addEventListener('click', (ev) => {
  const th = ev.target.closest('th[data-sort]');
  if (!th) return;
  const key = th.dataset.sort;
  purchaseSort = purchaseSort.key === key
    ? { key, desc: !purchaseSort.desc }
    : { key, desc: key !== 'name' && key !== 'maturity' };
  renderAll();
});

function brokerTag(broker) {
  const st = BROKER_STYLE[broker] ?? { color: '#8a8f98', text: '#ffffff' };
  return `<span class="tag broker" style="--tag-bg:${st.color};--tag-text:${st.text}">${esc(broker)}</span>`;
}

const modalOverlay = document.getElementById('modal-overlay');
const modalPanel = document.getElementById('modal-panel');

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

const muted = (text = '—') => `<span style="color:var(--muted)">${text}</span>`;

// --- Rendering ---

function daysLabel(days) {
  if (days === null) return '';
  if (days < 0) return `scaduto da ${-days} gg`;
  if (days === 0) return 'scade oggi';
  return `tra ${days} gg`;
}

function renderStats(summary, count) {
  const cards = [
    { label: 'Investito', value: euro(summary.invested), sub: `${count} ${count === 1 ? 'acquisto' : 'acquisti'}` },
    {
      label: 'Valore oggi',
      value: euro(summary.current),
      sub: summary.withoutValue > 0
        ? `${summary.withoutValue} senza valore: contati al costo`
        : 'da dati di mercato e valori inseriti',
    },
    {
      label: 'Differenza',
      value: signed(summary.diff, { digits: 0, suffix: '€' }),
      sub: summary.diffPct !== null ? signed(summary.diffPct, { suffix: '%' }) : '—',
    },
    {
      label: 'Prossima scadenza',
      value: summary.next ? formatDate(summary.next.date) : '—',
      sub: summary.next ? `${esc(summary.next.name)} · ${daysLabel(summary.next.days)}` : 'nessuna scadenza registrata',
    },
  ];

  document.getElementById('stats').innerHTML = cards
    .map((c) => `<div class="stat"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`)
    .join('');
}

function renderFavorites(data) {
  const rows = [];

  for (const isin of data.favorites.bonds) {
    const b = ctx.bonds.get(isin);
    const details = b
      ? `<button class="link-btn" data-action="bond-detail" data-id="${esc(isin)}">Dettagli</button>`
      : '';
    rows.push(`
      <tr>
        <td><div class="name-cell"><span>${esc(b ? b.description : isin)}</span><span class="name-sub">Obbligazione · ${esc(isin)}</span></div></td>
        <td>${b ? formatDate(b.redemption_date) : muted()}</td>
        <td>${b?.projection ? signed(b.projection.net_annualized_pct, { suffix: '% netto ann.' }) : muted()}</td>
        <td>${b ? esc(b.risk_label ?? '—') : muted('non più nei dati')}</td>
        <td>${details}<button class="link-btn danger" data-action="unfav" data-kind="bonds" data-id="${esc(isin)}">Rimuovi</button></td>
      </tr>`);
  }

  for (const ticker of data.favorites.etfs) {
    const e = ctx.etfsByTicker.get(ticker.toUpperCase());
    const details = e
      ? `<button class="link-btn" data-action="etf-detail" data-id="${esc(ticker)}">Dettagli</button>`
      : '';
    rows.push(`
      <tr>
        <td><div class="name-cell"><span>${esc(e ? (e.name ?? e.nickname) : ticker)}</span><span class="name-sub">ETF · ${esc(ticker)}</span></div></td>
        <td>${muted()}</td>
        <td>${e && e.return_3y !== null && e.return_3y !== undefined ? signed(e.return_3y, { suffix: '% (3 anni ann.)' }) : muted()}</td>
        <td>${e && e.volatility_1y !== null && e.volatility_1y !== undefined ? `volatilità ${e.volatility_1y}%` : muted()}</td>
        <td>${details}<button class="link-btn danger" data-action="unfav" data-kind="etfs" data-id="${esc(ticker)}">Rimuovi</button></td>
      </tr>`);
  }

  document.getElementById('fav-body').innerHTML = rows.join('');
  document.getElementById('fav-wrap').hidden = rows.length === 0;
  document.getElementById('fav-empty').hidden = rows.length > 0;
}

function renderPurchases(purchases, statuses) {
  const rows = purchases.map((p, i) => {
    const s = statuses[i];
    const valueCell = s.value === null
      ? muted()
      : `${euro(s.value)}${s.source === 'manual' ? ' <span class="method-tag">manuale</span>' : ''}`;
    const plCell = s.pl === null
      ? muted()
      : `${signed(s.pl, { digits: 0, suffix: '€' })}<div class="name-sub">${s.plPct !== null ? signed(s.plPct, { suffix: '%' }) : ''}</div>`;
    const maturityCell = s.maturity
      ? `${formatDate(s.maturity)}<div class="name-sub">${daysLabel(s.daysLeft)}</div>`
      : muted();

    return `
      <tr>
        <td>
          <div class="name-cell">
            <span>${esc(p.name)}</span>
            <span class="name-sub">${esc(KIND_LABELS[p.kind] ?? 'Altro')}${p.ident ? ' · ' + esc(p.ident) : ''}${s.note ? ' · ' + esc(s.note) : ''}</span>
            ${p.broker || p.guaranteed ? `<span class="name-sub">${p.broker ? brokerTag(p.broker) : ''}${p.guaranteed ? `<span class="tag guaranteed" style="--tag-bg:${GUARANTEED_COLOR}">capitale garantito</span>` : ''}</span>` : ''}
          </div>
        </td>
        <td>${formatDate(p.date)}</td>
        <td>${euro(readNumber(p.cost))}</td>
        <td>${valueCell}</td>
        <td>${plCell}</td>
        <td>${maturityCell}</td>
        <td>${s.expectedNet === null ? muted() : signed(s.expectedNet, { digits: 0, suffix: '€' })}</td>
        <td>
          <button class="link-btn" data-action="edit-purchase" data-id="${esc(p.id)}">Modifica</button>
          <button class="link-btn danger" data-action="delete-purchase" data-id="${esc(p.id)}">Elimina</button>
        </td>
      </tr>`;
  });

  document.getElementById('purchases-body').innerHTML = rows.join('');
  document.getElementById('purchases-wrap').hidden = rows.length === 0;
  document.getElementById('purchases-empty').hidden = rows.length > 0;
}

function renderJournal(data) {
  const entries = [...data.journal].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.id ?? '').localeCompare(a.id ?? '')
  );
  const purchaseById = new Map(data.purchases.map((p) => [p.id, p]));
  const container = document.getElementById('journal');

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty">Nessuna voce ancora: annota perché hai comprato, un dubbio, cosa hai deciso. Rileggerlo dopo è il punto.</div>';
    return;
  }

  container.innerHTML = entries
    .map((e) => {
      const linked = e.purchase_id ? purchaseById.get(e.purchase_id) : null;
      return `
        <div class="entry">
          <div class="entry-head">
            <span>${formatDate(e.date)}${e.tag ? `<span class="tag">${esc(e.tag)}</span>` : ''}${linked ? ` · ${esc(linked.name)}` : ''}</span>
            <span>
              <button class="link-btn" data-action="edit-entry" data-id="${esc(e.id)}">Modifica</button>
              <button class="link-btn danger" data-action="delete-entry" data-id="${esc(e.id)}">Elimina</button>
            </span>
          </div>
          <div class="entry-text">${renderRich(e.text)}</div>
        </div>`;
    })
    .join('');
}

function renderBrokerFilter(allPurchases) {
  const select = document.getElementById('filter-broker');
  const brokers = [...new Set(allPurchases.map((p) => p.broker).filter(Boolean))].sort();
  if (purchaseBroker && !brokers.includes(purchaseBroker)) purchaseBroker = '';
  select.innerHTML = '<option value="">Tutti i broker</option>' +
    brokers.map((b) => `<option value="${esc(b)}"${b === purchaseBroker ? ' selected' : ''}>${esc(b)}</option>`).join('');

  // Le stesse scelte come etichette cliccabili: "Tutti" ripristina la vista completa.
  const chip = (value, label, style = '') => {
    const active = value === purchaseBroker;
    const kind = value ? ' broker' : '';
    return `<button type="button" class="tag${kind} broker-chip${active ? ' active' : ''}" data-broker="${esc(value)}" aria-pressed="${active}"${style}>${esc(label)}</button>`;
  };
  document.getElementById('broker-chips').innerHTML = [
    chip('', 'Tutti'),
    ...brokers.map((b) => {
      const st = BROKER_STYLE[b] ?? { color: '#8a8f98', text: '#ffffff' };
      return chip(b, b, ` style="--tag-bg:${st.color};--tag-text:${st.text}"`);
    }),
  ].join('');
}

document.getElementById('broker-chips').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-broker]');
  if (!btn) return;
  purchaseBroker = btn.dataset.broker;
  renderAll();
});

function renderAll() {
  const data = loadData();
  const allPurchases = [...data.purchases].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  renderBrokerFilter(allPurchases);
  const filtered = purchaseBroker ? allPurchases.filter((p) => p.broker === purchaseBroker) : allPurchases;
  const rows = sortPurchases(filtered.map((p) => ({ p, s: computeStatus(p, ctx) })));
  const purchases = rows.map((r) => r.p);
  const statuses = rows.map((r) => r.s);
  renderSortHeaders();
  const favCount = data.favorites.bonds.length + data.favorites.etfs.length;

  document.getElementById('meta').textContent =
    `${purchases.length} acquisti · ${data.journal.length} voci di diario · ${favCount} preferiti`;

  renderStats(summarize(purchases, statuses), purchases.length);
  renderFavorites(data);
  renderPurchases(purchases, statuses);
  renderJournal(data);
}

// --- Modale e form ---

function openModal(html, { wide = false } = {}) {
  modalPanel.className = wide ? 'modal-panel wide' : 'modal-panel';
  modalPanel.innerHTML = html;
  modalOverlay.classList.add('open');
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalPanel.innerHTML = '';
}

// --- Dettaglio titolo (Osservati) ---
// Stessa modale delle pagine Obbligazioni/ETF (bondModal.js/etfModal.js), ma
// con l'importo (e per gli ETF anche anni/base) modificabili qui: si vede
// subito l'effetto di importi diversi senza uscire dal Diario. Solo il
// corpo si ridisegna a ogni modifica — l'intestazione e il campo importo
// restano gli stessi elementi, altrimenti l'input perderebbe il focus a
// ogni cifra digitata. Il valore resta impostato tra un'apertura e l'altra.

let lastBondAmount = 10000;
let lastEtfAmount = 10000;
let lastEtfYears = 5;
let lastEtfBasis = '3y';

function openBondDetail(isin) {
  const b = ctx.bonds.get(isin);
  if (!b) return;
  let amount = lastBondAmount;

  const renderBody = () => {
    document.getElementById('detail-body').innerHTML = buildBondBody(b, amount);
  };

  openModal(`
    ${buildBondHead(b)}
    <div class="filters modal-controls">
      <label>Importo da investire €<input type="number" id="detail-amount" min="1" step="500" value="${amount}"></label>
    </div>
    <div id="detail-body"></div>
  `, { wide: true });

  document.getElementById('detail-amount').addEventListener('input', (ev) => {
    amount = parseFloat(ev.target.value) || 0;
    lastBondAmount = amount;
    renderBody();
  });
  renderBody();
}

function openEtfDetail(ticker) {
  const e = ctx.etfsByTicker.get(ticker.toUpperCase());
  if (!e) return;
  let amount = lastEtfAmount;
  let years = lastEtfYears;
  let basis = lastEtfBasis;

  const renderBody = () => {
    const p = project(e, `return_${basis}`, amount, years);
    const body = document.getElementById('detail-body');
    body.innerHTML = p
      ? buildEtfBody({
          ticker: e.ticker, isin: e.isin, name: e.name ?? e.nickname, currency: e.currency,
          fund_family: e.fund_family, ter: e.ter, volatility: e.volatility_1y,
          amount, years, ...p,
        })
      : `<p class="modal-note">Dati insufficienti per calcolare la proiezione con questi parametri.</p>`;
  };

  openModal(`
    ${buildEtfHead(e)}
    <div class="filters modal-controls">
      <label>Importo da investire €<input type="number" id="detail-amount" min="1" step="500" value="${amount}"></label>
      <label>Proietta a (anni)<input type="number" id="detail-years" min="1" step="1" value="${years}"></label>
      <label>Rendimento storico di riferimento
        <select id="detail-basis">
          <option value="1y"${basis === '1y' ? ' selected' : ''}>Ultimo anno</option>
          <option value="3y"${basis === '3y' ? ' selected' : ''}>Ultimi 3 anni (annualizzato)</option>
          <option value="5y"${basis === '5y' ? ' selected' : ''}>Ultimi 5 anni (annualizzato)</option>
        </select>
      </label>
    </div>
    <div id="detail-body"></div>
  `, { wide: true });

  document.getElementById('detail-amount').addEventListener('input', (ev) => {
    amount = parseFloat(ev.target.value) || 0;
    lastEtfAmount = amount;
    renderBody();
  });
  document.getElementById('detail-years').addEventListener('input', (ev) => {
    years = parseFloat(ev.target.value) || 0;
    lastEtfYears = years;
    renderBody();
  });
  document.getElementById('detail-basis').addEventListener('change', (ev) => {
    basis = ev.target.value;
    lastEtfBasis = basis;
    renderBody();
  });
  renderBody();
}

const formHead = (title) => `
  <div class="modal-head">
    <div class="modal-title">${title}</div>
    <button type="button" class="modal-close" data-action="close" aria-label="Chiudi">✕</button>
  </div>`;

function purchaseFormHtml(p = {}, brokers = []) {
  const v = (x) => (x === null || x === undefined ? '' : esc(x));
  const brokerOptions = brokers.map((b) => `<option value="${esc(b)}"></option>`).join('');
  const kinds = Object.entries(KIND_LABELS)
    .map(([key, label]) => `<option value="${key}"${p.kind === key ? ' selected' : ''}>${label}</option>`)
    .join('');

  return `
    ${formHead(p.id ? 'Modifica acquisto' : 'Nuovo acquisto')}
    <form id="entity-form" class="form-grid" autocomplete="off">
      <label class="full">Tipo<select name="kind">${kinds}</select></label>
      <label class="full">Nome<input name="name" required value="${v(p.name)}" placeholder="es. BTP 15/10/2027 2,7%"></label>
      <label>ISIN o ticker
        <input name="ident" value="${v(p.ident)}" placeholder="IT0005622128">
        <span class="form-help">Per il monitoraggio automatico</span>
      </label>
      <label>Data acquisto<input type="date" name="date" required value="${v(p.date ?? localToday())}"></label>
      <label>Costo totale € (commissioni incluse)<input type="number" step="any" min="0" name="cost" required value="${v(p.cost)}"></label>
      <label>Quantità
        <input type="number" step="any" min="0" name="quantity" value="${v(p.quantity)}">
        <span class="form-help">Nominale € per le obbligazioni, n° quote per gli ETF</span>
      </label>
      <label>Cedole già incassate € (lorde)<input type="number" step="any" min="0" name="coupons_received" value="${v(p.coupons_received)}"></label>
      <label>Tasso lordo % (solo conti deposito)
        <input type="number" step="any" min="0" name="rate_gross" value="${v(p.rate_gross)}">
        <span class="form-help">Il valore si calcola da solo: capitale + interessi netti maturati</span>
      </label>
      <label>Scadenza
        <input type="date" name="maturity" value="${v(p.maturity)}">
        <span class="form-help">Solo se non ricavabile dai dati</span>
      </label>
      <label class="full">Valore attuale € (solo se non monitorato in automatico)
        <input type="number" step="any" min="0" name="manual_value" value="${v(p.manual_value)}">
      </label>
      <label>Broker / banca
        <input name="broker" list="broker-list" value="${v(p.broker)}" placeholder="Directa, Intesa Sanpaolo, Tinaba…">
        <datalist id="broker-list">${brokerOptions}</datalist>
      </label>
      <label class="checkbox"><input type="checkbox" name="guaranteed"${p.guaranteed ? ' checked' : ''}> Capitale garantito</label>
      <label class="full">Note<input name="note" value="${v(p.note)}"></label>
      <div class="form-actions full">
        <button type="button" class="btn-secondary" data-action="close">Annulla</button>
        <button type="submit" class="btn-primary">Salva</button>
      </div>
    </form>`;
}

function entryFormHtml(e = {}, purchases = []) {
  const v = (x) => (x === null || x === undefined ? '' : esc(x));
  const tags = ['', ...TAGS]
    .map((t) => `<option value="${esc(t)}"${(e.tag ?? '') === t ? ' selected' : ''}>${t || '— nessuno —'}</option>`)
    .join('');
  const linkable = ['<option value="">— nessuno —</option>']
    .concat(purchases.map((p) => `<option value="${esc(p.id)}"${e.purchase_id === p.id ? ' selected' : ''}>${esc(p.name)} (${formatDate(p.date)})</option>`))
    .join('');

  return `
    ${formHead(e.id ? 'Modifica voce' : 'Nuova voce')}
    <form id="entity-form" class="form-grid" autocomplete="off">
      <label>Data<input type="date" name="date" required value="${v(e.date ?? localToday())}"></label>
      <label>Tag<select name="tag">${tags}</select></label>
      <label class="full">Collegata all'acquisto<select name="purchase_id">${linkable}</select></label>
      <div class="full rt-field">
        <label for="entry-text">Cosa pensi</label>
        ${toolbarHtml()}
        <textarea id="entry-text" name="text" required>${v(e.text)}</textarea>
        <span class="form-help">**grassetto**, *corsivo*, __sottolineato__ · righe che iniziano con "- " o "1. " diventano elenchi</span>
      </div>
      <div class="form-actions full">
        <button type="button" class="btn-secondary" data-action="close">Annulla</button>
        <button type="submit" class="btn-primary">Salva</button>
      </div>
    </form>`;
}

function openPurchaseForm(existing) {
  const brokers = [...new Set(loadData().purchases.map((p) => p.broker).filter(Boolean))].sort();
  openModal(purchaseFormHtml(existing ?? {}, brokers), { wide: true });
  document.getElementById('entity-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const item = {
      id: existing?.id ?? newId(),
      kind: fd.get('kind'),
      name: String(fd.get('name')).trim(),
      ident: String(fd.get('ident')).trim(),
      date: fd.get('date'),
      cost: readNumber(fd.get('cost')),
      quantity: readNumber(fd.get('quantity')),
      coupons_received: readNumber(fd.get('coupons_received')),
      rate_gross: readNumber(fd.get('rate_gross')),
      maturity: fd.get('maturity') || null,
      manual_value: readNumber(fd.get('manual_value')),
      broker: String(fd.get('broker')).trim() || null,
      guaranteed: fd.get('guaranteed') === 'on',
      note: String(fd.get('note')).trim(),
    };
    if (!item.name || !(item.cost > 0)) {
      alert('Nome e costo (maggiore di zero) sono obbligatori.');
      return;
    }
    mutate((d) => {
      const index = d.purchases.findIndex((x) => x.id === item.id);
      if (index >= 0) d.purchases[index] = item;
      else d.purchases.push(item);
    });
    closeModal();
    renderAll();
  });
}

function openEntryForm(existing) {
  openModal(entryFormHtml(existing ?? {}, loadData().purchases), { wide: true });
  attachEditor(document.getElementById('entry-text'), document.querySelector('.rt-toolbar'));
  document.getElementById('entity-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const item = {
      id: existing?.id ?? newId(),
      date: fd.get('date'),
      tag: fd.get('tag') || null,
      purchase_id: fd.get('purchase_id') || null,
      text: String(fd.get('text')).trim(),
    };
    if (!item.text) {
      alert('Scrivi almeno una riga.');
      return;
    }
    mutate((d) => {
      const index = d.journal.findIndex((x) => x.id === item.id);
      if (index >= 0) d.journal[index] = item;
      else d.journal.push(item);
    });
    closeModal();
    renderAll();
  });
}

// --- Esporta / importa ---

function exportJson() {
  const blob = new Blob([JSON.stringify(loadData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stash-diario-${localToday()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    alert('File non valido: non è un JSON.');
    return;
  }

  const incoming = normalizeData(parsed);
  const current = loadData();
  const summary = (d) =>
    `${d.purchases.length} acquisti, ${d.journal.length} voci, ${d.favorites.bonds.length + d.favorites.etfs.length} preferiti`;

  if (confirm(`Sostituire i dati attuali (${summary(current)}) con quelli del file (${summary(incoming)})?`)) {
    saveData(incoming);
    renderAll();
  }
}

// --- Eventi ---

document.addEventListener('click', (ev) => {
  if (ev.target === modalOverlay) {
    closeModal();
    return;
  }

  const el = ev.target.closest('[data-action]');
  if (!el) return;

  const { action, id, kind } = el.dataset;
  const data = loadData();

  switch (action) {
    case 'close': closeModal(); break;
    case 'export': exportJson(); break;
    case 'import': document.getElementById('file-import').click(); break;
    case 'add-purchase': openPurchaseForm(null); break;
    case 'edit-purchase': openPurchaseForm(data.purchases.find((p) => p.id === id)); break;
    case 'delete-purchase':
      if (confirm('Eliminare questo acquisto? Le voci di diario collegate restano.')) {
        mutate((d) => { d.purchases = d.purchases.filter((p) => p.id !== id); });
        renderAll();
      }
      break;
    case 'add-entry': openEntryForm(null); break;
    case 'edit-entry': openEntryForm(data.journal.find((e) => e.id === id)); break;
    case 'delete-entry':
      if (confirm('Eliminare questa voce del diario?')) {
        mutate((d) => { d.journal = d.journal.filter((e) => e.id !== id); });
        renderAll();
      }
      break;
    case 'unfav':
      toggleFavorite(kind, id);
      renderAll();
      break;
    case 'bond-detail': openBondDetail(id); break;
    case 'etf-detail': openEtfDetail(id); break;
    case 'refresh-market': refreshMarketData(); break;
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeModal();
});

document.getElementById('filter-broker').addEventListener('change', (ev) => {
  purchaseBroker = ev.target.value;
  renderAll();
});

document.getElementById('file-import').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file) importJson(file);
});

// --- Dati di mercato (bonds/etf.json) ---
// Caricati una volta all'apertura pagina: il valore "auto" di Osservati e
// Acquisti resta quello di allora finché non si ricarica la pagina o si
// preme "Aggiorna dati di mercato" (che rifà il fetch bypassando la cache
// del browser). I file stessi cambiano una volta al giorno nei feriali,
// quando gira la pipeline di raccolta dati: "Aggiorna" prende l'ultima
// versione pubblicata, non un prezzo in tempo reale.
function marketAsOfLabel(iso) {
  return iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : null;
}

// Tenuto a parte (non solo nel testo a schermo), così si può confrontare
// con la versione precedente quando i dati vengono ricaricati.
let marketComputedAt = null;

async function loadMarketData({ fresh = false } = {}) {
  const options = fresh ? { cache: 'no-store' } : {};
  const [interesting, etf, funds] = await Promise.all([
    fetch('./data/interesting.json', options).then((r) => r.json()).catch(() => ({ bonds: [] })),
    fetch('./data/etf.json', options).then((r) => r.json()).catch(() => ({ etfs: [] })),
    fetch('./data/funds.json', options).then((r) => r.json()).catch(() => ({ funds: [] })),
  ]);

  // Fondi comuni e certificati (docs/data/funds.json) entrano nello stesso
  // indice per ISIN degli ETF: il calcolo del valore degli acquisti è lo stesso.
  const fundItems = (funds.funds ?? []).map((f) => ({
    ticker: f.isin,
    isin: f.isin,
    name: f.name,
    currency: f.currency,
    price: f.price,
  }));
  ctx = buildContext(interesting.bonds ?? [], [...(etf.etfs ?? []), ...fundItems]);
  marketComputedAt = interesting.computed_at ?? null;

  const asOf = [interesting.computed_at, etf.imported_at].map(marketAsOfLabel).filter(Boolean);
  document.getElementById('market-asof').textContent = asOf.length
    ? `Dati di mercato aggiornati al ${asOf[0]}`
    : '';
}

async function refreshMarketData() {
  const button = document.querySelector('[data-action="refresh-market"]');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Aggiornamento…';
  try {
    await loadMarketData({ fresh: true });
    renderAll();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// Prima i dati di mercato, poi il primo render: senza, i valori automatici
// comparirebbero solo dopo un attimo e la pagina "salterebbe".
loadMarketData().then(renderAll);

// Se online c'è una versione più recente, ridisegna tutta la pagina.
initSyncUi({ onDataChanged: renderAll });
