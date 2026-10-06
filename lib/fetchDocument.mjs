// Porting di App\Support\SimpleToolsDocumentFetcher (Laravel): i link dei
// CSV su simpletoolsforinvestors.eu cambiano hash ad ogni pubblicazione,
// quindi vanno individuati cercando il testo del link (es. "Dati End of
// Day"), non un URL fisso.
//
// Nota: la versione Laravel cercava il marker nel testo di una riga <tr>,
// ma il sito ora presenta questi link come card ("Data export"), non più
// come tabella — il testo del link stesso (es. "Dati End of Day") è già il
// marker, quindi si cerca direttamente lì. Verificato live il 2026-09-23.

import * as cheerio from 'cheerio';
import { unzipSync } from 'fflate';

const BASE_URL = 'https://www.simpletoolsforinvestors.eu/';
const PAGE_URL = 'https://www.simpletoolsforinvestors.eu/documentivari.php';

export async function findLinkForRow(rowMarker) {
  const response = await fetch(PAGE_URL);
  if (!response.ok) {
    throw new Error('Impossibile raggiungere la pagina documenti.');
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let relativeUrl = null;

  $('a[href]').each((_, link) => {
    if ($(link).text().includes(rowMarker)) {
      relativeUrl = $(link).attr('href');
    }
  });

  if (!relativeUrl) {
    throw new Error(`Impossibile trovare il link per "${rowMarker}".`);
  }

  return relativeUrl.startsWith('http')
    ? relativeUrl
    : new URL(relativeUrl, BASE_URL).toString();
}

export async function fetchCsvText(rowMarker) {
  const csvUrl = await findLinkForRow(rowMarker);
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(`Impossibile scaricare il file da ${csvUrl}`);
  }

  if (csvUrl.toLowerCase().endsWith('.zip')) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    const files = unzipSync(buffer);
    const names = Object.keys(files);

    if (names.length === 0) {
      throw new Error(`Lo zip scaricato da ${csvUrl} non contiene file.`);
    }

    return { url: csvUrl, text: Buffer.from(files[names[0]]).toString('utf8') };
  }

  return { url: csvUrl, text: await response.text() };
}
