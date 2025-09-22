function el(sel,root=document){ return root.querySelector(sel); }
function fmtMoney(v){return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v);}
function fmtDate(d){return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});}

const getservices = () =>Store.get('services',[]);
const settings = Store.get('settings',{});
// --- e-mail (Netlify Function)
const SEND_ENDPOINT = '/.netlify/functions/send-email';
async function sendEmail({to, subject, html}) {
  const r = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({to, subject, html})
  });
  if (!r.ok) throw new Error('Email HTTP ' + r.status);
}

// --- usługi
function renderServices(){
  const select = el('#service');
  if(!select) return;
  const services = getServices();
  if(!services.length){
    select.innerHTML = '<option value="">Brak usług – dodaj w panelu</option>';
    select.disabled = true; return;
  }
  select.disabled = false;
  select.innerHTML = services.map(s=>`<option value="${s.id}">${s.name} — ${fmtMoney(s.price)}</option>`).join('');
}


// --- wolne godziny dla dnia (spójne z Admin: slots = [{id,when}])
function availableTimesFor(dateStr){
  const dateKey = String(dateStr).slice(0,10);                 // YYYY-MM-DD z inputa
  const slots    = Store.get('slots',[]);
  const bookings = Store.get('bookings',[]);
  const takenIds = new Set(bookings.map(b => b.slotId));       // zajęte sloty

  return slots.filter(s=>{
    const slotKey = new Date(s.when).toISOString().slice(0,10); // dzień z ISO
    return slotKey === dateKey && !takenIds.has(s.id);
  });
}

// --- wypełnienie selecta godzin
function renderTimeOptions(){
  const dateVal = el('#date')?.value;
  const timeSel = el('#time');
  if(!timeSel) return;

  if(!dateVal){
    timeSel.innerHTML = '<option value="">Najpierw wybierz datę…</option>';
    timeSel.disabled = true; return;
  }

  const opts = availableTimesFor(dateVal);
  if(opts.length===0){
    timeSel.innerHTML = '<option value="">Brak wolnych godzin</option>';
    timeSel.disabled = true; return;
  }

  timeSel.innerHTML = '<option value="" disabled selected>Wybierz godzinę…</option>' +
    opts.map(s=>{
      const t = new Date(s.when).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
      return `<option value="${s.id}">${t}</option>`;
    }).join('');
  timeSel.disabled = false;
}

// --- submit rezerwacji
function handleSubmit(e){
  e.preventDefault();
  const rodo   = el('#rodo').checked;
  const name   = el('#name').value.trim();
  const email  = el('#email').value.trim();
  const phone  = el('#phone').value.trim();
  const address= el('#address').value.trim();
  const serviceId = el('#service').value;
  const slotId    = el('#time').value;
  const notes  = el('#notes').value.trim();
  const services = getServices();
  const service = services.find(s=>s.id===serviceId) || {name:'Usługa', price:0};

  if(!rodo){ alert('Musisz wyrazić zgodę RODO.'); return; }
  if(!name || !email || !phone || !serviceId || !slotId){
    alert('Uzupełnij wszystkie wymagane pola.'); return;
  }

  // anty-duplikat slota
  const bookings = Store.get('bookings',[]);
  if(bookings.some(b=>b.slotId===slotId)){
    alert('Ten termin został już zajęty.'); renderTimeOptions(); return;
  }

  // upsert klienta
  let clients = Store.get('clients',[]);
  let client  = clients.find(c=>c.email===email || c.phone===phone);
  if(!client){
    client = {id:Store.uid(), name,email,phone,address, notesGeneral:'', preferences:{allergies:'',massage:'',health:'',mental:''}};
    clients.push(client);
  }else{
    client.name=name; client.phone=phone; client.address=address;
  }
  Store.set('clients',clients);
// e-mail do masażystki (po przyjęciu rezerwacji)
try {
  const srv  = services.find(s=>s.id===serviceId) || {};
  const slot = (Store.get('slots',[])||[]).find(s=>s.id===slotId) || {};
  const whenStr = slot.when ? new Date(slot.when).toLocaleString('pl-PL') : '(brak)';
  const to = (settings && settings.contactEmail) || 'massage.n.spa@gmail.com';

  const html = `
    <h2>Nowa rezerwacja</h2>
    <p><b>Termin:</b> ${whenStr}</p>
    <p><b>Usługa:</b> ${srv.name || '-'}</p>
    <p><b>Klient:</b> ${name} &lt;${email}&gt;, tel. ${phone}</p>
    ${address ? `<p><b>Adres:</b> ${address}</p>` : ''}
    ${notes ? `<p><b>Uwagi klienta:</b> ${notes}</p>` : ''}
  `;

  await sendEmail({
    to,
    subject: `Nowa rezerwacja — ${whenStr}`,
    html
  });
} catch(e) {
  // nie przerywaj procesu; tylko informacja w konsoli
  console.warn('Nie wysłano e-maila do masażystki:', e);
}

  // zapis rezerwacji
  const booking = { id:Store.uid(), clientId:client.id, serviceId, slotId, notes, createdAt:new Date().toISOString(), status:'Oczekująca' };
  bookings.push(booking);
  Store.set('bookings',bookings);

  // podsumowanie
  const service = services.find(s=>s.id===serviceId) || {name:'Usługa', price:0};
  const slot    = (Store.get('slots',[])||[]).find(s=>s.id===slotId);
  const msg = [
    `Dziękujemy za rezerwację w Massage & SPA!`,
    `Termin: ${slot ? fmtDate(slot.when) : '—'}`,
    `Usługa: ${service.name} — ${fmtMoney(service.price)}`,
    ``,
    `Prosimy: zapisz termin w kalendarzu i zadbaj o higienę przed wizytą.`,
    `Do zobaczenia!`
  ].join('\n');

  alert(msg);
  const thanks = document.getElementById('bookingThanks');
  if (thanks) { thanks.classList.add('show'); setTimeout(()=>thanks.classList.remove('show'), 2600); }

  // reset
  el('#form').reset();
  renderTimeOptions();
}

// --- init
document.addEventListener('DOMContentLoaded', ()=>{
  renderServices();
  el('#date')?.addEventListener('change', renderTimeOptions);
  el('#form')?.addEventListener('submit', handleSubmit);
  el('#date')?.setAttribute('min', new Date().toISOString().slice(0,10));
  // stopka kontakt
  const s = Store.get('settings',{}); el('#contact').textContent = `${s.contactEmail||''} • ${s.contactTel||''}`;
  renderTimeOptions();
});

// odświeżenie gdy admin zmieni slots/bookings
window.addEventListener('storage', (e)=>{
  if(e.key==='slots' || e.key==='bookings') renderTimeOptions();
});
