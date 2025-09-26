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
  if (!window.sb) {
  el('#form')?.addEventListener('submit', handleSubmit);
  }
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

/* ===========================
   SUPABASE – Rezerwacje
   =========================== */


// pobierz wolne sloty dla danej daty
async function renderServicesSelect(){
  const select = document.getElementById('service');
  if(!select) return;

  const services = await dbLoadServices();  // z Supabase
  Store.set('services', services || []);    // <-- DODAJ

  select.innerHTML = '<option value="">Wybierz zabieg…</option>';
  (services || []).forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.id;                       // value = UUID
    opt.dataset.id = s.id;                  // <-- DODAJ
    opt.textContent = `${s.name} — ${Number(s.price).toFixed(2)} zł`;
    select.appendChild(opt);
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
/* ====== ZAPIS DO SUPABASE: klient + rezerwacja + zajęcie slotu ====== */

// 1) pomocnicze: pobierz UUID usługi z <select>
function getSelectedServiceId() {
  const sel = document.getElementById('service');
  if (!sel) return null;
  // Zakładam, że option.value jest nazwą usługi (jak u Ciebie).
  // Jeśli już masz value = UUID, to to wystarczy: return sel.value;
  const selectedName = sel.value?.trim();
  if (!selectedName) return null;
  return window.sb
    .from('services')
    .select('id, name')
    .eq('name', selectedName)
    .single();
}

// 2) znajdź slot po dacie/godzinie (ISO identyczne jak w slots.when)
async function getSlotByDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { data: null, error: { message: 'Brak daty lub godziny' } };
  // ISO „yyyy-mm-ddThh:mm:00.000Z”
  const iso = new Date(`${dateStr}T${timeStr}:00`).toISOString();
  return await window.sb
    .from('slots')
    .select('id, when, taken')
    .eq('when', iso)
    .single();
}

// 3) ensureClient – nie duplikuje: szuka po e-mailu, w razie braku tworzy
async function ensureClient({ name, email, phone, address }) {
  // spróbuj znaleźć po e-mailu
  let { data: found, error: findErr } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();

  if (found && found.id) return found.id;

  // utwórz
  let { data: created, error: insErr } = await window.sb
    .from('clients')
    .insert([{ name, email, phone, address }])
    .select('id')
    .single();

  if (insErr || !created) throw new Error('Błąd tworzenia klienta');
  return created.id;
}

// 4) createBooking – zapisuje do bookings i zajmuje slot
async function createBooking({ client_id, service_id, slot_id, notes }) {
  // rezerwacja
  const { data: booking, error: bErr } = await window.sb
    .from('bookings')
    .insert([{ client_id, service_id, slot_id, notes }])
    .select('id, created_at')
    .single();
  if (bErr) throw new Error('Błąd tworzenia rezerwacji');

  // oznacz slot jako zajęty
  const { error: updErr } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id);
  if (updErr) throw new Error('Błąd oznaczania slotu jako zajęty');

  return booking;
}

// 5) handler przycisku „Rezerwuj”
(function hookPublicBooking() {
  const btn = document.querySelector('#reserveBtn, button[type="submit"]');
  const form = document.getElementById('form'); // jeśli masz id="form" na gridzie
  if (!btn || !form) return;

  // zabezpieczenie, by nie dodać kilka razy
  if (btn._bound) return;
  btn._bound = true;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();

    try {
      // 5.1 odczytaj dane z formularza
      const name    = (document.getElementById('name')?.value || '').trim();
      const email   = (document.getElementById('email')?.value || '').trim();
      const phone   = (document.getElementById('phone')?.value || '').trim();
      const address = (document.getElementById('address')?.value || '').trim();
      const dateStr = (document.getElementById('date')?.value || '').trim();
      const timeStr = (document.getElementById('time')?.value || '').trim();
      const notes   = (document.getElementById('notes')?.value || '').trim();
      const rodo    = document.querySelector('#rodo')?.checked;

      if (!name || !email || !phone || !dateStr || !timeStr || !rodo) {
        alert('Uzupełnij wymagane pola (w tym zgoda RODO).');
        return;
      }

      // 5.2 usługa
      let service_id;
      {
        // jeśli option.value = UUID — odbierz od razu:
        // 5.2 usługa – bierzemy UUID prosto z <select>
const sel = document.getElementById('service');
const service_id = sel?.value || '';
if (!service_id) { alert('Wybierz zabieg.'); return; }
// nie pobieramy już po nazwie, nie wołamy getSelectedServiceId()

      }

      // 5.3 slot po dacie/godzinie
      const { data: slot, error: slotErr } = await getSlotByDateTime(dateStr, timeStr);
      if (slotErr || !slot) { alert('Nie znaleziono wybranego terminu.'); return; }
      if (slot.taken) { alert('Wybrany termin jest już zajęty.'); return; }

      // 5.4 klient
      const client_id = await ensureClient({ name, email, phone, address });

      // 5.5 rezerwacja
      const booking = await createBooking({
        client_id,
        service_id,
        slot_id: slot.id,
        notes
      });

      // 5.6 sukces – odśwież listę terminów u klienta (LS używasz do mapki)
      try {
        const { data: freshSlots } = await window.sb
          .from('slots')
          .select('id, when, taken')
          .eq('taken', false)
          .order('when', { ascending: true });
        localStorage.setItem('slots', JSON.stringify(freshSlots || []));
      } catch(_) {}

      alert('Rezerwacja zapisana. Dziękujemy!');
      // tu możesz zawołać swoją funkcję e-mail (masażystka/klient),
      // bo masz już pewność, że zapis do bazy się udał.

    } catch (err) {
      console.error(err);
      alert('Nie udało się zapisać rezerwacji. Spróbuj ponownie.');
    }
  });
})();



