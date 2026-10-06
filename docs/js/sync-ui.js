// Indicatore di stato del salvataggio online, presente su ogni pagina
// (nella barra in alto) e, sul Diario, anche il pulsante "Salva".
// Stati: checking | unavailable | problem | synced | dirty | saving | conflict | error
// (problem = la funzione c'è ma non riesce a leggere il diario online: si mostra il motivo)

import { getSyncMeta } from './store.js';
import { pullIfClean, saveRemote, reloadFromRemote } from './sync.js';
import { esc } from './shared.js';

let status = 'checking';
let errorText = '';
let onDataChanged = null;
let pill = null;

function syncedAtLabel() {
  const at = getSyncMeta().syncedAt;
  return at ? new Date(at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function render() {
  if (pill) {
    const html = {
      checking: '<span>Sincronizzazione…</span>',
      unavailable: '',
      problem: `<span title="${esc(errorText)}">⚠ Salvataggio online non funziona</span><button type="button" data-sync="retry">Riprova</button>`,
      synced: `<span title="Ultimo aggiornamento: ${esc(syncedAtLabel())}">✓ Sincronizzato</span>`,
      dirty: '<button type="button" data-sync="save">● Non salvato · Salva</button>',
      saving: '<span>Salvataggio…</span>',
      conflict:
        '<span>⚠ Aggiornato altrove</span>' +
        '<button type="button" class="danger" data-sync="keep">Tieni le mie</button>' +
        '<button type="button" data-sync="reload">Usa online</button>',
      error: `<span>Errore: ${esc(errorText)}</span><button type="button" data-sync="save">Riprova</button>`,
    }[status];
    pill.innerHTML = html;
  }

  // Elementi facoltativi della pagina Diario
  const saveButton = document.getElementById('btn-save');
  if (saveButton) {
    saveButton.hidden = status === 'unavailable';
    saveButton.disabled = ['saving', 'checking', 'synced', 'problem'].includes(status);
  }

  const detail = document.getElementById('sync-detail');
  if (detail) {
    const when = syncedAtLabel();
    detail.textContent = {
      checking: 'Controllo la versione online…',
      unavailable: 'Salvataggio online non attivo: i dati stanno solo in questo browser (vedi README per attivarlo).',
      synced: `Salvato online${when ? ` · ${when}` : ''}`,
      dirty: 'Modifiche non ancora salvate online.',
      problem: `Non riesco a leggere il diario online: ${errorText}. Quello che vedi qui è solo la copia di questo browser.`,
      saving: 'Salvataggio in corso…',
      conflict: 'Il diario online è stato modificato da un altro dispositivo: scegli quale versione tenere (in alto).',
      error: `Salvataggio non riuscito (${errorText}).`,
    }[status];
  }
}

function statusFromMeta() {
  return getSyncMeta().dirty ? 'dirty' : 'synced';
}

async function check() {
  if (status === 'saving') return;

  const result = await pullIfClean();
  if (result.status === 'unavailable') status = 'unavailable';
  else if (result.status === 'problem') {
    status = 'problem';
    errorText = result.error;
  }
  else if (result.status === 'conflict') status = 'conflict';
  else if (result.status === 'dirty') status = 'dirty';
  else {
    status = 'synced';
    if (result.status === 'updated' && onDataChanged) onDataChanged();
  }
  render();
}

export async function saveNow({ force = false } = {}) {
  if (status === 'saving' || status === 'unavailable' || status === 'problem') return;

  status = 'saving';
  render();

  const result = await saveRemote({ force });
  if (result.ok) {
    status = statusFromMeta();
  } else if (result.conflict) {
    status = 'conflict';
  } else {
    status = 'error';
    errorText = result.error ?? 'sconosciuto';
  }
  render();
}

async function act(name) {
  if (name === 'retry') {
    status = 'checking';
    render();
    await check();
  } else if (name === 'save') {
    await saveNow();
  } else if (name === 'keep') {
    if (confirm('Sovrascrivere la versione online con quella di questo browser? Le modifiche fatte altrove andranno perse.')) {
      await saveNow({ force: true });
    }
  } else if (name === 'reload') {
    if (confirm('Scartare le modifiche di questo browser e usare la versione online?')) {
      const result = await reloadFromRemote();
      if (result.ok) {
        status = 'synced';
        if (onDataChanged) onDataChanged();
      }
      render();
    }
  }
}

export function initSyncUi(options = {}) {
  onDataChanged = options.onDataChanged ?? null;
  pill = document.getElementById('sync-status');

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-sync]');
    if (el) act(el.dataset.sync);
  });

  // Ogni modifica (una ☆, un acquisto, una voce) segna "non salvato".
  window.addEventListener('stash:changed', () => {
    if (['saving', 'unavailable', 'problem', 'checking', 'conflict'].includes(status)) return;
    if (getSyncMeta().dirty) status = 'dirty';
    render();
  });

  // Tornando sulla scheda (o dal telefono) controlla se online c'è di nuovo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });

  render();
  check();
}
