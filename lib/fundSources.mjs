// Prezzi di fondi comuni e certificati che non stanno nella watchlist ETF.
// Tre fonti, tutte pubbliche e senza login:
// - "borsa-fondo": scheda fondo Borsa Italiana (ultimo valore quota + precedente)
// - "borsa-certificato": scheda SeDeX Borsa Italiana (prezzo di riferimento ufficiale)
// - "yahoo": storico Yahoo (utile per i fondi Eurizon che Borsa non mostra)
// Ogni lettura torna un oggetto normalizzato o lancia un errore: chi chiama
// decide cosa fare del singolo fallimento (non blocca gli altri).

import { chart } from './yahoo.mjs';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// "157,07" -> 157.07 (formato italiano)
export function parseItalianNumber(text) {
  const n = Number(String(text).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "02/10/26" -> "2026-10-02"
export function parseItalianDate(text) {
  const m = String(text).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseBorsaFundPage(html) {
  const text = htmlToText(html);
  const m = text.match(/(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+(EUR|USD)\s+(\d{2}\/\d{2}\/\d{2})/);
  if (!m) throw new Error('valore quota non trovato nella pagina Borsa Italiana');
  return {
    price: parseItalianNumber(m[1]),
    previous_close: parseItalianNumber(m[2]),
    currency: m[3],
    date: parseItalianDate(m[4]),
  };
}

export function parseBorsaCertificatePage(html) {
  const text = htmlToText(html);
  const price = text.match(/Prezzo di riferimento\s+(\d[\d.]*,\d+)/);
  if (!price) throw new Error('prezzo di riferimento non trovato nella scheda SeDeX');
  const date = text.match(/Ultimo Contratto:\s*(\d{2}\/\d{2}\/\d{2})/);
  return {
    price: parseItalianNumber(price[1]),
    previous_close: null,
    currency: 'EUR',
    date: date ? parseItalianDate(date[1]) : null,
  };
}

async function fetchPage(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function readYahooFund(symbol) {
  const data = await chart(symbol, '5d', '1d');
  if (!data) throw new Error('nessun dato da Yahoo');
  const price = data.meta.regularMarketPrice ?? null;
  if (price === null) throw new Error('prezzo non disponibile su Yahoo');
  return {
    price,
    previous_close: data.meta.chartPreviousClose ?? null,
    currency: data.meta.currency ?? null,
    date: data.meta.regularMarketTime
      ? new Date(data.meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : null,
  };
}

// Dispatcher: una voce di config/funds.json -> prezzo normalizzato.
export async function readFundSource(entry) {
  if (entry.source === 'borsa-fondo') return parseBorsaFundPage(await fetchPage(entry.url));
  if (entry.source === 'borsa-certificato') return parseBorsaCertificatePage(await fetchPage(entry.url));
  if (entry.source === 'yahoo') return readYahooFund(entry.symbol);
  throw new Error(`fonte sconosciuta: ${entry.source}`);
}

function htmlToText(html) {
  const stripped = html.replace(/<script.*?<\/script>|<style.*?<\/style>/gs, '');
  const decoded = stripped
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\s+/g, ' ');
}
