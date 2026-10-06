// Guida di ogni pagina: un pulsante "Guida" nella barra in alto apre una
// finestra con sezioni a fisarmonica. La prima volta che si entra in una
// pagina si apre da sola; poi resta solo il pulsante.

const STORAGE_PREFIX = 'stash:guida-vista:';

const GUIDES = {
  bonds: {
    title: 'Obbligazioni',
    intro: 'Confronta i titoli di Stato italiani (BOT e BTP) su quanto ti resta in tasca dopo tasse e costi, per la scadenza e l\'importo che scegli tu.',
    sections: [
      { title: 'Come leggere la tabella', body: '<p><b>Netto ann. %</b> è il rendimento annuo dopo la tassa. <b>Guadagno netto €</b> è il guadagno totale sull\'importo scelto. <b>vs benchmark</b> confronta il rendimento con l\'inflazione e con un conto deposito, entrambi netti. Clicca un\'intestazione per ordinare la tabella.</p>' },
      { title: 'Filtri', body: '<p>Scadenza (in anni), paese, valuta, rischio massimo, rendimento minimo e importo. I campi in alto con inflazione e conto deposito sono i riferimenti per il confronto: puoi cambiarli, la modifica resta nel tuo browser.</p>' },
      { title: 'Preferiti (☆)', body: '<p>Metti la stellina ai titoli che vuoi tenere d\'occhio: restano in cima alla tabella e li ritrovi nel Diario, nella sezione Osservati.</p>' },
      { title: 'Il pulsante "i"', body: '<p>Apre il dettaglio del titolo: prezzo, cedole, rimborso a scadenza, tassa e guadagno netto. Se il titolo non ha un piano di cedole, il dettaglio lo dice e mostra solo una stima.</p>' },
      { title: 'Tasse e proiezioni', body: '<p>Le proiezioni usano il piano di cedole della fonte, calcolato su 10.000 € nominali e riportato al tuo importo. La tassa è del 12,5% sui titoli di Stato italiani e del 26% sugli altri.</p>' },
    ],
  },
  etf: {
    title: 'ETF',
    intro: 'Confronta gli ETF di una watchlist proiettando il loro rendimento passato su un numero di anni a tua scelta.',
    sections: [
      { title: 'Cosa significa la proiezione', body: '<p>La proiezione prende il rendimento storico dell\'ETF e lo capitalizza sugli anni scelti. <b>Non è una previsione</b>: il passato non garantisce il futuro, e un rendimento alto può voler dire anche più rischio.</p>' },
      { title: 'Base del rendimento', body: '<p>Puoi scegliere l\'ultimo anno oppure la media annua degli ultimi 3 o 5 anni. Le medie di più anni sono più stabili; l\'ultimo anno reagisce di più ai movimenti recenti.</p>' },
      { title: 'Tasse', body: '<p>La tassa è semplificata al 26% sul guadagno lordo, anche per i fondi che hanno titoli di Stato (che avrebbero il 12,5%). I dividendi sono sommati, non reinvestiti.</p>' },
      { title: 'Aggiungere un ETF', body: '<p>Il sito è una pagina statica: non può leggere da solo i dati di un ETF nuovo, perché Yahoo Finance non è accessibile dal browser. Il pulsante <b>Aggiungi ETF</b> ti prepara la riga da inserire in <code>config/etf-watchlist.json</code>, con i comandi per aggiornare i dati.</p>' },
    ],
  },
  diario: {
    title: 'Diario',
    intro: 'Tieni traccia di cosa hai comprato, di quanto vale oggi e di cosa hai scritto strada facendo. Tutto resta nel browser che usi.',
    sections: [
      { title: 'Osservati', body: '<p>I titoli con la stellina nelle pagine Obbligazioni ed ETF. <b>Dettagli</b> apre la scheda con l\'importo modificabile, per vedere subito cosa cambia.</p>' },
      { title: 'Acquisti', body: '<p>Per BOT, BTP, ETF e fondi con un ISIN il valore si aggiorna da solo. Per i conti deposito con tasso lordo e scadenza il valore è capitale più interessi netti maturati fino a oggi. Per il resto inserisci tu il valore attuale.</p>' },
      { title: 'Broker e garanzie', body: '<p>Ogni acquisto ha un broker: puoi filtrare la tabella cliccando un\'etichetta. "Capitale garantito" è un\'etichetta che segni tu, non viene verificata dal sito.</p>' },
      { title: 'Ordinamento', body: '<p>Di default gli acquisti sono in ordine di scadenza, dalla più vicina. Gli strumenti senza scadenza finiscono in fondo. Clicca un\'intestazione per cambiare ordine.</p>' },
      { title: 'Voci di riflessione', body: '<p>Scrivi perché hai fatto una scelta, cosa ti preoccupa, cosa vuoi rileggere. Il testo accetta <b>grassetto</b>, <i>corsivo</i>, sottolineato ed elenchi dalla barra degli strumenti.</p>' },
      { title: 'Dove stanno i dati', body: '<p>Nel browser. Per il backup usa <b>Esporta JSON</b>, per riprendere <b>Importa JSON</b>. Il salvataggio online non è incluso in questa versione.</p>' },
    ],
  },
};

function guideHtml(guide) {
  const sections = guide.sections
    .map((s) => `<details class="guide-section"${s === guide.sections[0] ? ' open' : ''}><summary>${s.title}</summary>${s.body}</details>`)
    .join('');
  return `
    <div class="modal-head">
      <div class="modal-title">Guida · ${guide.title}</div>
      <button type="button" class="modal-close" data-guide-close aria-label="Chiudi">✕</button>
    </div>
    <p class="guide-intro">${guide.intro}</p>
    ${sections}
    <p class="modal-note">Questa guida si apre da sola la prima volta. Il pulsante "Guida" nella barra in alto la riapre quando vuoi.</p>`;
}

function markSeen(pageKey) {
  try { localStorage.setItem(STORAGE_PREFIX + pageKey, '1'); } catch { /* storage non disponibile: la guida si riapre */ }
}

function wasSeen(pageKey) {
  try { return localStorage.getItem(STORAGE_PREFIX + pageKey) === '1'; } catch { return false; }
}

export function initGuide(pageKey) {
  const guide = GUIDES[pageKey];
  const nav = document.querySelector('.topnav .nav-links');
  if (!guide || !nav) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guide-overlay';
  overlay.innerHTML = '<div class="modal-panel wide" id="guide-panel"></div>';
  document.body.appendChild(overlay);
  const panel = overlay.querySelector('#guide-panel');

  const close = () => {
    overlay.classList.remove('open');
    markSeen(pageKey);
  };
  const open = () => {
    panel.innerHTML = guideHtml(guide);
    overlay.classList.add('open');
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-guide';
  button.textContent = 'Guida';
  button.addEventListener('click', open);
  nav.appendChild(button);

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || ev.target.closest('[data-guide-close]')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  if (!wasSeen(pageKey)) open();
}
