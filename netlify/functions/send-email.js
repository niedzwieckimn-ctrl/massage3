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

  const subject = `NOWA REZERWACJA: ${reservation.service || "Usługa"} — ${reservation.date || ""} ${reservation.time || ""}`;

  const html = `
    <h2>Nowa rezerwacja</h2>
    <p><b>Usługa:</b> ${reservation.service || "-"}</p>
    <p><b>Termin:</b> ${reservation.date || ""} ${reservation.time || ""}</p>
    <p><b>Klient:</b> ${reservation.client?.name || ""}</p>
    <p><b>Email klienta:</b> ${reservation.client?.email || ""}</p>
    <p><b>Telefon klienta:</b> ${reservation.client?.phone || ""}</p>
    <p><b>Adres klienta:</b> ${reservation.client?.address || ""}</p>
    ${reservation.notes ? `<p><b>Uwagi:</b> ${reservation.notes}</p>` : ""}
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
        to: [therapist], // zawsze masażystka z ENV
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
