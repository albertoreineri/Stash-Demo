// Porting di App\Services\BondRiskScorer (Laravel): punteggio di rischio
// trasparente basato sui rating delle agenzie, scala comune 1 (minimo) - 22
// (default), per leggere insieme rendimento offerto e rischio che lo giustifica.

const SP_FITCH_SCALE = {
  'AAA': 1, 'AA+': 2, 'AA': 3, 'AA-': 4,
  'A+': 5, 'A': 6, 'A-': 7,
  'BBB+': 8, 'BBB': 9, 'BBB-': 10,
  'BB+': 11, 'BB': 12, 'BB-': 13,
  'B+': 14, 'B': 15, 'B-': 16,
  'CCC+': 17, 'CCC': 18, 'CCC-': 19,
  'CC': 20, 'C': 21, 'D': 22, 'RD': 22, 'SD': 22,
};

const MOODYS_SCALE = {
  'Aaa': 1, 'Aa1': 2, 'Aa2': 3, 'Aa3': 4,
  'A1': 5, 'A2': 6, 'A3': 7,
  'Baa1': 8, 'Baa2': 9, 'Baa3': 10,
  'Ba1': 11, 'Ba2': 12, 'Ba3': 13,
  'B1': 14, 'B2': 15, 'B3': 16,
  'Caa1': 17, 'Caa2': 18, 'Caa3': 19,
  'Ca': 20, 'C': 21,
};

// BBB-/Baa3 (notch 10) è la soglia standard tra investment grade e speculativo.
const INVESTMENT_GRADE_THRESHOLD = 10;

function notchFor(rating, scale) {
  const normalized = (rating ?? '').trim();
  if (normalized === '' || normalized === 'NR') return null;
  return scale[normalized] ?? null;
}

export function score(spRating, moodysRating, fitchRating) {
  const notches = [
    notchFor(spRating, SP_FITCH_SCALE),
    notchFor(moodysRating, MOODYS_SCALE),
    notchFor(fitchRating, SP_FITCH_SCALE),
  ].filter((n) => n !== null);

  if (notches.length === 0) return null;

  return Math.round(notches.reduce((a, b) => a + b, 0) / notches.length);
}

export function label(riskScore) {
  if (riskScore === null || riskScore === undefined) return 'Non disponibile';
  if (riskScore <= 4) return 'Rischio molto basso';
  if (riskScore <= INVESTMENT_GRADE_THRESHOLD) return 'Rischio basso (Investment Grade)';
  if (riskScore <= 13) return 'Rischio moderato';
  if (riskScore <= 16) return 'Rischio elevato';
  return 'Rischio molto elevato';
}

export function isInvestmentGrade(riskScore) {
  return riskScore !== null && riskScore !== undefined && riskScore <= INVESTMENT_GRADE_THRESHOLD;
}

export function yieldPerRisk(netYtm, riskScore) {
  if (netYtm === null || netYtm === undefined) return null;
  if (riskScore === null || riskScore === undefined || riskScore <= 0) return null;
  return Math.round((netYtm / riskScore) * 1000) / 1000;
}
