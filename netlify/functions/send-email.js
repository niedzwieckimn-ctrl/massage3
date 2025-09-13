// netlify/functions/send-email.js — Functions v2, czysto, bez NBSP
const CORS = {  'Access-Control-Allow-Origin': '*', // docelowo wpisz swoją domenę zamiast *  'Access-Control-Allow-Methods': 'POST,OPTIONS',  'Access-Control-Allow-Headers': 'Content-Type',};
function json(data, status = 200) {  return new Response(JSON.stringify(data), {    status,    headers: { 'Content-Type': 'application/json', ...CORS },  });}
export default async (request) => {  try {    // CORS preflight    if (request.method === 'OPTIONS') {      return new Response(null, { status: 204, headers: CORS });    }
    if (request.method !== 'POST') {      return json({ error: 'Method not allowed' }, 405);    }
    // bezpieczny odczyt JSON    let payload = {};    try {      payload = await request.json();    } catch {      return json({ error: 'Invalid JSON' }, 400);    }
    const { to, subject, html } = payload;    if (!to || !subject || !html) {      return json({ error: 'Missing fields: to, subject, html' }, 400);    }
    // env (działa i na Node, i na Deno w Functions v2)    const apiKey =      (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : null) ||      process.env.RESEND_API_KEY;
    const from =      (typeof Deno !== 'undefined' ? Deno.env.get('FROM_EMAIL') : null) ||      process.env.FROM_EMAIL ||      'onboarding@resend.dev';
    if (!apiKey) {      return json({ error: 'Missing RESEND_API_KEY env var' }, 500);    }
    // UWAGA: czysty URL, żadnych nawiasów/markdownu    const resp = await fetch('https://api.resend.com/emails', {      method: 'POST',      headers: {        'Authorization': `Bearer ${apiKey}`,        'Content-Type': 'application/json',      },      body: JSON.stringify({ from, to, subject, html }),    });
    const data = await resp.json().catch(() => ({}));    if (!resp.ok) {      return json({ ok: false, status: resp.status, data }, 502);    }
    return json({ ok: true, id: data?.id || null }, 200);  } catch (e) {    return json({ error: 'Server error', detail: String(e) }, 500);  }};