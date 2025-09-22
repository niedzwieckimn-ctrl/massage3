export async function handler(event) {
  try {
    const { to, subject, html } = JSON.parse(event.body || '{}');
    if (!subject || !html) {
      return { statusCode: 400, body: 'Missing fields' };
    }

    // pozwól podać 1 adres lub tablicę oraz specjalny znacznik 'THERAPIST'
    const input = Array.isArray(to) ? to : [to];
    const recipients = (input.filter(Boolean).map(a =>
      a === 'THERAPIST' ? process.env.THERAPIST_EMAIL : a
    )).filter(Boolean);

    // awaryjnie – jeśli nie podano 'to', wyślij przynajmniej do terapeuty
    if (!recipients.length) recipients.push(process.env.THERAPIST_EMAIL);

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: recipients,
        subject,
        html
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return { statusCode: r.status, body: text };
    }
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}
