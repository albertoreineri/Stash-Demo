// Storico compatto per-ISIN/ticker: un punto al giorno, accumulato ad ogni
// run (idempotente: rieseguire lo stesso giorno sovrascrive il punto di
// oggi invece di duplicarlo). Usato per gli sparkline e per calcolare un
// delta "rispetto a N giorni fa" senza dover ricalcolare tutto da zero.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function loadSeries(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveSeries(filePath, series) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(series));
}

/**
 * Aggiunge/aggiorna il punto di oggi per ogni id in `points`, poi rimuove
 * gli id non aggiornati da più di `staleDays` (usciti dal filtro corrente:
 * scaduti, o non più interessanti) e taglia ogni serie a `maxPoints`.
 *
 * @param series {object} mutato in place e ritornato
 * @param points {Map<string, object>} id -> valori di oggi (senza data)
 * @param date {string} YYYY-MM-DD
 */
export function upsertToday(series, points, date, { maxPoints = 400, staleDays = 90 } = {}) {
  for (const [id, values] of points) {
    const existing = series[id] ?? [];
    const withoutToday = existing.filter((p) => p.d !== date);
    withoutToday.push({ d: date, ...values });
    series[id] = withoutToday.slice(-maxPoints);
  }

  const staleBefore = new Date(date);
  staleBefore.setDate(staleBefore.getDate() - staleDays);
  const staleBeforeStr = staleBefore.toISOString().slice(0, 10);

  for (const id of Object.keys(series)) {
    const last = series[id][series[id].length - 1];
    if (!last || last.d < staleBeforeStr) {
      delete series[id];
    }
  }

  return series;
}

/** Serie -> punti recenti per lo sparkline (ultimi `n`), formato [{d, v}]. */
export function recentPoints(series, id, valueKey, n = 30) {
  const points = series[id] ?? [];
  return points.slice(-n).map((p) => ({ d: p.d, v: p[valueKey] }));
}

/** Delta tra il valore più recente e quello di ~`days` giorni fa (o il più vecchio disponibile). */
export function trendDelta(series, id, valueKey, days = 30) {
  const points = series[id] ?? [];
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const targetDate = new Date(latest.d);
  targetDate.setDate(targetDate.getDate() - days);
  const targetStr = targetDate.toISOString().slice(0, 10);

  const past = points.find((p) => p.d >= targetStr) ?? points[0];
  if (past === latest || past[valueKey] == null || latest[valueKey] == null) return null;

  return Math.round((latest[valueKey] - past[valueKey]) * 1000) / 1000;
}
