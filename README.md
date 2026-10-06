# Stash

Strumento personale per guardare obbligazioni di Stato italiane, ETF, fondi e
conti deposito, e tenere un diario delle proprie decisioni. Gira nel browser:
non c'è un account, non c'è un server, e i tuoi dati restano sul tuo computer.

> **Non è consulenza finanziaria.** Mostra dati pubblici e calcoli semplici
> (rendimenti, tasse, proiezioni storiche). Le decisioni sono tue.

## Cosa c'è

- **Obbligazioni:** tutti i BTP, BOT e titoli di Stato italiani con prezzo,
  rendimento netto annualizzato, rischio e proiezione su un importo a tua scelta
  (tassa 12,5% sui titoli di Stato italiani, 26% sugli altri).
- **ETF:** una watchlist con rendimento storico, volatilità e proiezione netta.
- **Fondi e certificati:** prezzi da schede pubbliche, se li inserisci nella
  configurazione.
- **Diario:** preferiti, acquisti (con valore calcolato dai dati pubblici o
  inserito a mano), voci di riflessione. Tutto in `localStorage` del browser,
  con esporta/importa JSON.
- **Conti deposito:** valore calcolato da tasso lordo e scadenza, tassa 26%.

## Avvio in locale

Serve Node.js 20 o superiore per aggiornare i dati. Per guardare il sito basta
un server statico, perché il browser non legge i file JSON aprendo la pagina
direttamente dal disco.

```bash
git clone https://github.com/albertoreineri/Stash-Demo.git
cd Stash-Demo
python3 -m http.server -d docs 8000
```

Poi apri `http://localhost:8000`. Il Diario parte vuoto: puoi importare
`examples/diario-esempio.json` con il pulsante "Importa JSON" per vedere come
funziona, poi sostituire i dati di esempio con i tuoi.

## Aggiornare i dati

I file in `docs/data/` sono una fotografia già pronta. Per aggiornarli:

```bash
npm install
npm run import:bonds && npm run import:cashflows && npm run screen
npm run import:etf && npm run screen:etf
npm run import:funds
```

Le fonti sono pubbliche ma non ufficiali: il sito di Borsa Italiana, le
schede Borsa Italiana dei fondi e dei certificati, la piattaforma di
simpletoolsforinvestors.eu per l'elenco dei titoli di Stato, e Yahoo Finance per
gli ETF. Possono cambiare struttura senza preavviso: se un import fallisce, lo
script lo segnala nel terminale.

Gli script `notify*` mandano messaggi Telegram o email. Servono chiavi personali
(vedi i commenti in `lib/telegram.mjs` e `lib/email.mjs`) e non sono necessari
per usare il sito.

## Pubblicarlo online (facoltativo)

Il sito è una cartella statica (`docs/`): si può pubblicare su GitHub Pages o su
Cloudflare Pages senza modifiche. In questo caso va messo un muro di accesso
davanti al sito, perché i dati del diario, se sincronizzati, sono personali.

Il salvataggio online del diario non è incluso in questa versione: il diario
funziona in locale con esporta/importa JSON.

## Struttura

- `docs/`: il sito (HTML, CSS, JavaScript senza build).
- `docs/data/`: i dati pubblici generati dagli script.
- `lib/`: parsing, calcoli e chiamate alle fonti.
- `scripts/`: gli import e lo screening.
- `config/`: la watchlist ETF, i fondi da seguire e i benchmark.
- `examples/`: un diario di esempio con dati fittizi.

## Licenza

MIT, vedi `LICENSE`.
