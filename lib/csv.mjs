// Parsing dei CSV pubblicati da simpletoolsforinvestors.eu (separatore ";",
// date in formato IT gg/mm/aaaa, numeri con virgola decimale).
//
// A differenza della vecchia versione Laravel, qui un valore non parsabile
// torna sempre `null` — mai una data/numero "finto" (oggi, 0) che poi
// inquinerebbe lo screening a valle.

export function parseCsvRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(';'));
}

export function parseCsvDate(value) {
  if (!value || typeof value !== 'string') return null;

  const parts = value.trim().split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts.map((p) => parseInt(p, 10));
  if (!day || !month || !year) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

export function parseCsvFloat(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;

  const clean = trimmed.replace(',', '.');
  const n = Number(clean);

  return Number.isFinite(n) ? n : null;
}
