// netlify/functions/send-email.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  const therapist = process.env.THERAPIST_EMAIL;

  let reservation;
  try {
    ({ reservation } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!reservation) {
    return { statusCode: 400, body: "Missing reservation" };
  }

  // === Temat maila ===
  const subject =
    `NOWA REZERWACJA #${reservation.id || ''} — ${reservation.service || 'Zabieg'} — ${reservation.date || ''} ${reservation.time || ''}`.trim();

  // helper do czyszczenia HTML-a
  const esc = (s = '') =>
    String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  // === Treść maila (kolejność 1–8) ===
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
      <h3 style="margin:0 0 16px">Nowa rezerwacja</h3>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;width:220px"><strong>Nr rezerwacji</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.id || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Imię i nazwisko</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.client?.name || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Adres</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.client?.address || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nr telefonu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.client?.phone || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email klienta</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.client?.email || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nazwa zabiegu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.service || '-')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Data i godzina</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.date || '-')} ${esc(reservation.time || '')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Uwagi</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${esc(reservation.notes || '-')}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [therapist], // zawsze do masażystki
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      return { statusCode: resp.status, body: await resp.text() };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return { statusCode: 500, body: "Error: " + err.message };
  }
};
