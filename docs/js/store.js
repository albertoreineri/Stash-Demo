// Salvataggio dei dati personali (preferiti, acquisti, diario) nel browser.
// Nessun backend: tutto in localStorage, con esporta/importa JSON dalla
// pagina Diario per portarlo altrove o farlo leggere. Un'unica chiave così
// esportare e importare è un file solo.

const KEY = 'stash:data:v1';

function empty() {
  return { version: 1, favorites: { bonds: [], etfs: [] }, purchases: [], journal: [] };
}

export function normalizeData(input) {
  if (!input || typeof input !== 'object') return empty();
  const fav = input.favorites && typeof input.favorites === 'object' ? input.favorites : {};
  const strings = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  const objects = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object') : []);

  return {
    version: 1,
    favorites: { bonds: strings(fav.bonds), etfs: strings(fav.etfs) },
    purchases: objects(input.purchases),
    journal: objects(input.journal),
  };
}

const META_KEY = 'stash:sync:v1';

export function isEmptyData(data) {
  return (
    data.favorites.bonds.length === 0 &&
    data.favorites.etfs.length === 0 &&
    data.purchases.length === 0 &&
    data.journal.length === 0
  );
}

// Stato della sincronizzazione (sha della versione online, modifiche non
// ancora salvate...) tenuto a parte dai dati: non finisce negli export.
export function getSyncMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function setSyncMeta(patch) {
  const meta = { ...getSyncMeta(), ...patch };
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // niente storage: lo stato di sincronizzazione vale solo per questa sessione
  }
  return meta;
}

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('stash:changed'));
}

// Se localStorage non è disponibile (finestra privata, storage bloccato) i
// dati restano comunque per la sessione corrente, solo non sopravvivono al reload.
let memoryFallback = null;

export function loadData() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage non accessibile: si usa la copia in memoria della sessione
    return memoryFallback ? normalizeData(memoryFallback) : empty();
  }

  if (!raw) return empty();

  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return empty();
  }
}

// `dirty` segna che ci sono modifiche non ancora salvate online. `rev` cresce
// ad ogni modifica: serve a non cancellare per errore il segno "non salvato"
// se modifichi qualcosa mentre un salvataggio è ancora in corso.
export function saveData(data, { dirty = true } = {}) {
  memoryFallback = data;
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    ok = false;
  }
  if (dirty) setSyncMeta({ dirty: true, rev: (getSyncMeta().rev ?? 0) + 1 });
  notifyChanged();
  return ok;
}

export function mutate(fn) {
  const data = loadData();
  fn(data);
  saveData(data);
  return data;
}

export function getFavorites(kind) {
  return new Set(loadData().favorites[kind] ?? []);
}

export function toggleFavorite(kind, id) {
  let nowFavorite = false;
  mutate((data) => {
    const list = data.favorites[kind];
    const index = list.indexOf(id);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(id);
      nowFavorite = true;
    }
  });
  return nowFavorite;
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
