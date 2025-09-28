/* =========================================================
   Public (klient) – Supabase only
   - renderServicesSelect()    -> <select id="service">
   - fillTimesFromCloud(date) -> <select id="time">
   - handleSubmit()           -> bookings + slot.taken + e-mail
   ========================================================= */

/* ---------- Helpers ---------- */
function $(sel) { return document.querySelector(sel); }
const fmtHM = d => new Date(d).toLocaleTimeString('pl-PL', { hour:'2-digit', minute:'2-digit' });

/* ---------- Services (select) ---------- */
async function renderServicesSelect(){
  const sel = $('#service');
  if (!sel) return;
  sel.innerHTML = '<option value="">Wybierz zabieg</option>';

  if (!window.sb) return; // brak Supabase = nic nie robimy

  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error || !Array.isArray(data)) {
    console.warn('[public] services error:', error);
    return;
  }

  const opts = data.map(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} — ${Number(s.price||0).toFixed(2)} zł`;
    return opt;
  });
  opts.forEach(o => sel.appendChild(o));
}

/* ---------- Free times from Supabase ---------- */
async function fillTimesFromCloud(dateStr){
  const timeSel = $('#time');
  if (!timeSel) return;

  timeSel.innerHTML = '';
  timeSel.disabled  = true;

  if (!dateStr) {
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Najpierw wybierz datę';
    ph.disabled = true; ph.selected = true;
    timeSel.appendChild(ph);
    return;
  }

  if (!window.sb) return;
/* ---------- Calendar highlights (dni z wolnymi slotami) ---------- */
async function refreshCalendarDays(){
  if (!window.sb) return;

  // wszystkie przyszłe wolne sloty
  const nowISO = new Date().toISOString();
  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', nowISO)
    .eq('taken', false)
    .order('when', { ascending: true });

  if (error) { console.warn('[public] days fetch err:', error); return; }

  // zgodność z kalendarzem – karmimy go przez localStorage('slots')
  try { localStorage.setItem('slots', JSON.stringify(data || []));
localStorage.setItem('ms_slots_v6', JSON.stringify(data || [])); // dla kalendarza
} catch(_){}

  // jeśli masz własną funkcję rysującą podświetlenia – użyj jej
  if (typeof window.updateCalendarHighlights === 'function') {
    window.updateCalendarHighlights();
  }
  // jeżeli używasz flatpickr i trzymasz referencję w window.fp
  if (window.fp && typeof window.fp.redraw === 'function') {
    window.fp.redraw();
  }
}

  // zakres dnia (UTC w ISO) – unikamy "Invalid time value"
  const fromISO = new Date(`${dateStr}T00:00:00`).toISOString();
  const toISO   = new Date(`${dateStr}T23:59:59`).toISOString();

  const { data: free, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', fromISO)
    .lte('when', toISO)
    .eq('taken', false)
    .order('when', { ascending: true });

  if (error) {
    console.error('[public] slots error:', error);
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Błąd wczytywania godzin';
    o.disabled = true; o.selected = true;
    timeSel.appendChild(o);
    return;
  }

  if (!free?.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Brak wolnych godzin';
    o.disabled = true; o.selected = true;
    timeSel.appendChild(o);
    return;
  }

  // placeholder
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'Wybierz godzinę';
  ph.disabled = true; ph.selected = true;
  timeSel.appendChild(ph);

  free.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;                 // ID slota
    o.dataset.when = s.when;        // ISO – do maila / opisu
    o.textContent = fmtHM(s.when);  // HH:MM
    timeSel.appendChild(o);
  });

  timeSel.disabled = false;
}

/* ---------- Supabase helpers ---------- */
async function dbFindOrCreateClient({ name, email, phone, address }){
  if (!window.sb) return null;

  // 1) spróbuj znaleźć
  let { data: found, error: e1 } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();

  if (found?.id) return found.id;

  // 2) utwórz
  const { data: created, error: e2 } = await window.sb
    .from('clients')
    .insert({ name, email, phone, address })
    .select('id')
    .single();

  if (e2 || !created?.id) {
    console.warn('[public] create client error:', e2);
    return null;
  }
  return created.id;
}

async function dbCreateBooking({ client_id, service_id, slot_id, notes }){
  const { data, error } = await window.sb
    .from('bookings')
    .insert({ client_id, service_id, slot_id, notes })
    .select('id, created_at')
    .single();
  if (error) console.warn('[public] booking insert error:', error);
  return data;
}

async function dbMarkSlotTaken(slot_id){
  const { error } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id);
  if (error) console.warn('[public] slot mark taken error:', error);
}

/* ---------- Mail (Netlify Function) ---------- */
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
  } catch(e){
    console.warn('[MAIL] wyjątek:', e);
  }
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
  if (!name || !email || !phone || !service_id || !slot_id){
    alert('Uzupełnij wymagane pola.'); return;
  }

  // Rewalidacja slota (jeszcze raz sprawdź w chmurze)
  const { data: slot, error: sErr } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .eq('id', slot_id)
    .eq('taken', false)
    .single();

  if (sErr || !slot?.id){
    alert('Wybrany termin jest już zajęty.');
    // odśwież godziny dla tego dnia
    const d = $('#date')?.value;
    if (d) await fillTimesFromCloud(d);
    return;
  }

  // Opis terminu do maila
  const whenISO = timeSel.options[timeSel.selectedIndex]?.dataset?.when || slot.when;
  const whenStr = new Date(whenISO).toLocaleString('pl-PL', { dateStyle:'full', timeStyle:'short' });
  const serviceName = serviceSel?.options[serviceSel.selectedIndex]?.textContent || '';

  // 1) klient
  const client_id = await dbFindOrCreateClient({ name, email, phone, address });
  if (!client_id){ alert('Nie udało się zapisać klienta.'); return; }

  // 2) rezerwacja
  const booking = await dbCreateBooking({ client_id, service_id, slot_id, notes });
  if (!booking?.id){ alert('Nie udało się utworzyć rezerwacji.'); return; }

  // 3) slot -> taken:true
  await dbMarkSlotTaken(slot_id);

  // 4) e-mail do masażystki (nie blokuje działania)
  try {
    const html = `
      <h2>Nowa rezerwacja</h2>
      <p><b>Termin:</b> ${whenStr}</p>
      <p><b>Zabieg:</b> ${serviceName}</p>
      <p><b>Klient:</b> ${name}</p>
      <p><b>Adres / kontakt:</b><br>${address}<br>Tel: ${phone}<br>Email: ${email}</p>
      ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}
    `;
    await sendEmail({ subject:`Nowa rezerwacja — ${whenStr}`, html });
  } catch(e){ /* log w sendEmail */ }

  // 5) feedback + refresh godzin
  const thanks = $('#bookingThanks');
  if (thanks){ thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 4000); }
  form?.reset();
// po zmianie statusu slotu odśwież kalendarz dni
await refreshCalendarDays();

  const d = $('#date')?.value;
  if (d) await fillTimesFromCloud(d); // zniknie z listy
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // usługi
  await renderServicesSelect();

  // data od dziś
  const d = $('#date');
  d?.setAttribute('min', new Date().toISOString().slice(0,10));
  // jeżeli jest już ustawiona w HTML – dociągnij godziny
  if (d?.value) await fillTimesFromCloud(d.value);
  d?.addEventListener('change', (e)=> fillTimesFromCloud(e.target.value));

  // submit – upewnij się, że jest jeden listener
  const form = $('#form') || $('#bookingForm');
  if (form && !form._bound){
    form.addEventListener('submit', handleSubmit);
    form._bound = true;
  }
  // podświetlenia dni w kalendarzu – dane z Supabase
  await refreshCalendarDays();
});

  // stopka kontakt (opcjonalnie z LocalStorage ustawień Admina)
  try {
    const s = JSON.parse(localStorage.getItem('settings') || '{}');
    const c = $('#contact');
    if (c) c.textContent = `${s.contactEmail || ''} • ${s.contactTel || ''}`;
  } catch(_) {}
});

/* auto-refresh widoku, gdy Admin zmieni dane (inne karty) */
window.addEventListener('storage', async (e)=>{
  if (e.key === 'services') await renderServicesSelect();
  if (e.key === 'slots') {
    const d = $('#date')?.value;
    if (d) await fillTimesFromCloud(d);
  }
});
