export async function handler(event) {
  try {
    const { to, subject, html } = JSON.parse(event.body || '{}');
    if (!subject || !html) return { statusCode: 400, body: 'Missing fields' };

    // przyjmij 1 adres lub tablicę; 'THERAPIST' zamień na env
    const input = Array.isArray(to) ? to : [to].filter(Boolean);
    const recipients = (input.length ? input : ['THERAPIST'])
      .map(a => a === 'THERAPIST' ? process.env.THERAPIST_EMAIL : a)
      .filter(Boolean);

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
    if (!r.ok) return { statusCode: r.status, body: await r.text() };
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}
