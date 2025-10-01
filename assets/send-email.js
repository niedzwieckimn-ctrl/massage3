async function sendEmail(subject, html) {
  const res = await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, html }),
  });
  if (!res.ok) throw new Error('Email HTTP ' + res.status + ' — ' + (await res.text()));
  return await res.json();
}
window.sendEmail = sendEmail;
