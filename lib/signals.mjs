// Rilevazione di un semplice segnale "minimo locale": il prezzo di oggi è
// pari o sotto il minimo dei `window` giorni precedenti (non oggi
// compreso). Non è un consiglio d'investimento — solo un fatto sul
// prezzo, va letto insieme al resto (trend più lungo, motivo del calo)
// prima di decidere qualcosa.
//
// "Nuovo" minimo: notifica solo se ieri NON era già un minimo secondo la
// stessa definizione (il minimo dei giorni precedenti *a ieri*) — altrimenti
// un prezzo piatto sul fondo per una settimana manderebbe una mail al giorno.

function minClose(points) {
  return Math.min(...points.map((p) => p.c));
}

export function detectNewLocalLow(points, { window = 30 } = {}) {
  if (!points || points.length < window + 2) return null;

  const sorted = [...points].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const n = sorted.length;

  const today = sorted[n - 1];
  const yesterday = sorted[n - 2];

  const priorToToday = sorted.slice(Math.max(0, n - 1 - window), n - 1);
  const priorToYesterday = sorted.slice(Math.max(0, n - 2 - window), n - 2);

  if (priorToToday.length === 0 || priorToYesterday.length === 0) return null;

  // Confronto stretto (< non <=): un pareggio con il minimo precedente non
  // conta come "rottura" — su una serie con tratti piatti (prezzi identici
  // per più giorni), usare <= farebbe scattare falsi positivi o sopprimere
  // per errore un vero nuovo minimo (il valore piatto pareggia sempre se
  // stesso). Serve una rottura sotto il minimo, non un pareggio.
  const todayIsNewLow = today.c < minClose(priorToToday);
  if (!todayIsNewLow) return null;

  const yesterdayWasNewLow = yesterday.c < minClose(priorToYesterday);
  if (yesterdayWasNewLow) return null;

  const windowHigh = Math.max(today.c, ...priorToToday.map((p) => p.c));

  return {
    date: today.d,
    close: today.c,
    windowDays: window,
    windowHigh,
    drawdownPct: Math.round(((windowHigh - today.c) / windowHigh) * 100 * 100) / 100,
  };
}
