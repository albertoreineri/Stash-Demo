// "Aggiungi ETF": il sito statico non può leggere i dati di un ETF nuovo
// (Yahoo non risponde al browser), quindi questo form prepara la riga per
// config/etf-watchlist.json e i comandi per aggiornare i dati. Non scrive
// niente da solo.

import { esc } from './shared.js';

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function formHtml() {
  return `
    <div class="modal-head">
      <div class="modal-title">Aggiungi un ETF</div>
      <button type="button" class="modal-close" data-add-close aria-label="Chiudi">✕</button>
    </div>
    <p class="guide-intro">Il sito non può scaricare da solo i dati di un ETF nuovo. Compila i campi: ti preparo la riga da inserire in <code>config/etf-watchlist.json</code>, poi lanci due comandi e il nuovo ETF compare nella tabella.</p>
    <form id="add-etf-form" class="form-grid" autocomplete="off">
      <label class="full">Nome<input name="nickname" required placeholder="Vanguard FTSE All-World (Acc)"></label>
      <label>ISIN<input name="isin" required maxlength="12" placeholder="IE00BK5BQT80" style="text-transform:uppercase"></label>
      <label>Ticker Yahoo<input name="ticker" required placeholder="VWCE.DE"><span class="form-help">Il simbolo con il suffisso della borsa (.DE, .MI, .L…). Lo trovi su finance.yahoo.com.</span></label>
      <div class="form-actions full">
        <button type="button" class="btn-secondary" data-add-close>Annulla</button>
        <button type="submit" class="btn-primary">Prepara la riga</button>
      </div>
    </form>
    <div id="add-etf-result" class="full" hidden></div>`;
}

function resultHtml(entry) {
  const line = JSON.stringify(entry);
  return `
    <p class="guide-intro">Aggiungi questa riga in <code>config/etf-watchlist.json</code>, prima dell'ultima <code>]</code>, mettendo una virgola sulla riga precedente:</p>
    <pre class="guide-code">${esc(line)}</pre>
    <p class="guide-intro">Poi, dalla cartella del progetto:</p>
    <pre class="guide-code">npm run import:etf &amp;&amp; npm run screen:etf</pre>
    <p class="modal-note">Se Yahoo non ha dati per quel simbolo, lo script lo segnala e l'ETF non compare. Ricontrolla il ticker su Yahoo Finance.</p>`;
}

export function initAddEtf(button) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-etf-overlay';
  overlay.innerHTML = '<div class="modal-panel wide" id="add-etf-panel"></div>';
  document.body.appendChild(overlay);
  const panel = overlay.querySelector('#add-etf-panel');

  const close = () => overlay.classList.remove('open');

  button.addEventListener('click', () => {
    panel.innerHTML = formHtml();
    overlay.classList.add('open');
    panel.querySelector('#add-etf-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const isin = String(fd.get('isin')).trim().toUpperCase();
      const ticker = String(fd.get('ticker')).trim();
      const nickname = String(fd.get('nickname')).trim();
      const result = panel.querySelector('#add-etf-result');

      if (!ISIN_RE.test(isin)) {
        result.hidden = false;
        result.innerHTML = '<p class="modal-note">L\'ISIN non sembra valido: 12 caratteri, es. IE00BK5BQT80.</p>';
        return;
      }
      if (!ticker) {
        result.hidden = false;
        result.innerHTML = '<p class="modal-note">Inserisci il ticker Yahoo.</p>';
        return;
      }
      result.hidden = false;
      result.innerHTML = resultHtml({ ticker, isin, nickname, active: true });
    });
  });

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || ev.target.closest('[data-add-close]')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && overlay.classList.contains('open')) close();
  });
}
