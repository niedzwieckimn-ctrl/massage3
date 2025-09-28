/* assets/app.js — public, Supabase-only, bez localStorage
   Ładuje godziny z SB, sam ustawia datę (jeśli pusta), rewaliduje slot przed zapisem. */

function $(s){ return document.querySelector(s); }
const fmtHM = iso => new Date(iso).toLocaleTimeString('pl-PL',{ hour:'2-digit', minute:'2-digit' });

/* ---------- SERVICES ---------- */
async function renderServicesSelect(){
  const sel = $('#service');
  if(!sel || !window.sb) return;
  sel.innerHTML = '<option value="">Wybierz zabieg</option>';

  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) { console.warn('[services]', error); return; }
  (data||[]).forEach(s=>{
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.name} — ${Number(s.price||0).toFixed(2)} zł`;
    sel.appendChild(o);
  });
}

/* ---------- SLOTS z Supabase ---------- */
function dayBounds(dateStr){
  const from = new Date(`${dateStr}T00:00:00`);
  const to   = new Date(`${dateStr}T23:59:59`);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

async function fillTimesForDate(dateStr){
  const timeSel = $('#time');
  if(!timeSel) return;

  timeSel.innerHTML = '';
  timeSel.disabled = true;

  if(!dateStr){
    const o = document.createElement('option');
    o.value=''; o.disabled=true; o.selected=true;
    o.textContent='Najpierw wybierz datę';
    timeSel.appendChild(o);
    return;
  }

  const { fromISO, toISO } = dayBounds(dateStr);
  const { data, error } = await window.sb
    .from('slots')
    .select('id, when')
    .gte('when', fromISO)
    .lte('when', toISO)
    .eq('taken', false)
    .order('when', { ascending:true });

  if (error){
    const o = document.createElement('option');
    o.value=''; o.disabled=true; o.selected=true;
    o.textContent='Błąd wczytywania godzin';
    timeSel.appendChild(o);
    return;
  }

  if (!data?.length){
    const o = document.createElement('option');
    o.value=''; o.disabled=true; o.selected=true;
    o.textContent='Brak wolnych godzin';
    timeSel.appendChild(o);
    return;
  }

  const ph = document.createElement('option');
  ph.value=''; ph.disabled=true; ph.selected=true;
  ph.textContent='Wybierz godzinę';
  timeSel.appendChild(ph);

  data.forEach(s=>{
    const o = document.createElement('option');
    o.value = s.id;            // UUID slota
    o.dataset.when = s.when;   // ISO do maila/opisu
    o.textContent = fmtHM(s.when);
    timeSel.appendChild(o);
  });

  timeSel.disabled = false;
}

/* ---------- REWALIDACJA slota ---------- */
async function revalidateSelectedSlot(){
  const timeSel = $('#time');
  const slot_id = timeSel?.value;
  if(!slot_id) return { ok:false, reason:'no-slot' };

  const { data:slot, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .eq('id', slot_id)
    .single();

  if (error || !slot) return { ok:false, reason:'not-found' };
  if (slot.taken)     return { ok:false, reason:'taken' };
  return { ok:true, slot };
}

/* ---------- DB helpers ---------- */
async function dbFindOrCreateClient({ name, email, phone, address }){
  let { data:found } = await window.sb
    .from('clients').select('id').eq('email', email).single();
  if (found?.id) return found.id;

  const { data:created, error } = await window.sb
    .from('clients').insert({ name, email, phone, address }).select('id').single();
  if (error || !created?.id) throw new Error('client-insert');
  return created.id;
}

async function dbCreateBooking({ client_id, service_id, slot_id, notes }){
  const { data, error } = await window.sb
    .from('bookings')
    .insert({ client_id, service_id, slot_id, notes })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('booking-insert');
  return data.id;
}

async function dbMarkSlotTaken(slot_id){
  const { error } = await window.sb
    .from('slots')
    .update({ taken:true })
    .eq('id', slot_id);
  if (error) throw new Error('slot-update');
}

/* ---------- MAIL (Netlify Function) ---------- */
async function sendEmail({ subject, html }){
  try{
    const r = await fetch('/.netlify/functions/send-email', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ subject, html })
    });
    if(!r.ok) console.warn('[MAIL]', r.status, await r.text());
  }catch(e){ console.warn('[MAIL-exc]', e); }
}

/* ---------- SUBMIT ---------- */
async function handleSubmit(e){
  e.preventDefault();

  const form = $('#form') || $('#bookingForm');
  const rodo = $('#rodo')?.checked;
  const name = $('#name')?.value.trim();
  const email = $('#email')?.value.trim();
  const phone = $('#phone')?.value.trim();
  const address = $('#address')?.value.trim();
  const notes = $('#notes')?.value.trim() || '';

  const serviceSel = $('#service');
  const timeSel    = $('#time');
  const service_id = serviceSel?.value || '';
  const slot_id    = timeSel?.value || '';

  if(!rodo){ alert('Musisz wyrazić zgodę RODO.'); return; }
  if(!name || !email || !phone || !service_id || !slot_id){
    alert('Uzupełnij wymagane pola.'); return;
  }

  // rewalidacja
  const chk = await revalidateSelectedSlot();
  if(!chk.ok){
    const msg =
      chk.reason==='taken'     ? 'Ten termin został właśnie zajęty.' :
      chk.reason==='not-found' ? 'Wybrany termin nie istnieje.' :
      'Nie wybrano godziny.';
    alert(msg);
    const d = $('#date')?.value; if (d) await fillTimesForDate(d);
    return;
  }

  // dane do maila
  const whenISO = timeSel.options[timeSel.selectedIndex]?.dataset?.when || chk.slot.when;
  const whenStr = new Date(whenISO).toLocaleString('pl-PL',{ dateStyle:'full', timeStyle:'short' });
  const serviceName = serviceSel?.options[serviceSel.selectedIndex]?.textContent || '';

  try{
    const client_id = await dbFindOrCreateClient({ name, email, phone, address });
    await dbCreateBooking({ client_id, service_id, slot_id, notes });
    await dbMarkSlotTaken(slot_id);

    // mail do masażystki
    const html = `
      <h2>Nowa rezerwacja</h2>
      <p><b>Termin:</b> ${whenStr}</p>
      <p><b>Zabieg:</b> ${serviceName}</p>
      <p><b>Klient:</b> ${name}</p>
      <p><b>Adres / kontakt:</b><br>${address}<br>Tel: ${phone}<br>Email: ${email}</p>
      ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}`;
    await sendEmail({ subject:`Nowa rezerwacja — ${whenStr}`, html });

    // sukces: baner + reset + odświeżenie godzin
    const thanks = $('#bookingThanks');
    if (thanks){ thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 4000); }
    form?.reset();
    const d = $('#date')?.value; if (d) await fillTimesForDate(d);

  }catch(err){
    console.warn('[submit]', err);
    alert('Nie udało się zapisać rezerwacji.');
  }
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  // 1) usługi
  await renderServicesSelect();

  // 2) data — jeśli pusta, ustaw „dzisiaj”; ustaw min na dziś
  const d = $('#date');
  if (d){
    d.setAttribute('min', new Date().toISOString().slice(0,10));
    if (!d.value) d.value = new Date().toISOString().slice(0,10); // <<< AUTO
    await fillTimesForDate(d.value);
    d.addEventListener('change', ()=> fillTimesForDate(d.value));
  }

  // 3) submit
  const form = $('#form') || $('#bookingForm');
  if (form && !form._bound){ form.addEventListener('submit', handleSubmit); form._bound = true; }
});
