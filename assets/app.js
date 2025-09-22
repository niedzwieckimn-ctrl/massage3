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
  select.innerHTML = services.map(s => (
    `<option value="${s.id}">${s.name} — ${fmtMoney(s.price)}</option>`
  )).join('');
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

// --- submit rezerwacji
function handleSubmit(e){
  e.preventDefault();

  const rodo    = el('#rodo').checked;
  const name    = el('#name').value.trim();
  const email   = el('#email').value.trim();
  const phone   = el('#phone').value.trim();
  const address = el('#address').value.trim();
  const serviceId = el('#service').value;
  const slotId    = el('#time').value;
  const notes     = el('#notes').value.trim();

  if(!rodo){ alert('Musisz wyrazić zgodę RODO.'); return; }
  if(!name || !email || !phone || !serviceId || !slotId){
    alert('Uzupełnij wszystkie wymagane pola.'); return;
  }

  // anty-duplikat slota
  const bookings = Store.get('bookings',[]);
  if(bookings.some(b => b.slotId === slotId)){
    alert('Ten termin został już zajęty.'); renderTimeOptions(); return;
  }

  // upsert klienta
  let clients = Store.get('clients',[]);
  let client  = clients.find(c => c.email===email || c.phone===phone);
  if(!client){
    client = {
      id: Store.uid(), name, email, phone, address,
      notesGeneral:'', preferences:{allergies:'',massage:'',health:'',mental:''}
    };
    clients.push(client);
  }else{
    client.name = name; client.phone = phone; client.address = address;
  }
  Store.set('clients', clients);

  // zapis rezerwacji
  const booking = {
    id: Store.uid(),
    clientId: client.id,
    serviceId,
    slotId,
    notes,
    createdAt: new Date().toISOString(),
    status: 'Oczekująca'
  };
  bookings.push(booking);
  Store.set('bookings', bookings);

  // podsumowanie dla klienta (alert + baner)
  const services = getServices();
  const service  = services.find(s=>s.id===serviceId) || {name:'Usługa', price:0};
  const slot     = (Store.get('slots',[])||[]).find(s=>s.id===slotId);
  const msg = [
    `Dziękujemy za rezerwację w Massage & SPA!`,
    `Termin: ${slot ? fmtDate(slot.when) : '—'}`,
    `Usługa: ${service.name} — ${fmtMoney(service.price)}`,
    ``,
    `Po weryfikacji potwierdzimy termin e-mailem.`,
  ].join('\n');
  alert(msg);
  const thanks = document.getElementById('bookingThanks');
  if (thanks) { thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 2600); }

  // e-mail do masażystki (nie blokuje procesu przy błędzie)
  (async ()=>{
    try{
      const to = (Store.get('settings',{}).contactEmail) || 'massage.n.spa@gmail.com';
      const whenStr = slot ? new Date(slot.when).toLocaleString('pl-PL') : '(brak)';
      const html = `
        <h2>Nowa rezerwacja</h2>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Usługa:</b> ${service.name}</p>
        <p><b>Klient:</b> ${name} &lt;${email}&gt;, tel. ${phone}</p>
        ${address ? `<p><b>Adres:</b> ${address}</p>` : ''}
        ${notes ? `<p><b>Uwagi klienta:</b> ${notes}</p>` : ''}
      `;
      await sendEmail({ to, subject:`Nowa rezerwacja — ${whenStr}`, html });
    }catch(err){
      console.warn('Nie wysłano e-maila do masażystki:', err);
    }
  })();

  // reset formularza
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
