// netlify/functions/send-email.js
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const therapist = process.env.THERAPIST_EMAIL; // np. massage.n.spa@gmail.com
  if (!apiKey) return json({ error: 'Missing RESEND_API_KEY env var' }, 500);
  if (!therapist) return json({ error: 'Missing THERAPIST_EMAIL env var' }, 500);

  const { mode, reservation } = await request.json().catch(()=>({}));
  if (!mode || !reservation) return json({ error: 'Missing mode or reservation' }, 400);

  const subjectBase = `${reservation.service} — ${reservation.date} ${reservation.time}`;

  const htmlTherapist = `
    <h2>${mode === 'reserve' ? 'Nowa rezerwacja' : 'Rezerwacja POTWIERDZONA'}</h2>
    <p><b>Usługa:</b> ${reservation.service}</p>
    <p><b>Termin:</b> ${reservation.date} ${reservation.time}</p>
    <p><b>Klient:</b> ${reservation.client?.name || ''} (${reservation.client?.email || ''}${reservation.client?.phone ? ', ' + reservation.client.phone : ''})</p>
    ${reservation.notes ? `<p><b>Uwagi:</b> ${reservation.notes}</p>` : ''}
    ${reservation.price ? `<p><b>Cena:</b> ${reservation.price} zł</p>` : ''}
    ${reservation.id ? `<hr/><small>ID: ${reservation.id}</small>` : ''}
  `;

  const htmlClient = `
    <h2>Potwierdzenie wizyty</h2>
    <p>Cześć ${reservation.client?.name || ''},</p>
    <p>Potwierdzamy Twoją rezerwację:</p>
    <ul>
      <li><b>Usługa:</b> ${reservation.service}</li>
      <li><b>Termin:</b> ${reservation.date} ${reservation.time}</li>
      ${reservation.price ? `<li><b>Cena:</b> ${reservation.price} zł</li>` : ''}
    </ul>
    <p>Do zobaczenia!<br/>Massage & SPA</p>
    ${reservation.id ? `<hr/><small>ID: ${reservation.id}</small>` : ''}
  `;

  const payloads = [];
  if (mode === 'reserve') {
    payloads.push({ from, to: [therapist], subject: `NOWA REZERWACJA: ${subjectBase}`, html: htmlTherapist });
  } else if (mode === 'confirm') {
    if (!reservation.client?.email) return json({ error: 'Missing client email' }, 400);
    payloads.push({ from, to: [therapist], subject: `POTWIERDZONO: ${subjectBase}`, html: htmlTherapist });
    payloads.push({ from, to: [reservation.client.email], subject: `Twoja wizyta potwierdzona: ${subjectBase}`, html: htmlClient });
  } else {
    return json({ error: 'Unknown mode' }, 400);
  }

  for (const msg of payloads) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!resp.ok) {
      const data = await resp.text();
      return json({ ok: false, status: resp.status, data }, 502);
    }
  }
  return json({ ok: true }, 200);
};
