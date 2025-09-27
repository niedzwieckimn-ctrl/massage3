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

// --- SUBMIT: Rezerwacja (bez odświeżania strony) --------------------------
async function handleSubmit(e){
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  console.log('[FORM] submit start');

  // 1) zbierz dane z formularza
  const name    = document.getElementById('name')?.value.trim();
  const email   = document.getElementById('email')?.value.trim();
  const phone   = document.getElementById('phone')?.value.trim();
  const address = document.getElementById('address')?.value.trim();
  const serviceSel = document.getElementById('service');
  const service_id = serviceSel?.value?.trim() || '';   // <select value = UUID
  const dateStr = document.getElementById('date')?.value.trim();
  const timeStr = document.getElementById('time')?.value.trim();
  const notes   = document.getElementById('notes')?.value.trim() || '';
  const rodo    = document.querySelector('#rodo')?.checked;

  if(!name || !email || !phone || !service_id || !dateStr || !timeStr || !rodo){
    alert('Uzupełnij wymagane pola (w tym zgoda RODO).'); 
    return;
  }

  // 2) pobierz slot po dacie/godzinie
  let slot = null;
  try {
    slot = await getSlotByDateTime(dateStr, timeStr);   // Twoja istniejąca funkcja
  } catch(err){ console.warn('[FORM] getSlotByDateTime ERR:', err); }
  if(!slot){ alert('Nie znaleziono wybranego terminu.'); return; }
  if(slot.taken){ alert('Wybrany termin jest już zajęty.'); return; }

  // 3) lokalny zapis (tak jak w Twojej wersji LS – nic tu nie psujemy)
  try {
    const whenStr = `${dateStr} ${timeStr}`;
    const service_name = serviceSel?.selectedOptions?.[0]?.textContent || '';
    const bookingNo = Math.floor(100000 + Math.random()*900000);

    const bookings = Store.get('bookings',[]) || [];
    const booking = {
      id: Store.uid(),
      clientId: '',          // LS nie wymaga
      serviceId: service_id,
      slotId: slot.id,
      notes,
      createdAt: new Date().toISOString(),
      status: 'Oczekująca',
      bookingNo,
      when: whenStr,
      service: { name: service_name },
      name, email, phone, address
    };
    bookings.push(booking);
    Store.set('bookings', bookings);

    // baner „Dziękujemy”
    const thanks = document.getElementById('bookingThanks');
    if (thanks){
      thanks.innerHTML = `Dziękujemy za rezerwację.<br>Poczekaj na potwierdzenie e-mail.`;
      thanks.classList.add('show');
      setTimeout(()=>thanks.classList.remove('show'), 5000);
    }

    // e-mail do masażystki (zostawiamy jak było – jeśli masz sendEmail)
    (async () => {
      try {
        const html = `
          <h3>Nowa rezerwacja:</h3>
          <p><b>NR rezerwacji:</b> ${bookingNo}</p>
          <p><b>Termin:</b> ${whenStr}</p>
          <p><b>Zabieg:</b> ${service_name}</p>
          <p><b>Klient:</b> ${name}</p>
          <p><b>Adres:</b> ${address}<br>Tel.: ${phone}<br>Email: ${email}</p>
          <p><b>Uwagi:</b> ${notes || ''}</p>
        `;
        await sendEmail({ subject:`Nowa rezerwacja — ${whenStr}`, html });
      } catch(err){ console.warn('Nie wysłano e-maila do masażystki:', err); }
    })();

  } catch(err){
    console.warn('[FORM] local save ERR:', err);
  }

  // 4) SUPABASE: klient + booking + oznacz slot + odśwież sloty
  if (window.sb){
    try{
      // ensure klient po e-mailu
      let { data: cl } = await window.sb.from('clients')
        .select('id').eq('email', email).single();

      if(!cl){
        const ins = await window.sb.from('clients')
          .insert([{ name, email, phone, address }])
          .select('id').single();
        cl = ins.data;
      }

      if(cl?.id){
        // rezerwacja
        const insB = await window.sb.from('bookings')
          .insert([{ client_id: cl.id, service_id, slot_id: slot.id, notes }])
          .select('id').single();
        if (insB.error) console.warn('[SB] bookings insert error:', insB.error);

        // oznacz slot
        await window.sb.from('slots').update({ taken:true }).eq('id', slot.id);

        // odśwież wolne sloty w LS (żeby zniknęła godzina)
        const { data: freshSlots } = await window.sb.from('slots')
          .select('id, when, taken').eq('taken', false).order('when', { ascending:true });
        localStorage.setItem('slots', JSON.stringify(freshSlots || []));
      }
    } catch (e){
      console.warn('[SB] save booking ERR:', e?.message || e);
    }
  }

  // 5) reset formularza + odświeżenie godzin
  document.getElementById('form')?.reset();
  renderTimeOptions(); // Twoja funkcja
  console.log('[FORM] submit done');
}

// Upewnij się, że tylko JEDEN listener:
document.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('form');
  if (form && !form._bound){
    form.addEventListener('submit', handleSubmit);
    form._bound = true;
  }
});
/**
 * Pobiera slot po dacie (YYYY-MM-DD) i godzinie (HH:MM)
 * Szuka w Supabase między 00:00 a 23:59 tego dnia
 * Zwraca obiekt slotu { id, when, taken } lub null
 */
async function getSlotByDateTime(dateStr, timeStr) {
  if (!window.sb) return null;
  try {
    const [y,m,d] = dateStr.split('-').map(Number);
    const from = new Date(Date.UTC(y, m-1, d, 0, 0, 0));
    const to   = new Date(Date.UTC(y, m-1, d, 23, 59, 59));

    const { data: slots, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .gte('when', from.toISOString())
      .lt('when', to.toISOString())
      .order('when', { ascending: true });

    if (error || !Array.isArray(slots)) return null;

    // dopasuj po godzinie (czas lokalny)
    const found = slots.find(s => {
      const hm = new Date(s.when).toISOString().substr(11,5); // "HH:MM"
      return hm === timeStr;
    });

    return found || null;
  } catch (e) {
    console.warn('[FORM] getSlotByDateTime ERR:', e);
    return null;
  }
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
