// assets/app.js

// --- helpers
function el(sel, root = document) { return root.querySelector(sel); }
function fmtMoney(v){ return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v||0); }
function fmtDate(d){ return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'}); }

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
/**
 * Zwraca slot po dacie (YYYY-MM-DD) i godzinie (HH:MM).
 * Szuka w Supabase w zakresie dnia i dopasowuje po lokalnym HH:MM.
 */
async function getSlotByDateTime(dateStr, timeStr) {
  if (!window.sb) return null;
  try {
    const [y, m, d] = dateStr.split('-').map(Number);

    // zakres całego dnia w UTC – unikamy "Invalid time value"
    const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
    const to   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString();

    const { data: slots, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .gte('when', from)
      .lte('when', to)
      .order('when', { ascending: true });

    if (error || !Array.isArray(slots)) return null;

    // pomocnik HH:MM w CZASIE LOKALNYM
    const pad  = n => (n < 10 ? '0' : '') + n;
    const toHM = iso => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

    const found = slots.find(s => toHM(s.when) === timeStr);
    return found || null;
  } catch (e) {
    console.warn('[public] getSlotByDateTime ERR:', e);
    return null;
  }
}

// --- submit rezerwacji (wersja stabilna)
async function handleSubmit(e){
  e.preventDefault();
  console.log('[FORM] submit start');

  // --- 1) dane z formularza
  const name    = (document.getElementById('name')?.value || '').trim();
  const email   = (document.getElementById('email')?.value || '').trim();
  const phone   = (document.getElementById('phone')?.value || '').trim();
  const address = (document.getElementById('address')?.value || '').trim();
  const service_id = document.getElementById('service')?.value || '';     // <-- z <select>
  const dateStr = (document.getElementById('date')?.value || '').trim();
  const timeStr = (document.getElementById('time')?.value || '').trim();
  const notes   = (document.getElementById('notes')?.value || '').trim();
  const rodo    = document.querySelector('#rodo')?.checked;

  if(!name || !email || !phone || !dateStr || !timeStr || !service_id || !rodo){
    alert('Uzupełnij wymagane pola (w tym zgoda RODO).');
    return;
  }

 
  // --- 3) zapis lokalny (tak jak do tej pory – dla UI)
  const whenStr = `${dateStr} ${timeStr}`;
  const booking = {
    id: Store.uid(),
    clientId: 'local',          // lokalne ID (UI)
    serviceId: service_id,
    slotId: slot.id,
    notes,
    createdAt: new Date().toISOString(),
    status: 'Oczekująca',
    bookingNo: '',              // (opcjonalnie) numer
    when: whenStr               // dla wygody w panelu
  };
  const bookings = Store.get('bookings', []);
  bookings.push(booking);
  Store.set('bookings', bookings);

  // (opcjonalnie) nazwa zabiegu do maila
  try {
    const opt = document.querySelector('#service option:checked');
    window.__lastServiceName = opt ? opt.textContent.trim() : '';
  } catch(_) {}

  // --- 4) e-mail do masażystki (zostawiasz swoją działającą funkcję)
  (async ()=>{
    try {
      const html = `
        <h3>Nowa rezerwacja</h3>
        <p><b>Nr rezerwacji:</b> ${booking.bookingNo || ''}</p>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Zabieg:</b> ${window.__lastServiceName || ''}</p>
        <p><b>Klient:</b> ${name}</p>
        <p><b>Adres:</b> ${address}<br>Tel: ${phone}<br>Email: ${email}</p>
        <p><b>Uwagi:</b> ${notes || ''}</p>`;
      await sendEmail({ subject: `Nowa rezerwacja — ${whenStr}`, html });
    } catch(err){
      console.warn('[MAIL] błąd wysyłki:', err);
    }
  })();

  // --- 5) SYNC → Supabase (w tle, bez blokowania UI)
  (async ()=>{
    try {
      if (!window.sb) return; // brak klienta supabase – nic nie psujemy

      // prosta walidacja UUID
      const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      if (!isUUID(service_id) || !isUUID(slot.id)) {
        console.warn('[SB] pomijam zapis – service_id/slot.id nie jest UUID', {service_id, slotId: slot.id});
        return;
      }

      // 5.1 klient: znajdź po e-mailu albo utwórz
      let { data: cl, error: cErr } = await window.sb
        .from('clients').select('id').eq('email', email).single();

      if (!cl) {
        let { data: created, error: insErr } = await window.sb
          .from('clients')
          .insert({ name, email, phone, address })
          .select('id').single();
        if (insErr || !created) { console.warn('[SB] create client ERR:', insErr); return; }
        cl = created;
      }

      // 5.2 rezerwacja
      let { error: bErr } = await window.sb
        .from('bookings')
        .insert({ client_id: cl.id, service_id, slot_id: slot.id, notes })
        .select('id').single();
      if (bErr) { console.warn('[SB] bookings insert ERR:', bErr); return; }

      // 5.3 oznacz slot jako zajęty (w chmurze)
      await window.sb.from('slots').update({ taken: true }).eq('id', slot.id);

      // 5.4 zaciągnij świeże wolne sloty do LS (żeby klient od razu widział)
      let { data: fresh } = await window.sb
        .from('slots')
        .select('id, when, taken')
        .eq('taken', false)
        .order('when', { ascending: true });
      localStorage.setItem('slots', JSON.stringify(fresh || []));
    } catch(e){
      console.warn('[SB] sync ERR:', e?.message || e);
    }
  })();

  // --- 6) UI: baner „Dziękujemy” + reset formularza + odświeżenie godzin
  const thanks = document.getElementById('bookingThanks');
  if (thanks) {
    thanks.innerHTML = 'Dziękujemy za rezerwację.<br>Poczekaj na potwierdzenie e-mail.';
    thanks.classList.add('show');
    setTimeout(()=>thanks.classList.remove('show'), 5000);
  }
  document.querySelector('form')?.reset();
  renderTimeOptions();

  console.log('[FORM] submit done!');
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



