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

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const text = await request.text();
    let payload = {};
    try {
      payload = JSON.parse(text || '{}');
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { reservation } = payload;
    if (!reservation) return json({ error: 'Missing reservation' }, 400);

    // Dane z env
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const to = process.env.ADMIN_EMAIL; // adres masażystki/admina

    if (!apiKey || !to) return json({ error: 'Missing env vars (RESEND_API_KEY, ADMIN_EMAIL)' }, 500);

    // Temat wiadomości
    const subject = `NOWA REZERWACJA #${reservation.id || ''} — ${reservation.service || 'Zabieg'} — ${reservation.date || ''} ${reservation.time || ''}`.trim();

    // Treść wiadomości
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
        <h3 style="margin:0 0 16px">Nowa rezerwacja</h3>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <tbody>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;width:220px"><strong>Nr rezerwacji</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.id || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Imię i nazwisko</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.client?.name || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Adres</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.client?.address || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nr telefonu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.client?.phone || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email klienta</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.client?.email || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nazwa zabiegu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.service || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Data i godzina</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.date || '-'} ${reservation.time || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Uwagi</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${reservation.notes || '-'}</td></tr>
          </tbody>
        </table>
      </div>
    `;

    // Wysyłka przez Resend
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ ok: false, status: resp.status, data }, 502);

    return json({ ok: true, data }, 200);
  } catch (e) {
    return json({ error: 'Server error', detail: String(e) }, 500);
  }
};
