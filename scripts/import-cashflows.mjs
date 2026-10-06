// Scarica il piano cashflow (base nominale 10.000€, calcolato dalla fonte
// per ogni titolo) pubblicato su simpletoolsforinvestors.eu — file .zip,
// quindi passa da fetchCsvText che lo estrae. Raggruppa per ISIN e tiene
// solo i titoli presenti nell'ultimo snapshot bonds.json (limita la
// dimensione a quello che serve davvero). Scarta gli eventi "Taxes": non
// servono a projectGross/applyItalianTax (lib/bondProjector.mjs), che
// applica una propria tassazione italiana invece di quella della fonte.
//
// Sovrascritto per intero ad ogni run (a differenza dello storico
// bond/ETF): non è una serie temporale, è un piano contrattuale — l'unica
// parte che cambia ogni giorno è la data di regolamento (T+1), il resto
// resta stabile finché il titolo non viene modificato dalla fonte.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { fetchCsvText } from '../lib/fetchDocument.mjs';
import { parseCsvRows, parseCsvDate, parseCsvFloat } from '../lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const BONDS_PATH = path.join(DATA_DIR, 'bonds.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'bond-cashflows.json');

export async function importCashflows() {
  const { url, text } = await fetchCsvText('Cashflow');
  const bondsSnapshot = JSON.parse(await readFile(BONDS_PATH, 'utf8'));
  const knownIsins = new Set(bondsSnapshot.bonds.map((b) => b.isin_code));

  const rows = parseCsvRows(text).slice(1);
  const byIsin = {};
  let kept = 0;
  let skipped = 0;

  for (const row of rows) {
    const isin = row[1]?.trim();
    const eventType = row[3] ?? '';
    const eventDate = parseCsvDate(row[5]);
    const amount = parseCsvFloat(row[6]);

    if (!isin || !knownIsins.has(isin) || eventType === 'Taxes' || !eventDate || amount === null) {
      skipped++;
      continue;
    }

    byIsin[isin] ??= [];
    byIsin[isin].push({ t: eventType, d: row[4] ?? '', dt: eventDate, a: amount });
    kept++;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(byIsin));

  return { url, isins: Object.keys(byIsin).length, events: kept, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await importCashflows();
  console.log(
    `Cashflow importati per ${result.isins} titoli (${result.events} eventi, ${result.skipped} scartati) da ${result.url}`
  );
}
