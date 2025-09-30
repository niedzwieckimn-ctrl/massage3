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
    const slotKey = (function(){const _d=new Date(s.when);return [_d.getFullYear(),String(_d.getMonth()+1).padStart(2,'0'),String(_d.getDate()).padStart(2,'0')].join('-');})(); // dzień z ISO
    const d = new Date(s.when);
  
  const isFree = (s.taken === false || s.taken == null);
  return slotKey === dateKey && isFree && !takenIds.has(s.id);
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

async function handleSubmit(e){
  e.preventDefault();
  const btn = e.submitter || el('button[type=submit]', e.target);
  if (btn) btn.disabled = true;

  // numer rezerwacji
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

  if(!rodo){ alert('Musisz wyrazić zgodę RODO.'); if(btn) btn.disabled=false; return; }
  if(!name || !email || !phone || !serviceId || !slotId){
    alert('Uzupełnij wszystkie wymagane pola.'); if(btn) btn.disabled=false; return;
  }

  // wczytaj opis zabiegu do maila
  const svc = await dbLoadServices();
  const service = (svc||[]).find(s => s.id === serviceId) || { name:'(brak)', price:0 };

  try {
    // 1) klient: znajdź/utwórz (funkcja masz w index.html)
    const client_id = await dbEnsureClient({ name, email, phone, address });
    if(!client_id) throw new Error('Nie udało się zapisać klienta.');

    // 2) rezerwacja w Supabase (funkcja masz w index.html)
    const r = await dbCreateBooking({ slot_id: slotId, service_id: serviceId, client_id, notes });
    if (!r.ok) throw new Error('Nie udało się utworzyć rezerwacji.');

    // 3) oznacz slot jako zajęty (Supabase)
    const { error: markErr } = await window.sb
      .from('slots')
      .update({ taken: true })
      .eq('id', slotId);
    if (markErr) throw markErr;

    // 4) odśwież cache slotów (CloudSlots) i UI
    if (window.CloudSlots) { await window.CloudSlots.pull(); }
    if (window.fp?.redraw) window.fp.redraw();

    // 5) e-mail do masażystki (Netlify Function)
    try {
      const whenOpt = el('#time').selectedOptions?.[0];
      const whenStr = whenOpt?.dataset?.when
        ? new Date(whenOpt.dataset.when).toLocaleString('pl-PL',{dateStyle:'full',timeStyle:'short'})
        : '';
      const html = `
        <h2>Nowa rezerwacja</h2>
        <p><b>Nr rezerwacji:</b> ${bookingNo}</p>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Zabieg:</b> ${service.name}</p>
        <p><b>Klient:</b> ${name}</p>
        <p><b>Adres / kontakt:</b><br>${address}<br>Tel: ${phone}<br>Email: ${email}</p>
        ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}
      `;
      // masz helper window.sendEmail już w index.html
      await window.sendEmail({ subject: `Nowa rezerwacja — ${whenStr}`, html });
    } catch (mailErr) {
      console.warn('[email] nie wysłano (ok, nie blokuje rezerwacji):', mailErr);
    }

    // 6) feedback i reset
    const thanks = document.getElementById('bookingThanks');
    if (thanks){ thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 4000); }
    e.target.reset();
    renderTimeOptions();
    alert('Dziękujemy! Rezerwacja złożona — poczekaj na potwierdzenie.');

  } catch (err) {
    console.error('[booking] błąd', err);
    alert('Nie udało się złożyć rezerwacji. Spróbuj ponownie.');
  } finally {
    if (btn) btn.disabled = false;
  }
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


    
// oznacz slot jako zajęty i odśwież listę wolnych
await dbMarkSlotTaken(slot_id);
if (window.CloudSlots) { await window.CloudSlots.pull(); }
// 5) feedback dla klienta (baner „Dziękujemy” jeśli masz #bookingThanks)
    const thanks = document.getElementById('bookingThanks');
    if (thanks){ thanks.classList.remove('hidden'); setTimeout(()=>thanks.classList.add('hidden'), 4000); }

    form.reset();
    // jeśli masz odświeżanie listy terminów na stronie, wywołaj je tutaj
  });
})();

/* Auto-select first available day after slots sync (robust, no locales) */
window.addEventListener('slots-synced', () => {
  try {
    const slots = JSON.parse(localStorage.getItem('slots') || '[]');
    if (!slots.length) return;
    const d = new Date(slots[0].when);
    const firstDay = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    const dateEl = document.getElementById('date');
    if (!dateEl) return;
    if (!dateEl.value) {
      dateEl.value = firstDay;
      dateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (e) { console.warn('slots-synced handler error', e); }
});
async function sendEmail(subject, html) {
  try {
    const r = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html })
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error('Email HTTP ' + r.status + ' - ' + text);
    }

    return await r.json();
  } catch (err) {
    console.error('sendEmail error:', err);
    throw err;
  }
}
