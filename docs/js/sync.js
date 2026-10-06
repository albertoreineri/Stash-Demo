// Sincronizzazione del diario con il file JSON nel repo, tramite la funzione
// /api/diario (functions/api/diario.js). Il localStorage resta la copia di
// lavoro; "Salva" la manda online, aprendo una pagina si scarica quella
// online se qui non ci sono modifiche in sospeso.
//
// Se la funzione non c'è o non è configurata (sviluppo locale, secret non
// ancora impostati) tutto resta com'era: solo dati nel browser.

import { loadData, saveData, normalizeData, getSyncMeta, setSyncMeta, isEmptyData } from './store.js';

const ENDPOINT = '/api/diario';

// Codici d'errore della funzione -> testo comprensibile, per non lasciare
// "vuoto" o "non attivo" quando in realtà c'è un problema di configurazione.
const ERROR_TEXT = {
  repo_not_accessible: 'il token non vede il repo: controlla GITHUB_REPO e che il token abbia accesso a questo repo con Contents: lettura/scrittura',
  github_auth: 'token GitHub non valido o scaduto',
  github_error: 'GitHub ha risposto con un errore',
  invalid_json: 'il file del diario online non è un JSON valido',
  too_large: 'il diario è troppo grande',
};

export function describeError(code, status) {
  const text = ERROR_TEXT[code] ?? `errore (${code})`;
  return status ? `${text} [${status}]` : text;
}

/**
 * available: la funzione risponde e il diario è leggibile.
 * Altrimenti reason: "no_function" (non c'è: sviluppo locale, silenzioso),
 * "not_configured" (mancano i secret: silenzioso), oppure "problem" con
 * `error` = cosa non va (va mostrato: la funzione c'è ma non riesce a leggere).
 */
export async function fetchRemote() {
  try {
    const response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' }, cache: 'no-store' });

    // Cloudflare Pages risponde 200 con index.html a un percorso inesistente:
    // se non è JSON, la funzione non c'è.
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      return { available: false, reason: 'no_function' };
    }

    const body = await response.json();
    if (body.error === 'not_configured') return { available: false, reason: 'not_configured' };
    if (body.error) return { available: false, reason: 'problem', error: describeError(body.error, body.status) };
    if (!response.ok) return { available: false, reason: 'no_function' };
    return { available: true, data: body.data ?? null, sha: body.sha ?? null };
  } catch {
    return { available: false, reason: 'no_function' };
  }
}

function markSynced(sha) {
  setSyncMeta({ sha, dirty: false, syncedAt: new Date().toISOString() });
}

/**
 * All'apertura di una pagina: scarica la versione online se qui non ci sono
 * modifiche non salvate. Se ci sono, non le sovrascrive mai.
 * status: unavailable | synced | updated | dirty | conflict
 */
export async function pullIfClean() {
  const remote = await fetchRemote();
  if (!remote.available) {
    return remote.reason === 'problem'
      ? { status: 'problem', error: remote.error }
      : { status: 'unavailable' };
  }

  const meta = getSyncMeta();

  if (meta.dirty) {
    return { status: remote.sha !== (meta.sha ?? null) ? 'conflict' : 'dirty' };
  }

  if (remote.sha === null) {
    // Niente online ancora: se qui ci sono già dati (usati prima della
    // sincronizzazione) vanno salvati, non buttati.
    if (!isEmptyData(loadData())) {
      setSyncMeta({ dirty: true, sha: null });
      return { status: 'dirty' };
    }
    return { status: 'synced' };
  }

  if (remote.sha === meta.sha) return { status: 'synced' };

  saveData(normalizeData(remote.data), { dirty: false });
  markSynced(remote.sha);
  return { status: 'updated' };
}

/** Salva online. Con force ignora la versione online più recente (sovrascrive). */
export async function saveRemote({ force = false } = {}) {
  const meta = getSyncMeta();
  const revAtStart = meta.rev ?? 0;
  let sha = meta.sha ?? null;

  if (force) {
    const remote = await fetchRemote();
    if (!remote.available) return { ok: false, error: 'non raggiungibile' };
    sha = remote.sha;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: loadData(), sha }),
    });

    if (response.status === 409) return { ok: false, conflict: true };
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      return { ok: false, error: detail.error ? describeError(detail.error, detail.status) : `errore ${response.status}` };
    }

    const body = await response.json();
    // Se nel frattempo hai modificato ancora, resta "non salvato".
    const modifiedMeanwhile = (getSyncMeta().rev ?? 0) !== revAtStart;
    setSyncMeta({ sha: body.sha, dirty: modifiedMeanwhile, syncedAt: new Date().toISOString() });
    return { ok: true };
  } catch {
    return { ok: false, error: 'rete non raggiungibile' };
  }
}

/** Scarta le modifiche locali e usa la versione online. */
export async function reloadFromRemote() {
  const remote = await fetchRemote();
  if (!remote.available) return { ok: false };

  saveData(normalizeData(remote.data ?? {}), { dirty: false });
  markSynced(remote.sha);
  return { ok: true };
}
