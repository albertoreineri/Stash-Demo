// Helper condivisi tra bonds.js e etf.js: numeri con segno, badge di
// rischio, sparkline SVG, tabella ordinabile. Nessuna dipendenza esterna —
// caricato come modulo ES nativo, gira sia su GitHub Pages sia in locale.

// Escape per testo inserito in HTML (contenuti scritti dall'utente nel
// diario, o importati da file): mai in innerHTML senza passare da qui.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// CSV standard (RFC4180: virgola, decimali con punto, quoting solo dove
// serve) invece che il formato italiano con punto e virgola: più portabile
// per chi lo apre altrove (Python/R/Sheets), non solo Excel IT — Excel
// comunque lo importa bene con "Dati > Da testo/CSV".
export function toCsv(rows, columns) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => escape(c.value(r))).join(','));
  return [header, ...lines].join('\r\n');
}

export function downloadCsv(filename, csvText) {
  // BOM UTF-8 davanti al testo: senza, Excel apre il file interpretando
  // male gli accenti e il simbolo €.
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// "2029-08-02" -> "02/08/2029". Le date arrivano sempre in ISO dai JSON
// (così ordinano correttamente come stringhe); qui si formattano solo per
// la visualizzazione.
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// L'italiano CLDR non raggruppa le migliaia sotto i 10.000 di default
// (5000 -> "5000", ma 10000 -> "10.000"): useGrouping:'always' lo forza
// sempre, altrimenti importi come "€5000" sarebbero incoerenti con "€10.000".
export function euro(n) {
  return n === null || n === undefined
    ? '—'
    : '€' + Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' });
}

export function signed(n, { digits = 2, suffix = '' } = {}) {
  if (n === null || n === undefined) return `<span style="color:var(--muted)">—</span>`;
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  const arrow = n > 0 ? '▲' : n < 0 ? '▼' : '';
  const value = (n > 0 ? '+' : '') + n.toFixed(digits) + suffix;
  return `<span class="${cls}">${arrow ? arrow + ' ' : ''}${value}</span>`;
}

// Badge di rischio: icona (pallino) + testo in inchiostro normale — mai il
// colore da solo come canale (vedi skill dataviz, status palette).
export function riskBadge(label, score) {
  if (!label || score === null || score === undefined) {
    return `<span style="color:var(--muted)">—</span>`;
  }
  let color = 'var(--good)';
  if (score > 16) color = 'var(--critical)';
  else if (score > 13) color = 'var(--serious)';
  else if (score > 10) color = 'var(--warning)';
  // A capo prima della parentesi (es. "Rischio basso" / "(Investment
  // Grade)") invece di lasciarlo spezzare dove capita: solo qui, a video —
  // label resta testo semplice per i posti che lo riusano (notifiche Telegram).
  const displayLabel = label.replace(' (', '<br>(');
  return `<span class="risk"><span class="risk-dot" style="background:${color}"></span>${displayLabel}</span>`;
}

// Sparkline: linea sfumata (de-enfasi) + ultimo tratto/punto in accento,
// come da spec "stat tile + trend" della skill dataviz.
export function sparkline(points, { width = 90, height = 24, valueKey = 'v', suffix = '' } = {}) {
  if (!points || points.length < 2) {
    return `<span style="color:var(--muted); font-size:0.8rem">poca storia</span>`;
  }

  const values = points.map((p) => p[valueKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;

  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((p[valueKey] - min) / span) * (height - pad * 2);
    return [x, y];
  });

  const mainPath = xy.slice(0, -1).map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const [lastFromX, lastFromY] = xy[xy.length - 2];
  const [lastX, lastY] = xy[xy.length - 1];

  const first = points[0];
  const last = points[points.length - 1];
  const title = `${formatDate(first.d)} → ${formatDate(last.d)}: ${first[valueKey]}${suffix} → ${last[valueKey]}${suffix}`
    .replace(/[<>&]/g, '');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
      <title>${title}</title>
      <path d="${mainPath}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.6" />
      <path d="M${lastFromX},${lastFromY} L${lastX},${lastY}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX}" cy="${lastY}" r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5" />
    </svg>
  `;
}

// isFavorite (opzionale): le righe preferite restano sempre in cima, prima
// di applicare l'ordinamento scelto — così le ★ si vedono senza dover
// filtrare "solo preferiti" né perderle cambiando colonna di ordinamento.
export function makeSortableTable({ tableId, tbodyId, getRows, renderRow, defaultKey, defaultDesc = true, isFavorite }) {
  let sortKey = defaultKey;
  let sortDesc = defaultDesc;

  function render() {
    const tbody = document.getElementById(tbodyId);
    const rows = getRows();
    const sorted = [...rows].sort((a, b) => {
      if (isFavorite) {
        const af = isFavorite(a) ? 1 : 0;
        const bf = isFavorite(b) ? 1 : 0;
        if (af !== bf) return bf - af;
      }
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDesc ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
    tbody.innerHTML = sorted.map(renderRow).join('');
  }

  document.querySelectorAll(`#${tableId} th[data-key]`).forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDesc = !sortDesc;
      else { sortKey = key; sortDesc = true; }
      render();
    });
  });

  return { render };
}

// Gli interessi di un conto deposito sono tassati al 26% come qualunque
// rendita finanziaria (i titoli di Stato italiani hanno invece l'aliquota
// agevolata 12,5%, già applicata nella proiezione bond-per-bond): per
// confrontare in modo onesto va usato il netto, non il tasso lordo
// pubblicizzato dalla banca.
export function netDepositPct(grossPct, taxRate) {
  return Math.round(grossPct * (1 - taxRate) * 100) / 100;
}

const BENCHMARKS_STORAGE_KEY = 'stash:benchmarks';

// Overrides dei benchmark salvati dal viewer nel proprio browser: per
// comodità personale (stesso valore su Obbligazioni ed ETF), mai letti da
// Claude o condivisi — vedi la guida "browser storage" del progetto.
export function loadBenchmarkOverrides() {
  try {
    const raw = localStorage.getItem(BENCHMARKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBenchmarkOverrides(overrides) {
  try {
    localStorage.setItem(BENCHMARKS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage non disponibile (privata, quota piena...): l'override resta
    // comunque attivo per la sessione corrente, solo non sopravvive al reload.
  }
}

export function benchmarksLine(b) {
  const net = netDepositPct(b.deposit_account_gross_pct, b.deposit_tax_rate);
  return `Conto deposito: ${b.deposit_account_gross_pct}% lordo → ${net}% netto ` +
    `(tassazione ${Math.round(b.deposit_tax_rate * 100)}%)`;
}
