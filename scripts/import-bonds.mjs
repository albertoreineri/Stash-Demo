// Porting di ImportBondStats (Laravel): scarica il CSV "End of Day" da
// simpletoolsforinvestors.eu e produce data/bonds.json, uno snapshot pulito
// (un record per ISIN, quello più recente).
//
// A differenza della versione Laravel, una riga con dati non parsabili viene
// scartata (mai sostituita con oggi/0): vedi lib/csv.mjs.

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { fetchCsvText } from '../lib/fetchDocument.mjs';
import { parseCsvRows, parseCsvDate, parseCsvFloat } from '../lib/csv.mjs';
import { countryName } from '../lib/country.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'docs', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'bonds.json');

export async function importBonds() {
  const { url, text } = await fetchCsvText('End of Day');
  const rows = parseCsvRows(text).slice(1); // scarta l'header

  const bonds = new Map();
  let skipped = 0;

  for (const row of rows) {
    const isin = row[0]?.trim();
    const redemptionDate = parseCsvDate(row[2]);
    const referencedDate = parseCsvDate(row[11]);

    if (!isin || !redemptionDate || !referencedDate) {
      skipped++;
      continue;
    }

    bonds.set(isin, {
      isin_code: isin,
      description: row[1] ?? '',
      redemption_date: redemptionDate,
      currency_code: row[3] || null,
      issuer_code: row[4] || null,
      issuer_description: row[5] || null,
      country: countryName(isin),
      sp_rating: row[6] || null,
      moodys_rating: row[7] || null,
      fitch_rating: row[8] || null,
      minimum_lot: parseCsvFloat(row[9]),
      referenced_date: referencedDate,
      price: parseCsvFloat(row[13]),
      gross_ytm: parseCsvFloat(row[16]),
      gross_duration: parseCsvFloat(row[17]),
      net_ytm: parseCsvFloat(row[18]),
      current_coupon_rate: parseCsvFloat(row[23]),
      coupon_periodicity: row[24] || null,
      issue_price: parseCsvFloat(row[27]),
    });
  }

  const snapshot = {
    source_url: url,
    imported_at: new Date().toISOString(),
    count: bonds.size,
    skipped,
    bonds: [...bonds.values()],
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2));

  return snapshot;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshot = await importBonds();
  console.log(
    `Importati ${snapshot.count} titoli (${snapshot.skipped} righe scartate per dati non validi) da ${snapshot.source_url}`
  );
}
