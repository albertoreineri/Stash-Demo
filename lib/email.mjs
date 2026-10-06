// Notifica via email (Resend: https://resend.com — piano gratuito, nessuna
// verifica dominio necessaria se mandi solo al tuo indirizzo registrato,
// che è esattamente il nostro caso). Stesso pattern di lib/telegram.mjs:
// se il secret manca, non fallisce — logga e basta, così resta eseguibile
// in locale senza configurare nulla.

export async function sendEmail(subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO;
  const from = process.env.EMAIL_FROM || 'Stash <onboarding@resend.dev>';

  if (!apiKey || !to) {
    console.log('[email] RESEND_API_KEY/EMAIL_TO non configurati, invio saltato.');
    console.log(`[email] oggetto che sarebbe stato inviato: ${subject}`);
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Invio email fallito: ${JSON.stringify(body)}`);
  }

  return body;
}
