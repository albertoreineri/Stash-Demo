// Mini rich text per le voci del diario. Il testo resta testo semplice nel JSON
// (leggibile anche da chi apre il file), con una sintassi minima:
//   **grassetto**   *corsivo*   __sottolineato__
//   - elenco puntato        1. elenco numerato
// Si visualizza dopo aver escapato tutto: nessun HTML scritto dall'utente
// (o importato da un JSON) può arrivare alla pagina.

import { esc } from './shared.js';

const BULLET = /^\s*[-•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function inline(escaped) {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<u>$1</u>')
    .replace(/\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g, '<em>$1</em>');
}

export function renderRich(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null; // { tag, items[] }

  const flush = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    const item = bullet ?? numbered;

    if (item) {
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flush();
      list ??= { tag, items: [] };
      list.items.push(inline(esc(item[1])));
    } else {
      flush();
      out.push(line.trim() ? `<p>${inline(esc(line))}</p>` : '<p class="rt-gap"></p>');
    }
  }
  flush();
  return out.join('');
}

// ---------- editing (funzioni pure: testo + selezione -> testo + selezione) ----------

/** Racchiude la selezione in un marcatore; se è già racchiusa, lo toglie. */
export function toggleWrap(value, start, end, marker) {
  const len = marker.length;
  const selected = value.slice(start, end);

  // marcatori appena fuori dalla selezione
  if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
    return {
      value: value.slice(0, start - len) + selected + value.slice(end + len),
      start: start - len,
      end: end - len,
    };
  }
  // marcatori dentro la selezione
  if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    start: start + len,
    end: end + len,
  };
}

/** Trasforma le righe toccate dalla selezione in elenco (o le riporta a testo). */
export function toggleList(value, start, end, kind) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n');

  const pattern = kind === 'ol' ? NUMBERED : BULLET;
  const allInList = lines.every((l) => pattern.test(l));
  const plain = (l) => (BULLET.exec(l) ?? NUMBERED.exec(l))?.[1] ?? l;

  let n = 0;
  const next = lines.map((l) => {
    if (allInList) return plain(l);
    if (!l.trim()) return l;
    return kind === 'ol' ? `${++n}. ${plain(l)}` : `- ${plain(l)}`;
  });
  const replaced = next.join('\n');
  return { value: value.slice(0, from) + replaced + value.slice(to), start: from, end: from + replaced.length };
}

/** Invio dentro un elenco: continua l'elenco; su voce vuota lo chiude. */
export function continueList(value, pos) {
  const from = value.lastIndexOf('\n', pos - 1) + 1;
  const line = value.slice(from, pos);
  const bullet = line.match(BULLET);
  const numbered = bullet ? null : line.match(NUMBERED);
  const match = bullet ?? numbered;
  if (!match) return null;

  if (!match[1].trim()) {
    // voce vuota: toglie il marcatore e chiude l'elenco
    return { value: value.slice(0, from) + value.slice(pos), start: from, end: from };
  }
  const marker = bullet ? '- ' : `${parseInt(line, 10) + 1}. `;
  const insert = `\n${marker}`;
  const at = pos + insert.length;
  return { value: value.slice(0, pos) + insert + value.slice(pos), start: at, end: at };
}

// ---------- barra degli strumenti ----------

export function toolbarHtml() {
  return `
    <div class="rt-toolbar" role="toolbar" aria-label="Formattazione">
      <button type="button" data-rt="bold" title="Grassetto (Ctrl/⌘+B)"><b>B</b></button>
      <button type="button" data-rt="italic" title="Corsivo (Ctrl/⌘+I)"><i>I</i></button>
      <button type="button" data-rt="underline" title="Sottolineato (Ctrl/⌘+U)"><u>U</u></button>
      <button type="button" data-rt="ul" title="Elenco puntato">• Elenco</button>
      <button type="button" data-rt="ol" title="Elenco numerato">1. Elenco</button>
    </div>`;
}

export function attachEditor(textarea, toolbar) {
  const apply = (result) => {
    if (!result) return;
    textarea.value = result.value;
    textarea.setSelectionRange(result.start, result.end);
    textarea.focus();
  };

  const run = (action) => {
    const { value, selectionStart: s, selectionEnd: e } = textarea;
    if (action === 'bold') apply(toggleWrap(value, s, e, '**'));
    else if (action === 'italic') apply(toggleWrap(value, s, e, '*'));
    else if (action === 'underline') apply(toggleWrap(value, s, e, '__'));
    else if (action === 'ul' || action === 'ol') apply(toggleList(value, s, e, action));
  };

  // mousedown: il click sul bottone non deve togliere il focus (e la selezione) al testo
  toolbar.addEventListener('mousedown', (ev) => {
    if (ev.target.closest('[data-rt]')) ev.preventDefault();
  });
  toolbar.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-rt]');
    if (button) run(button.dataset.rt);
  });

  textarea.addEventListener('keydown', (ev) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && !ev.shiftKey && !ev.altKey) {
      const action = { b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()];
      if (action) {
        ev.preventDefault();
        run(action);
        return;
      }
    }
    if (ev.key === 'Enter' && !ev.shiftKey && !mod && textarea.selectionStart === textarea.selectionEnd) {
      const result = continueList(textarea.value, textarea.selectionStart);
      if (result) {
        ev.preventDefault();
        apply(result);
      }
    }
  });
}
