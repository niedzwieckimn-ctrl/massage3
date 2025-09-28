/* app.js — Supabase-only, brak LocalStorage dla 'slots' */
/* Wklej zamiast obecnego pliku assets/app.js. */

function $(sel){ return document.querySelector(sel); }
const fmtHM = d => new Date(d).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});

/* ---------- Services (select) ---------- */
async function renderServicesSelect(){
  const sel = $('#service');
  if (!sel) return;
  sel.innerHTML = '<option value="">Wybierz zabieg</option>';
  if (!window.sb) return;
  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, active')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error || !Array.isArray(data)) { console.warn('[public] services error', error); return; }
  data.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} — ${Number(s.price||0).toFixed(2)} zł`;
    sel.appendChild(opt);
  });
}

/* ---------- Times from Supabase (no LS) ---------- */
async function fillTimesFromCloud(dateStr){
  const timeSel = $('#time');
  if (!timeSel) return;
  timeSel.innerHTML = '';
  timeSel.disabled = true;
  if (!dateStr) {
    const ph = document.createElement('option'); ph.value=''; ph.textContent='Najpierw wybierz datę'; ph.disabled=true; ph.selected=true;
    timeSel.appendChild(ph); return;
  }
  if (!window.sb) return;
  const fromISO = new Date(`${dateStr}T00:00:00`).toISOString();
  const toISO   = new Date(`${dateStr}T23:59:59`).toISOString();

  const { data: free, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', fromISO)
    .lte('when', toISO)
    .eq('taken', false)
    .order('when', { ascending: true });

  if (error) { console.error('[public] slots error:', error); const o=document.createElement('option'); o.value=''; o.textContent='Błąd wczytywania godzin'; o.disabled=true; o.selected=true; timeSel.appendChild(o); return; }
  if (!free?.length) { const o=document.createElement('option'); o.value=''; o.textContent='Brak wolnych godzin'; o.disabled=true; o.selected=true; timeSel.appendChild(o); return; }

  const ph = document.createElement('option'); ph.value=''; ph.textContent='Wybierz godzinę'; ph.disabled=true; ph.selected=true; timeSel.appendChild(ph);
  free.forEach(s=>{
    const o = document.createElement('option');
    o.value = s.id;              // ID slota (UUID) — krytyczne
    o.dataset.when = s.when;
    o.textContent = fmtHM(s.when);
    timeSel.appendChild(o);
  });
  timeSel.disabled = false;
}

/* ---------- Supabase helpers ---------- */
async function dbFindOrCreateClient({ name, email, phone, address }){
  if (!window.sb) return null;
  // find
  let { data: found, error: e1 } = await window.sb.from('clients').select('id').eq('email', email).single();
  if (found?.id) return found.id;
  // create
  const { data: created, error: e2 } = await window.sb.from('clients').insert({ name, email, phone, address }).select('id').single();
  if (e2 || !created?.id) { console.warn('[public] create client error', e2); return null; }
  return created.id;
}

async function dbCreateBooking({ client_id, service_id, slot_id, notes }){
  const { data, error } = await window.sb.from('bookings').insert({ client_id, service_id, slot_id, notes }).select('id, created_at').single();
  if (error) console.warn('[public] booking insert error', error);
  return data;
}

async function dbMarkSlotTaken(slot_id){
  if (!slot_id) return;
  const { error } = await window.sb.from('slots').update({ taken: true }).eq('id', slot_id);
  if (error) console.warn('[public] slot mark taken error', error);
}

/* ---------- Mail (Netlify) ---------- */
async function sendEmail({ subject, html }){
  try {
    const r = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ subject, html })
    });
    if (!r.ok) {
      const t = await r.text();
      console.warn('[MAIL] backend nie OK:', r.status, t);
    }
  } catch(e){ console.warn('[MAIL] wyjątek:', e); }
}

/* ---------- Calendar refresh (no LS) ---------- */
async function refreshCalendarDays(){
  if (!window.sb) return;
  const nowISO = new Date().toISOString();
  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', nowISO)
    .eq('taken', false)
    .order('when', { ascending: true });
  if (error) { console.warn('[public] days fetch err:', error); window.currentSlots = []; return; }
  // trzymamy w pamięci
  window.currentSlots = data || [];
  // wywołaj funkcję, która rysuje podświetlenia (jeśli istnieje)
  if (typeof window.updateCalendarHighlights === 'function') window.updateCalendarHighlights();
  if (window.fp && typeof window.fp.redraw === 'function') window.fp.redraw();
}

/* ---------- Submit (Supabase) ---------- */
async function handleSubmit(e){
  e.preventDefault();
  const form    = $('#form') || $('#bookingForm');
  const rodo    = $('#rodo')?.checked;
  const name    = $('#name')?.value.trim();
  const email   = $('#email')?.value.trim();
  const phone   = $('#phone')?.value.trim();
  const address = $('#address')?.value.trim();
  const notes   = $('#notes')?.value.trim() || '';
  const serviceSel = $('#service');
  const timeSel    = $('#time');
  const service_id = serviceSel?.value || '';
  const slot_id    = timeSel?.value || '';

  if (!rodo){ alert('Musisz wyrazić zgodę RODO.'); return; }
  if (!name || !email || !phone || !service_id || !slot_id){ alert('Uzupełnij wymagane pola.'); return; }

  // rewalidacja slota
  const { data: slot, error: sErr } = await window.sb.from('slots').select('id, when, taken').eq('id', slot_id).single();
  if (sErr || !slot) { alert('Wybrany termin nie istnieje.'); await fillTimesFromCloud($('#date')?.value); return; }
  if (slot.taken) { alert('Ten termin został już zajęty.'); await fillTimesFromCloud($('#date')?.value); return; }

  const whenISO = timeSel.options[timeSel.selectedIndex]?.dataset?.when || slot.when;
  const whenStr = new Date(whenISO).toLocaleString('pl-PL',{dateStyle:'full', timeStyle:'short'});
  const serviceName = serviceSel?.options[serviceSel.selectedIndex]?.textContent || '';

  // 1) klient
  const client_id = await dbFindOrCreateClient({ name, email, phone, address });
  if (!client_id){ alert('Nie udało się zapisać klienta.'); return; }

  // 2) booking
  const booking = await dbCreateBooking({ client_id, service_id, slot_id, notes });
  if (!booking?.id){ alert('Nie udało się utworzyć rezerwacji.'); return; }

  // 3) oznacz slot
  await dbMarkSlotTaken(slot_id);

  // 4) wyślij mail (nie blokuje)
  try {
    const html = `<h2>Nowa rezerwacja</h2>
      <p><b>Termin:</b> ${whenStr}</p>
      <p><b>Zabieg:</b> ${serviceName}</p>
      <p><b>Klient:</b> ${name}</p>
      <p><b>Adres / kontakt:</b><br>${address}<br>Tel: ${phone}<br>Email: ${email}</p>
      ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}`;
    await sendEmail({ subject:`Nowa rezerwacja — ${whenStr}`, html });
  } catch(e){}

  // 5) feedback + refresh times + calendar
  const thanks = $('#bookingThanks');
  if (thanks){ thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 4000); }
  form?.reset();

  const d = $('#date')?.value;
  if (d) await fillTimesFromCloud(d);
  await refreshCalendarDays();
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  await renderServicesSelect();
  const d = $('#date');
  d?.setAttribute('min', new Date().toISOString().slice(0,10));
  if (d?.value) await fillTimesFromCloud(d.value);
  d?.addEventListener('change', e=> fillTimesFromCloud(e.target.value));

  const form = $('#form') || $('#bookingForm');
  if (form && !form._bound){ form.addEventListener('submit', handleSubmit); form._bound = true; }

  // load calendar highlights from cloud (keeps calendar in sync)
  await refreshCalendarDays();
});

/* optional: react when other tabs change services/slots (still no LS writes here) */
window.addEventListener('storage', async (e)=>{
  if (e.key === 'services') await renderServicesSelect();
  if (e.key === 'slots') {
    const d = $('#date')?.value;
    if (d) await fillTimesFromCloud(d);
    await refreshCalendarDays();
  }
});
