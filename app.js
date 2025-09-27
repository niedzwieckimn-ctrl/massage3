// assets/app.js

// --- helpers
function el(sel, root = document) { return root.querySelector(sel); }
function fmtMoney(v){ return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v||0); }
function fmtDate(d){ return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'}); }
// ============ SUPABASE HELPERS ============
// Uwaga: zakładam, że masz już window.sb = supabase.createClient(...) w index.html

async function sbEnsureClient({ name, email, phone, address }) {
  if (!window.sb) return null;

  // 1) spróbuj znaleźć klienta po e-mailu
  let { data: found, error: fErr } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();

  if (found && found.id) return found.id;

  // 2) jeśli nie ma – utwórz
  let { data: created, error: cErr } = await window.sb
    .from('clients')
    .insert([{ name, email, phone, address }])
    .select('id')
    .single();

  if (cErr || !created) {
    console.warn('[SB] create client ERR:', cErr);
    return null;
  }
  return created.id;
}

/**
 * Zapis rezerwacji + atomowe zajęcie slotu.
 * Zwraca { ok:true, booking } lub { ok:false, reason:'taken'|'error' }.
 */
async function sbCreateBookingAndTakeSlot({ client_id, service_id, slot_id, notes }) {
  if (!window.sb) return { ok:false, reason:'no-sb' };

  // 1) spróbuj zająć slot atomowo (tylko jeśli jeszcze nie był zajęty)
  const { data: upd, error: updErr } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id)
    .eq('taken', false)      // <-- zabezpieczenie przed overbookingiem
    .select('id,taken')
    .single();

  if (updErr || !upd) {
    // jeśli brak rekordu, to ktoś zajął go przed chwilą
    return { ok:false, reason:'taken' };
  }

  // 2) wstaw rezerwację
  const { data: booking, error: bErr } = await window.sb
    .from('bookings')
    .insert([{ client_id, service_id, slot_id, notes }])
    .select('id, created_at')
    .single();

  if (bErr || !booking) {
    console.warn('[SB] booking insert ERR:', bErr);
    // opcjonalnie możesz cofnąć zajęcie slotu, jeśli chcesz:
    await window.sb.from('slots').update({ taken:false }).eq('id', slot_id);
    return { ok:false, reason:'error' };
  }

  return { ok:true, booking };
}

/** Ściągnij ponownie wolne sloty i odłóż do LS (żeby widok miał świeże dane) */
async function sbRefreshFreeSlotsToLS(){
  if (!window.sb) return;
  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .eq('taken', false)
    .order('when', { ascending: true });

  if (!error) {
    localStorage.setItem('slots', JSON.stringify(data || []));
  } else {
    console.warn('[SB] refresh slots ERR:', error);
  }
}
// ============ /SUPABASE HELPERS ============

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
function handleSubmit(e){
  e.preventDefault();

  // numer rezerwacji (5 cyfr)
  const bookingNo = Math.floor(10000 + Math.random() * 90000);

  // pola formularza
  const rodo      = el('#rodo').checked;
  const name      = el('#name').value.trim();
  const email     = el('#email').value.trim();
  const phone     = el('#phone').value.trim();
  const address   = el('#address').value.trim();
  const serviceId = el('#service').value;
  const slotId    = el('#time').value;
  const notes     = el('#notes').value.trim();

  if(!rodo){ alert('Musisz wyrazić zgodę RODO.'); return; }
  if(!name || !email || !phone || !serviceId || !slotId){
    alert('Uzupełnij wszystkie wymagane pola.'); return;
  }

  // anty-duplikat slota
  const bookings = Store.get('bookings', []);
  if (bookings.some(b => b.slotId === slotId)) {
    alert('Ten termin został już zajęty.'); renderTimeOptions(); return;
  }
  

  // upsert klienta
  let clients = Store.get('clients', []);
  let client  = clients.find(c => c.email === email || c.phone === phone);
  if (!client) {
    client = {
      id: Store.uid(), name, email, phone, address,
      notesGeneral:'', preferences:{allergies:'',massage:'',health:'',mental:''}
    };
    clients.push(client);
  } else {
    client.name = name; client.phone = phone; client.address = address;
  }
  Store.set('clients', clients);

  // --- policz raz i używaj dalej (NIE deklaruj ponownie niżej!)
  const slot    = (Store.get('slots',[])||[]).find(s => s.id === slotId);
  const whenStr = slot ? new Date(slot.when).toLocaleString('pl-PL',
                   { dateStyle:'full', timeStyle:'short' }) : '(brak)';
  const services = getServices();
  const service  = services.find(s => s.id === serviceId) || { name:'(brak)', price:0 };

  // zapis rezerwacji
  const booking = {
    id: Store.uid(),
    clientId: client.id,
    serviceId,
    slotId,
    notes,
    createdAt: new Date().toISOString(),
    status: 'Oczekująca',
    bookingNo,          // numer
    when: whenStr       // termin (dla wygody w panelu)
  };
  bookings.push(booking);
  Store.set('bookings', bookings);

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
    o.value = s.id;             // tu mamy ID slotu
    o.dataset.when = s.when;    
    o.textContent = new Date(s.when).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
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



