// Porting di App\Services\YahooFinanceClient (Laravel). API non ufficiali di
// Yahoo Finance: "chart" (storico prezzi) è aperto, "quoteSummary" (TER,
// holdings, dividend yield...) richiede un token anti-CSRF ("crumb") ottenuto
// con un cookie di sessione. Yahoo ha reso questo flusso più restrittivo più
// volte: può rompersi senza preavviso — se fallisce, quoteSummary torna
// `null` invece di lanciare, così l'import continua con prezzo e metriche
// (già validi) anche senza i dati fondo.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export async function chart(ticker, range = '5y', interval = '1d') {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set('range', range);
  url.searchParams.set('interval', interval);

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) return null;

  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) return null;

  return {
    meta: result.meta ?? {},
    timestamps: result.timestamp ?? [],
    quotes: result.indicators?.quote?.[0] ?? {},
  };
}

function collectCookies(response, jar) {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const line of setCookie) {
    const pair = line.split(';')[0];
    const [name] = pair.split('=');
    jar.set(name, pair);
  }
}

function cookieHeader(jar) {
  return [...jar.values()].join('; ');
}

async function getCrumb() {
  const jar = new Map();

  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT } });
  collectCookies(seed, jar);

  const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookieHeader(jar) },
  });
  collectCookies(crumbResponse, jar);

  if (!crumbResponse.ok) return null;

  const crumb = (await crumbResponse.text()).trim();
  if (!crumb || crumb.includes('error')) return null;

  return { crumb, cookie: cookieHeader(jar) };
}

export async function quoteSummary(ticker, modules) {
  const auth = await getCrumb();
  if (!auth) return null;

  const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`);
  url.searchParams.set('modules', modules.join(','));
  url.searchParams.set('crumb', auth.crumb);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Cookie: auth.cookie },
  });
  if (!response.ok) return null;

  const body = await response.json();
  return body?.quoteSummary?.result?.[0] ?? null;
}
