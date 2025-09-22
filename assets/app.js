function el(sel,root=document){ return root.querySelector(sel); }
function fmtMoney(v){return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v);}
function fmtDate(d){return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});}

const services = Store.get('services',[]);
const settings = Store.get('settings',{});

// --- usługi
function renderServices(){
  const select = el('#service');
  if(!select) return;
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
