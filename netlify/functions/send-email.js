// netlify/functions/send-email.js  — tylko do masażystki (Resend, bez dodatkowych paczek)
export async function handler(event) {
  try {
    const { subject, html } = JSON.parse(event.body || '{}');

    if (!subject || !html) {
      return { statusCode: 400, body: 'Missing fields' };
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,          // nadawca z Twojej zweryfikowanej domeny
        to: process.env.THERAPIST_EMAIL,       // <-- tylko masażystka
        subject,
        html
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return { statusCode: r.status, body: text };
    }
    const data = await r.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}
window.sendemail = sendemail;