// Porting di App\Models\Concerns\HasCountryFromIsin: paese derivato dal
// prefisso ISIN (primi 2 caratteri, ISO 3166-1 alpha-2), con XS/EU come
// codici speciali per eurobond ed emittenti sovranazionali.

const COUNTRY_NAMES = {
  XS: 'Internazionale (Eurobond)',
  EU: 'Unione Europea',
  IT: 'Italia',
  DE: 'Germania',
  FR: 'Francia',
  ES: 'Spagna',
  US: 'Stati Uniti',
  GB: 'Regno Unito',
  BE: 'Belgio',
  AT: 'Austria',
  GR: 'Grecia',
  FI: 'Finlandia',
  NL: 'Paesi Bassi',
  PT: 'Portogallo',
  IE: 'Irlanda',
  AU: 'Australia',
  SI: 'Slovenia',
  NO: 'Norvegia',
  SE: 'Svezia',
  DK: 'Danimarca',
  CH: 'Svizzera',
  LU: 'Lussemburgo',
  PL: 'Polonia',
  RO: 'Romania',
  HU: 'Ungheria',
  CZ: 'Repubblica Ceca',
  CA: 'Canada',
  JP: 'Giappone',
  SK: 'Slovacchia',
  HR: 'Croazia',
  BG: 'Bulgaria',
  MT: 'Malta',
  CY: 'Cipro',
  EE: 'Estonia',
  LV: 'Lettonia',
  LT: 'Lituania',
};

export function countryPrefix(isin) {
  return isin ? isin.slice(0, 2).toUpperCase() : null;
}

export function countryName(isin) {
  const prefix = countryPrefix(isin);
  if (!prefix) return null;
  return COUNTRY_NAMES[prefix] ?? prefix;
}
