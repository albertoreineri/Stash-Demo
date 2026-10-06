# Stash

Ho costruito Stash per guardare le obbligazioni di Stato italiane, gli ETF, i
fondi e i conti deposito, e per tenere un diario delle mie decisioni. Gira nel
browser: non c'è un account, non c'è un server, e i dati restano sul mio
computer (e sul tuo, se lo usi).

> **Non è consulenza finanziaria.** Mostra dati pubblici e calcoli semplici
> (rendimenti, tasse, proiezioni storiche). Le decisioni sono tue.

## Cosa c'è

- **Obbligazioni:** i BTP, i BOT e gli altri titoli di Stato italiani, con
  prezzo, rendimento netto annualizzato, rischio e proiezione su un importo a
  tua scelta. Io applico la tassa del 12,5% sui titoli di Stato italiani e del
  26% sugli altri.
- **ETF:** una watchlist con rendimento storico, volatilità e proiezione netta.
- **Fondi e certificati:** prezzi da schede pubbliche, se li inserisci nella
  configurazione.
- **Diario:** preferiti, acquisti (con il valore calcolato dai dati pubblici o
  inserito a mano) e voci di riflessione. Tutto è salvato nel `localStorage` del
  browser, con esportazione e importazione in JSON.
- **Conti deposito:** valore calcolato da tasso lordo e scadenza, con tassa al 26%.
- **Confronto con inflazione e conto deposito:** uso riferimenti pubblici
  (inflazione Eurostat per l'area euro, tasso sui depositi della BCE), che si
  aggiornano con `npm run update:benchmarks`. Puoi cambiarli nel sito.

Ogni pagina ha un pulsante **Guida** nella barra in alto: la prima volta si
apre da sola e spiega come leggere la pagina.

Per aggiungere un ETF che non è nella watchlist, nella pagina ETF c'è il
pulsante **Aggiungi ETF**: ti prepara la riga da inserire in
`config/etf-watchlist.json` e i comandi per aggiornare i dati. Il sito statico
non può farlo da solo, perché Yahoo Finance non risponde al browser.

## Requisiti

- **Node.js 20 o superiore** e npm: servono per installare le dipendenze e
  aggiornare i dati (`npm install`, `npm run ...`). Se vuoi solo guardare il
  sito con i dati già presenti, puoi farne a meno.
- **Un browser moderno** (Chrome, Firefox, Safari, Edge) per usare il sito.
- **Git**, per clonare il repository (oppure scaricalo come ZIP da GitHub).
- **Un server statico locale**, per aprire il sito. Basta uno di questi due
  comandi, non serve installare nient'altro:
  - Python 3, già presente su macOS e molte distribuzioni Linux:
    `python3 -m http.server -d docs 8000`
  - Node.js: `npx serve docs`
- **Connessione internet** solo per aggiornare i dati. Una volta aperto, il
  sito funziona anche offline.

Non serve un database, né un account, né una chiave API per il sito.

## Avvio in locale

Per guardare il sito basta un server statico, perché il browser non legge i
file JSON se apri la pagina direttamente dal disco.

```bash
git clone https://github.com/albertoreineri/Stash-Demo.git
cd Stash-Demo
python3 -m http.server -d docs 8000
```

Poi apri `http://localhost:8000`. Il Diario parte vuoto: per vedere come
funziona, importa `examples/diario-esempio.json` con il pulsante "Importa
JSON", poi sostituisci i dati di esempio con i tuoi.

## Aggiornare i dati

I file in `docs/data/` sono una fotografia già pronta. Per aggiornarli:

```bash
npm install
npm run import:bonds && npm run import:cashflows && npm run screen
npm run import:etf && npm run screen:etf
npm run import:funds
npm run update:benchmarks
```

Le fonti sono pubbliche ma non ufficiali: il sito di Borsa Italiana, le schede
Borsa Italiana dei fondi e dei certificati, la piattaforma di
simpletoolsforinvestors.eu per l'elenco dei titoli di Stato, e Yahoo Finance per
gli ETF. Possono cambiare struttura senza preavviso: se un import fallisce, lo
script lo segnala nel terminale.

Gli script `notify*` mandano messaggi Telegram o email. Servono chiavi personali
(vedi i commenti in `lib/telegram.mjs` e `lib/email.mjs`) e non sono necessari
per usare il sito.

### Automatizzare l'aggiornamento

Un sito statico non può lanciare comandi da solo. Per aggiornare i dati ogni
giorno senza farlo a mano, io uso GitHub Actions: un workflow pianificato che
esegue i comandi qui sopra e committa i file in `docs/data/`. Su un repository
pubblico è gratuito, e non richiede un server. Il file da creare è
`.github/workflows/update.yml`, con un `schedule` (cron) e i passi `npm ci`,
`npm run ...` e `git commit`.

Un bottone nel sito che lancia l'aggiornamento è possibile, ma richiede una
funzione sul server che avvia il workflow con un token GitHub. È un'opzione
avanzata, che io ho usato nella mia versione privata; non è inclusa qui.

## Pubblicarlo online (facoltativo)

Il sito è una cartella statica (`docs/`): si può pubblicare su GitHub Pages o su
Cloudflare Pages senza modifiche.

**Attenzione:** GitHub Pages è pubblico e non può chiedere una password. Va
bene per una versione dimostrativa senza dati tuoi. Se usi il sito con dati
reali, o se sincronizzi il diario online, consiglio di proteggerlo con
**Basic Auth** come minimo, perché sono dati sensibili e privati.

Su Cloudflare Pages si può fare: il sito chiede utente e password prima di
mostrare qualsiasi pagina. Questa protezione richiede una funzione di
middleware sul server, che questo progetto non include ancora. Se vuoi
saperne di più, scrivimi a **info@albertoreineri.it**: ne parlo lì.

Il salvataggio online del diario non è incluso in questa versione: il diario
funziona in locale con esportazione e importazione in JSON.

## Struttura

- `docs/`: il sito (HTML, CSS, JavaScript senza build).
- `docs/data/`: i dati pubblici generati dagli script.
- `lib/`: parsing, calcoli e chiamate alle fonti.
- `scripts/`: gli import, lo screening e l'aggiornamento dei riferimenti.
- `config/`: la watchlist ETF, i fondi da seguire e i riferimenti.
- `examples/`: un diario di esempio con dati fittizi.

## Licenza

MIT, vedi `LICENSE`.
