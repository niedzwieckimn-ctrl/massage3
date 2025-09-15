// netlify/functions/send-email.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL     = process.env.FROM_EMAIL;
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;

  if (!RESEND_API_KEY || !FROM_EMAIL || !ADMIN_EMAIL) {
    return { statusCode: 500, body: "Missing required environment variables" };
  }

  let mode, reservation;
  try {
    ({ mode, reservation } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!reservation) {
    return { statusCode: 400, body: "Missing reservation" };
  }

  const subjBase = `${reservation.service || "Usługa"} — ${reservation.date || ""} ${reservation.time || ""}`;

  const htmlTherapist = `
    <h2>${mode === "confirm" ? "Rezerwacja POTWIERDZONA" : "Nowa rezerwacja"}</h2>
    <p><b>Usługa:</b> ${reservation.service || "-"}</p>
    <p><b>Termin:</b> ${reservation.date || ""} ${reservation.time || ""}</p>
    <p><b>Klient:</b> ${reservation.client?.name || ""}</p>
    <p><b>Email klienta:</b> ${reservation.client?.email || ""}</p>
    <p><b>Telefon klienta:</b> ${reservation.client?.phone || ""}</p>
    <p><b>Adres klienta:</b> ${reservation.client?.address || ""}</p>
    ${reservation.notes ? `<p><b>Uwagi:</b> ${reservation.notes}</p>` : ""}
  `;

  const htmlClient = `
    <h2>Potwierdzenie wizyty</h2>
    <p>Cześć ${reservation.client?.name || ""},</p>
    <p>Twoja wizyta została potwierdzona:</p>
    <ul>
      <li><b>Usługa:</b> ${reservation.service || "-"}</li>
      <li><b>Termin:</b> ${reservation.date || ""} ${reservation.time || ""}</li>
    </ul>
  `;

  const messages = [];

  if (mode === "confirm") {
    if (!reservation.client?.email) {
      return { statusCode: 400, body: "Missing client email for confirm" };
    }

    // Do admina
    messages.push({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `POTWIERDZONO: ${subjBase}`,
      html: htmlTherapist,
    });

    // Do klienta
    messages.push({
      from: FROM_EMAIL,
      to: [reservation.client.email],
      subject: `Twoja wizyta potwierdzona: ${subjBase}`,
      html: htmlClient,
    });

  } else {
    // Rezerwacja -> tylko admin
    messages.push({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `NOWA REZERWACJA: ${subjBase}`,
      html: htmlTherapist,
    });
  }

  try {
    for (const msg of messages) {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(msg),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { statusCode: resp.status, body: errText };
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    return { statusCode: 500, body: `Send mail error: ${err.message}` };
  }
};
