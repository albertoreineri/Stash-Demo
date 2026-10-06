// Legge i prezzi di config/funds.json e scrive docs/data/funds.json.
// Un fondo che fallisce non blocca gli altri: finisce in `errors` e il Diario
// per quell'ISIN usa il valore inserito a mano.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFundSource } from '../lib/fundSources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'funds.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'funds.json');

export async function importFunds() {
  const sources = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const funds = [];
  const errors = [];

  for (const entry of sources) {
    try {
      const quote = await readFundSource(entry);
      funds.push({
        isin: entry.isin,
        name: entry.name,
        source: entry.source,
        ...quote,
      });
    } catch (err) {
      errors.push({ isin: entry.isin, name: entry.name, message: err.message });
    }
  }

  const snapshot = { imported_at: new Date().toISOString(), count: funds.length, funds, errors };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
  return snapshot;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const snapshot = await importFunds();
  console.log(`Fondi importati: ${snapshot.count}/${snapshot.count + snapshot.errors.length}`);
  for (const f of snapshot.funds) console.log(`  ${f.isin} ${f.name}: ${f.price} ${f.currency} (${f.date})`);
  for (const e of snapshot.errors) console.log(`  ERRORE ${e.isin}: ${e.message}`);
}
