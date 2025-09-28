// assets/app.js

// --- helpers
function el(sel, root = document) { return root.querySelector(sel); }
function fmtMoney(v){ return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v||0); }
function fmtDate(d){ return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'}); }
async function dbLoadServices() {
  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, duration_min, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    console.warn('[SB] load services error:', error);
    return [];
  }
  return data || [];
}

// --- źródła danych
const settings = Store.get('settings', {}); // kontakt do masażystki, tel, rodo, itp.

// --- usługi: zawsze świeże z magazynu + zasiew gdy pusto
const getServices = () => Store.get('services', []);
function ensureServicesSeed(){
  let s = Store.get('services', []);
  if(!s || !s.length){
    s = [{ id: Store.uid(), name: 'Masaż klasyczny 60 min', durationMin: 60, price: 180 }];
    Store.set('services', s);
  }
}

// Wczytuje zabiegi z Supabase i buduje <select id="service">
async function renderServicesSelect(){
  const select = document.getElementById('service');
  if(!select) return;
  const services = await dbLoadServices(); // z index.html
  select.innerHTML = '<option value="">Wybierz zabieg…</option>';
  services.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} — ${Number(s.price).toFixed(2)} zł`;
    select.appendChild(opt);
  });
}


// --- wolne godziny dla wybranego dnia (slots=[{id,when}], bookings zajmują slotId)
function availableTimesFor(dateStr){
  const dateKey = String(dateStr).slice(0,10); // "YYYY-MM-DD"
  const slots    = Store.get('slots',[]) || [];
  const bookings = Store.get('bookings',[]) || [];
  const takenIds = new Set(bookings.map(b => b.slotId));

  return slots.filter(s => {
    const slotKey = new Date(s.when).toISOString().slice(0,10); // dzień z ISO
    return slotKey === dateKey && !takenIds.has(s.id);
  }).sort((a,b)=> new Date(a.when) - new Date(b.when));
}

// --- wypełnienie <select id="time">
function renderTimeOptions(){
  const dateVal = el('#date')?.value;
  const timeSel = el('#time');
  if(!timeSel) return;

  if(!dateVal){
    timeSel.innerHTML = '<option value="">Najpierw wybierz datę…</option>';
    timeSel.disabled = true;
    return;
  }

  const opts = availableTimesFor(dateVal);
  if(!opts.length){
    timeSel.innerHTML = '<option value="">Brak wolnych godzin</option>';
    timeSel.disabled = true;
    return;
  }

  timeSel.innerHTML = '<option value="" disabled selected>Wybierz godzinę…</option>' +
    opts.map(s => {
      const t = new Date(s.when).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
      return `<option value="${s.id}">${t}</option>`;
    }).join('');
  timeSel.disabled = false;
}

// --- e-mail (Netlify Function) — do masażystki po złożeniu rezerwacji
const SEND_ENDPOINT = '/.netlify/functions/send-email';
async function sendEmail({to, subject, html}) {
  const r = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({to, subject, html})
  });
  if (!r.ok) throw new Error('Email HTTP ' + r.status);
}

// --- submit rezerwacji (wersja stabilna)
async function handleSubmit(e){
  e.preventDefault();

  const name    = document.querySelector('#name')?.value.trim();
  const email   = document.querySelector('#email')?.value.trim();
  const phone   = document.querySelector('#phone')?.value.trim();
  const address = document.querySelector('#address')?.value.trim();
  const notes   = document.querySelector('#notes')?.value.trim() || '';

  const service_id = document.getElementById('service')?.value;
  const slot_id    = document.getElementById('time')?.value;
  const dateStr    = document.getElementById('date')?.value;

  if (!name || !email || !phone || !service_id || !slot_id || !dateStr) {
    toast('Uzupełnij wymagane pola.'); 
    return;
  }

  // 1) REWALIDACJA slota (musi istnieć i być wolny)
  const { data: slot, error: sErr } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .eq('id', slot_id)
    .single();

  if (sErr || !slot) { toast('Nie znaleziono wybranego terminu.'); return; }
  if (slot.taken)    { toast('Ten termin został już zajęty.'); 
                       await fillTimesFromCloud(dateStr); 
                       return; }

  // 2) KLIENT: znajdź po e-mailu lub utwórz
  let { data: cl, error: cErr } = await window.sb
    .from('clients').select('id').eq('email', email).single();

  if (cErr || !cl) {
    const ins = await window.sb
      .from('clients')
      .insert({ name, email, phone, address })
      .select('id')
      .single();
    cl = ins.data;
    if (!cl) { toast('Błąd tworzenia klienta.'); return; }
  }

  // 3) BOOKING
  const { data: b, error: bErr } = await window.sb
    .from('bookings')
    .insert({ client_id: cl.id, service_id, slot_id, notes })
    .select('id')
    .single();

  if (bErr || !b) { toast('Błąd zapisu rezerwacji.'); return; }

  // 4) OZNACZ SLOT jako zajęty
  await window.sb.from('slots').update({ taken: true }).eq('id', slot_id);

  // 5) Odśwież godziny dla tej daty (żeby zniknął slot)
  await fillTimesFromCloud(dateStr);


  // baner "Dziękujemy" (środek ekranu)
  const thanks = document.getElementById('bookingThanks');
  if (thanks){
    thanks.innerHTML= `Dziękujemy za rezerwację. <br> Poczekaj na potwierdzenie e-mail! `;
    thanks.classList.add('show');
    setTimeout(()=>thanks.classList.remove('show'), 5000);
  }

  // e-mail do masażystki (backend wysyła tylko do THERAPIST_EMAIL)
  (async () => {
    try {
      const html = `
        <h2>Nowa rezerwacja</h2>
        <p><b>Nr rezerwacji:</b> ${bookingNo}</p>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Zabieg:</b> ${service.name}</p>
        <p><b>Klient:</b> ${name}</p>
        <p><b>Adres / kontakt:</b><br>${address}<br>Tel: ${phone}<br>Email: ${email}</p>
        ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}
      `;
      await sendEmail({ subject: `Nowa rezerwacja — ${whenStr}`, html });
    } catch (err) {
      console.warn('Nie wysłano e-maila do masażystki:', err);
    }
  })();

  // reset formularza i odświeżenie listy godzin
  el('#form').reset();
  renderTimeOptions();
}



// --- init
document.addEventListener('DOMContentLoaded', ()=>{
  ensureServicesSeed();              // jeśli pusto – zasiej 1 usługę
  renderServicesSelect();
  el('#date')?.addEventListener('change', renderTimeOptions);
  el('#form')?.addEventListener('submit', handleSubmit);
  el('#date')?.setAttribute('min', new Date().toISOString().slice(0,10));
  // stopka kontakt
  const s = Store.get('settings',{}); el('#contact').textContent = `${s.contactEmail||''} • ${s.contactTel||''}`;
  renderTimeOptions();
});

// odśwież widoki, gdy Admin zmienia dane
window.addEventListener('storage', (e)=>{
  if(e.key==='services') renderServices();
  if(e.key==='slots' || e.key==='bookings') renderTimeOptions();
});
// --- WYSYŁKA FORMULARZA REZERWACJI ---
(function(){
  const form = document.getElementById('bookingForm');
  if (!form) return;

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // 1) zbierz dane z formularza
    const name    = document.getElementById('name')?.value.trim();
    const email   = document.getElementById('email')?.value.trim();
    const phone   = document.getElementById('phone')?.value.trim();
    const address = document.getElementById('address')?.value.trim();
    const service_id = document.getElementById('service')?.value;
    let   slotVal    = document.getElementById('time')?.value; // może być ID albo data
    const notes   = document.getElementById('notes')?.value.trim() || '';

    if(!name || !email || !phone || !service_id || !slotVal){
      alert('Uzupełnij wymagane pola.'); return;
    }

    // 2) upewnij się, że mamy slot_id (jeśli w <select> jest data, dociągnij ID z Supabase)
    let slot_id = slotVal;
    const isUUID = /^[0-9a-fA-F-]{36}$/.test(slotVal);
    if (!isUUID) {
      // traktujemy value jako datę ISO -> pobierz ID slotu z bazy
      const { data, error } = await sb.from('slots')
        .select('id')
        .eq('when', slotVal)
        .single();
      if (error || !data) { alert('Nie udało się znaleźć wybranego terminu.'); return; }
      slot_id = data.id;
    }

    // 3) klient: znajdź lub utwórz
    const client_id = await dbEnsureClient({name, email, phone, address});
    if(!client_id){ alert('Nie udało się zapisać klienta.'); return; }

    // 4) rezerwacja + oznaczenie slotu jako zajęty
    const r = await dbCreateBooking({ slot_id, service_id, client_id, notes });
    if(!r.ok){ alert('Nie udało się utworzyć rezerwacji.'); return; }

    // 5) feedback dla klienta (baner „Dziękujemy” jeśli masz #bookingThanks)
    const thanks = document.getElementById('bookingThanks');
    if (thanks){ thanks.classList.remove('hidden'); setTimeout(()=>thanks.classList.add('hidden'), 4000); }

    form.reset();
    // jeśli masz odświeżanie listy terminów na stronie, wywołaj je tutaj
  });
})();
/* ===========================
   SUPABASE – Rezerwacje
   =========================== */


// pobierz wolne sloty dla danej daty
async function fillTimesFromCloud(dateStr) {
  const timeSel = document.getElementById('time');
  if (!timeSel) return;

  timeSel.innerHTML = '';
  const from = new Date(`${dateStr}T00:00:00`);
  const to   = new Date(`${dateStr}T23:59:59`);

  const { data: free, error } = await window.sb
    .from('slots')
    .select('id, when')
    .gte('when', from.toISOString())
    .lte('when', to.toISOString())
    .eq('taken', false)
    .order('when', { ascending: true });

  if (error) { console.error('[slots] error:', error); return; }
  if (!free.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Brak wolnych godzin';
    o.disabled = true;
    timeSel.appendChild(o);
    return;
  }

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Wybierz godzinę';
  ph.disabled = true;
  ph.selected = true;
  timeSel.appendChild(ph);

  free.forEach(s => {
  const o = document.createElement('option');
  o.value = s.id;                    // <-- MUSI być ID slota
  o.dataset.when = s.when;           // opcjonalnie do e-maila
  o.textContent = new Date(s.when).toLocaleTimeString('pl-PL',
     { hour:'2-digit', minute:'2-digit' });
  timeSel.appendChild(o);
});

}

// znajdź klienta po e-mailu albo utwórz nowego
async function dbFindOrCreateClient({ name, email, phone, address }) {
  let { data: c } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();
  if (!c) {
    const { data: cIns, error: cErr } = await window.sb
      .from('clients')
      .insert([{ name, email, phone, address }])
      .select('id')
      .single();
    if (cErr) throw cErr;
    return cIns.id;
  }
  return c.id;
}

// zapisz booking
async function dbCreateBooking({ client_id, service_id, slot_id, notes }) {
  const { data, error } = await window.sb
    .from('bookings')
    .insert([{ client_id, service_id, slot_id, notes }])
    .select('id, created_at')
    .single();
  if (error) throw error;
  return data;
}

// oznacz slot jako zajęty
async function dbMarkSlotTaken(slot_id) {
  const { error } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id);
  if (error) throw error;
}



