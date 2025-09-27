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

// --- render listy usług
function renderServices(){
  const select = el('#service');
  if(!select) return;
  const services = getServices();
  if(!services.length){
    select.innerHTML = '<option value="">Brak usług – dodaj w panelu</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = services.map(
    s => `<option value="${s.id}">${s.name} — ${fmtMoney(s.price)}</option>`
  ).join('');
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
    thanks.innerHTML = `Dziękujemy za rezerwację.<br>Poczekaj na potwierdzenie e-mail! `;
    thanks.classList.add('show');
    setTimeout(()=>thanks.classList.remove('show'), 5000);
  }
// === SUPABASE: klient + booking + oznacz slot jako zajęty + odśwież sloty ===
if (window.sb) {
  try {
    const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');

    // 1) dane z formularza (użyj swoich ID pól – tu są najczęstsze)
    const name     = document.getElementById('name')?.value.trim();
    const email    = document.getElementById('email')?.value.trim();
    const phone    = document.getElementById('phone')?.value.trim();
    const address  = document.getElementById('address')?.value.trim();
    const notes    = document.getElementById('notes')?.value.trim() || '';

    // 2) identyfikatory z selectów (u Ciebie zwykle to są UUID)
    const service_id = document.getElementById('service')?.value || '';
    const timeVal    = document.getElementById('time')?.value || '';

    // 2a) slot_id: najpierw spróbuj wprost z <select id="time">
    let slot_id = isUUID(timeVal) ? timeVal : '';

    // 2b) awaryjnie: gdyby <select id="time"> zwracał "HH:MM", znajdź slot po dacie+godzinie
    if (!slot_id) {
      const dateStr = document.getElementById('date')?.value || '';
      if (dateStr && timeVal) {
        const [y,m,d] = dateStr.split('-').map(Number);
        const from = new Date(Date.UTC(y, (m||1)-1, d||1, 0,0,0)).toISOString();
        const to   = new Date(Date.UTC(y, (m||1)-1, d||1, 23,59,59)).toISOString();
        const { data: slots } = await window.sb
          .from('slots')
          .select('id, when, taken')
          .eq('taken', false)
          .gte('when', from).lt('when', to)
          .order('when', { ascending: true });

        const hhmm = w => {
          const dt = new Date(w);
          return String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
        };
        const found = (slots||[]).find(s => hhmm(s.when) === timeVal);
        slot_id = found?.id || '';
      }
    }

    if (!isUUID(service_id) || !isUUID(slot_id)) {
      console.warn('[SB] pomijam zapis: brak UUID service/slot', { service_id, slot_id });
    } else {
      // 3) ensure client po e-mailu
      let { data: cl } = await window.sb
        .from('clients').select('id').eq('email', email).single();
      if (!cl) {
        const ins = await window.sb
          .from('clients')
          .insert({ name, email, phone, address })
          .select('id').single();
        cl = ins.data;
      }

      // 4) booking
      if (cl?.id) {
        const { error: bErr } = await window.sb
          .from('bookings')
          .insert({ client_id: cl.id, service_id, slot_id, notes })
          .select('id').single();
        if (bErr) console.warn('[SB] bookings insert error:', bErr);
      }

      // 5) oznacz slot jako zajęty (dla pewności)
      await window.sb.from('slots').update({ taken: true }).eq('id', slot_id);

      // 6) odśwież wolne sloty w LS, żeby kalendarz na innych urządzeniach szybciej zniknął
      const { data: freshSlots } = await window.sb
        .from('slots')
        .select('id, when, taken')
        .eq('taken', false)
        .order('when', { ascending: true });
      localStorage.setItem('slots', JSON.stringify(freshSlots || []));
    }
  } catch (e) {
    console.warn('[SB] save skipped:', e?.message || e);
  }
}
// === /SUPABASE ===

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
  renderServices();
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
