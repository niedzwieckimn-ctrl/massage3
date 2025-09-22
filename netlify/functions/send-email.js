import { Resend } from 'resend';

export async function handler(event, context) {
  try {
    const { to, subject, html } = JSON.parse(event.body || '{}');

    if (!to || !subject || !html) {
      return { statusCode: 400, body: 'Missing fields' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const data = await resend.emails.send({
      from: process.env.FROM_EMAIL,          // np. "spa@twojadomena.pl"
      to: [to, process.env.THERAPIST_EMAIL], // klient + masażystka
      subject,
      html
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
