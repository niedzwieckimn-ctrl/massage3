
function el(s,r=document){return r.querySelector(s)}
function els(s,r=document){return [...r.querySelectorAll(s)]}
function fmtMoney(v){return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v);}
function fmtDate(d){return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'})}

const Session = {
  isAuthed(){ return sessionStorage.getItem('adminAuthed')==='1'; },
  login(){ sessionStorage.setItem('adminAuthed','1'); },
  logout(){ sessionStorage.removeItem('adminAuthed'); }
};

function requireAuth(){
  if(!Session.isAuthed()){
    el('#loginView').style.display='block';
    el('#appView').style.display='none';
  }else{
    el('#loginView').style.display='none';
    el('#appView').style.display='block';
    renderAll();
  }
}

function login(){
  const pinInput = el('#pin').value.trim();
  const pin = Store.get('pin','2505');
  if(pinInput===pin){ Session.login(); requireAuth(); }
  else { alert('Błędny PIN'); }
}
function logout(){ Session.logout(); requireAuth(); }

function renderAll(){
  renderUpcoming();
  renderSlots();
  renderServices();
  renderClients();
  renderSettings();
}

function renderUpcoming(){
  const bookings = Store.get('bookings',[]);
  const slots = Store.get('slots',[]);
  const services = Store.get('services',[]);
  const clients = Store.get('clients',[]);
  // join data
  const items = bookings.map(b=>{
    const slot = slots.find(s=>s.id===b.slotId) || {when:b.createdAt};
    const service = services.find(s=>s.id===b.serviceId) || {name:'(usługa)'};
    const client = clients.find(c=>c.id===b.clientId) || {name:'(klient)'};
    return {...b, when:slot.when, serviceName:service.name, clientName:client.name};
  }).sort((a,b)=> new Date(a.when)-new Date(b.when));
  const wrap = el('#upcoming');
  wrap.innerHTML = items.length? '' : '<div class="notice">Brak rezerwacji.</div>';
  for(const it of items){
    const card = document.createElement('div');
    card.className='listItem';
    card.innerHTML = `<div class='inline' style='justify-content:space-between'>
      <div><b>${fmtDate(it.when)}</b> • ${it.serviceName} <span class='meta'>(${it.clientName})</span></div>
      <div class='inline'>
        <span class='badge ${it.status==='Potwierdzona'?'green':'red'}'>${it.status}</span>
        <button class='btn success' data-act='confirm' data-id='${it.id}'>Potwierdź</button>
        <button class='btn danger' data-act='delBooking' data-id='${it.id}'>Usuń</button>
      </div>
    </div>`;
    wrap.appendChild(card);
  }
  wrap.onclick = (e)=>{
    const id = e.target.dataset.id;
    const act = e.target.dataset.act;
    if(!id) return;
    let bookings = Store.get('bookings',[]);
    if(act==='delBooking'){
      bookings = bookings.filter(b=>b.id!==id);
      Store.set('bookings',bookings);
      renderAll();
    }
    if(act==='confirm'){
      bookings = bookings.map(b=> b.id===id? {...b, status:'Potwierdzona'} : b );
      Store.set('bookings',bookings);
      renderAll();
    }
  };
}

function renderSlots(){
  const list = el('#slotsList');
  const slots = Store.get('slots',[]).sort((a,b)=> new Date(a.when)-new Date(b.when));
  list.innerHTML = slots.length? '' : '<div class="notice">Brak dodanych terminów.</div>';
  for(const s of slots){
    const row = document.createElement('div');
    row.className='listItem inline';
    row.style.justifyContent='space-between';
    row.innerHTML = `<div><b>${fmtDate(s.when)}</b></div>
      <div class='inline'><button class='btn danger' data-id='${s.id}'>Usuń</button></div>`;
    list.appendChild(row);
  }
  list.onclick = (e)=>{
    const id=e.target.dataset.id; if(!id) return;
    let slots = Store.get('slots',[]).filter(s=>s.id!==id);
    Store.set('slots',slots);
    renderSlots();
  }

  el('#addSlot').onclick = ()=>{
    const d = el('#slotDate').value;
    const t = el('#slotTime').value;
    if(!d||!t) { alert('Termin został dodany!'); return;}
    const iso = new Date(`${d}T${t}:00`).toISOString();
    const slots = Store.get('slots',[]);
    slots.push({id:Store.uid(), when:iso});
    Store.set('slots',slots);
    renderSlots();
  }
}

function renderServices(){
  const services = Store.get('services',[]);
  const tbody=el('#servicesBody');
  tbody.innerHTML='';
  for(const s of services){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${s.durationMin} min</td><td>${fmtMoney(s.price)}</td>
    <td class='inline'><button class='btn secondary' data-act='edit' data-id='${s.id}'>Edytuj</button>
    <button class='btn danger' data-act='del' data-id='${s.id}'>Usuń</button></td>`;
    tbody.appendChild(tr);
  }
  el('#addService').onclick=()=>{
    const name=prompt('Nazwa usługi:');
    if(!name) return;
    const duration=parseInt(prompt('Czas trwania (min):')||'60',10);
    const price=parseInt(prompt('Cena (PLN):')||'180',10);
    const list=Store.get('services',[]);
    list.push({id:Store.uid(), name, durationMin:duration, price});
    Store.set('services',list); renderServices();
  };
  tbody.onclick=(e)=>{
    const id=e.target.dataset.id, act=e.target.dataset.act;
    if(!id) return;
    let list=Store.get('services',[]);
    if(act==='del'){ list=list.filter(x=>x.id!==id); Store.set('services',list); renderServices(); }
    if(act==='edit'){
      const s=list.find(x=>x.id===id);
      const name=prompt('Nazwa',s.name)||s.name;
      const duration=parseInt(prompt('Czas (min)',s.durationMin)||s.durationMin,10);
      const price=parseInt(prompt('Cena (PLN)',s.price)||s.price,10);
      list=list.map(x=> x.id===id? {...x,name,durationMin:duration,price}:x);
      Store.set('services',list); renderServices();
    }
  };
}

function renderClients(){
  const wrap=el('#clientsList');
  const clients=Store.get('clients',[]);
  wrap.innerHTML = clients.length? '' : '<div class="notice">Brak klientów.</div>';
  for(const c of clients){
    const div=document.createElement('div'); div.className='listItem';
    div.innerHTML=`<div class='inline' style='justify-content:space-between'>
      <div><b>${c.name}</b> <span class='meta'>${c.email} • ${c.phone}</span></div>
      <button class='btn secondary' data-id='${c.id}'>Otwórz</button>
    </div>`;
    wrap.appendChild(div);
  }
  wrap.onclick=(e)=>{
    const id=e.target.dataset.id; if(!id) return;
    openClient(id);
  }
}

function openClient(id){
  const c = Store.get('clients',[]).find(x=>x.id===id);
  if(!c) return;
  el('#clientName').textContent=c.name;
  el('#cEmail').value=c.email||'';
  el('#cPhone').value=c.phone||'';
  el('#cAddress').value=c.address||'';
  el('#cNotes').value=c.notesGeneral||'';
  el('#cPrefAll').value=c?.preferences?.allergies||'';
  el('#cPrefMassage').value=c?.preferences?.massage||'';
  el('#cPrefHealth').value=c?.preferences?.health||'';
  el('#cPrefMental').value=c?.preferences?.mental||'';

  // History
  const histWrap=el('#historyBody'); histWrap.innerHTML='';
  const bookings = Store.get('bookings',[]).filter(b=>b.clientId===id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const services = Store.get('services',[]);
  for(const b of bookings){
    const srv=services.find(s=>s.id===b.serviceId)||{name:'(usługa)'};
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${fmtDate(b.createdAt)}</td><td>${srv.name}</td><td>${b.notes||''}</td><td>${b.status||''}</td>`;
    histWrap.appendChild(tr);
  }

  // Suggestion (simple: based on last note & preferences)
  const suggest = [];
  if(c?.preferences?.massage) suggest.push('Preferencje: '+c.preferences.massage);
  if(c?.preferences?.health) suggest.push('Stan zdrowia: '+c.preferences.health);
  const last = bookings[0]?.notes; if(last) suggest.push('Ostatnia notatka: '+last);
  const rec = 'Na kolejnym spotkaniu skoncentrować się na obszarach napięciowych, w szczególności: kark/plecy. Włączyć techniki rozluźniające i rozciąganie. Ocenić reakcję na bodźce i dobrać nacisk.';
  el('#clientSuggestion').textContent = (suggest.concat([rec])).join(' \n• ');

  el('#clientModal').style.display='block';
  el('#clientModal').dataset.id=id;
}

function saveClient(){
  const id=el('#clientModal').dataset.id;
  let list=Store.get('clients',[]);
  list=list.map(c=> c.id===id? {
    ...c,
    email:el('#cEmail').value.trim(),
    phone:el('#cPhone').value.trim(),
    address:el('#cAddress').value.trim(),
    notesGeneral:el('#cNotes').value.trim(),
    preferences:{
      allergies:el('#cPrefAll').value.trim(),
      massage:el('#cPrefMassage').value.trim(),
      health:el('#cPrefHealth').value.trim(),
      mental:el('#cPrefMental').value.trim(),
    }
  }:c);
  Store.set('clients',list);
  alert('Zapisano profil klienta');
  renderClients();
}

function renderSettings(){
  const s=Store.get('settings',{});
  el('#setEmail').value=s.contactEmail||'';
  el('#setTel').value=s.contactTel||'';
  el('#setRodo').value=s.rodoText||'';
  el('#setPIN').value=Store.get('pin','2505');
}

function saveSettings(){
  const s={
    contactEmail:el('#setEmail').value.trim(),
    contactTel:el('#setTel').value.trim(),
    rodoText:el('#setRodo').value.trim()
  };
  Store.set('settings',s);
  Store.set('pin', el('#setPIN').value.trim()||'2505');
  alert('Zapisano ustawienia');
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Wire login
  el('#loginBtn').onclick=login;
  el('#logoutBtn').onclick=logout;
  // Save client/settings
  el('#saveClientBtn').onclick=saveClient;
  el('#closeClientBtn').onclick=()=> el('#clientModal').style.display='none';
  el('#saveSettingsBtn').onclick=saveSettings;
  // Min date for slot picker
  const today = new Date().toISOString().slice(0,10);
  el('#slotDate').setAttribute('min', today);
  requireAuth();
});
// ===== ADMIN: Wolne terminy (ISO) + Rezerwacje (termin wizyty) =====
(() => {
  if (window.__adminPatchInstalled) return;
  window.__adminPatchInstalled = true;

  // ---------- Wolne terminy ----------
  const elDate = document.querySelector('#slotDate');   // <input type="date">
  const elTime = document.querySelector('#slotTime');   // <input type="time">
  const btnAdd = document.querySelector('#addSlot');    // button "Dodaj termin"
  const slotsList = document.querySelector('#slotsList'); // kontener listy

  function loadSlots(){ try { return JSON.parse(localStorage.getItem('availableSlots')||'[]'); } catch { return []; } }
  function saveSlots(a){ localStorage.setItem('availableSlots', JSON.stringify(a)); }

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;   // YYYY-MM-DD
  const ISO_TIME = /^\d{2}:\d{2}$/;         // HH:MM

  function isValidIso(d,t){
    if (!ISO_DATE.test(d||'') || !ISO_TIME.test(t||'')) return false;
    const x = new Date(`${d}T${t}:00`);
    return !Number.isNaN(x.getTime());
  }

  function purgeBrokenSlots(){
    const cleaned = loadSlots().filter(s => isValidIso(s?.date, s?.time));
    saveSlots(cleaned);
  }

  function renderSlots(){
    const slots = loadSlots().sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));
    if (!slotsList) return;
    slotsList.innerHTML = '';
    slots.forEach((s, idx) => {
      const pretty = new Date(`${s.date}T${s.time}:00`).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
      const row = document.createElement('div');
      row.className = 'slotItem row';
      row.dataset.date = s.date;
      row.dataset.time = s.time;
      row.innerHTML = `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div><strong>${pretty}</strong></div>
          <button class="btn btn-danger removeSlot" data-index="${idx}">Usuń</button>
        </div>
      `;
      slotsList.appendChild(row);
    });
  }

  function addSlot(){
    const date = (elDate?.value || '').trim();
    const time = (elTime?.value || '').trim();

    if (!isValidIso(date, time)) {
      alert('Wybierz datę i godzinę (format YYYY-MM-DD i HH:MM).');
      return;
    }
    const arr = loadSlots();
    if (arr.some(s => s.date === date && s.time === time)) {
      alert('Taki termin już istnieje.');
      return;
    }
    arr.push({ date, time });
    saveSlots(arr);
    renderSlots();
  }

  slotsList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.removeSlot');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    const arr = loadSlots();
    if (Number.isFinite(idx)) {
      arr.splice(idx, 1);
      saveSlots(arr);
      renderSlots();
    }
  });

  btnAdd?.addEventListener('click', addSlot);

  // ---------- Rezerwacje (dashboard) ----------
  const upcomingBox = document.querySelector('#upcoming');

  function loadBookings(){ try { return JSON.parse(localStorage.getItem('bookings')||'[]'); } catch { return []; } }
  function saveBookings(a){ localStorage.setItem('bookings', JSON.stringify(a)); }

  function toVisitDate(b){
    if (!b?.date || !b?.time) return null;
    const d = new Date(`${b.date}T${b.time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function purgeBadBookings(){
    const cleaned = loadBookings().filter(b => !!toVisitDate(b));
    saveBookings(cleaned);
  }

  function renderBookings(){
    if (!upcomingBox) return;
    const arr = loadBookings()
      .map(b => ({ ...b, _dt: toVisitDate(b) }))
      .filter(b => b._dt)
      .sort((a,b) => a._dt - b._dt);

    upcomingBox.innerHTML = '';
    arr.forEach(b => {
      const pretty = b._dt.toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.date = b.date;
      card.dataset.time = b.time;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <strong>${pretty}</strong> — ${b.service || 'Zabieg'}
            <div style="opacity:.8">
              ${b.client?.name || ''} (${b.client?.email || ''}${b.client?.phone ? ', ' + b.client.phone : ''})
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <span class="badge">${b.status || 'Oczekująca'}</span>
            <button class="btn btn-success confirm">Potwierdź</button>
            <button class="btn btn-danger remove">Usuń</button>
          </div>
        </div>
      `;
      upcomingBox.appendChild(card);
    });
  }

  upcomingBox?.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const date = card.dataset.date, time = card.dataset.time;

    if (e.target.closest('.remove')) {
      const filtered = loadBookings().filter(b => !(b.date === date && b.time === time));
      saveBookings(filtered);
      renderBookings();
      return;
    }

    if (e.target.closest('.confirm')) {
      const all = loadBookings();
      const idx = all.findIndex(b => b.date === date && b.time === time);
      if (idx !== -1) {
        all[idx].status = 'Potwierdzona';
        saveBookings(all);
        renderBookings();
        // tu ewentualnie można dodać wysyłkę maila do klienta
      }
    }
  });

  // ---------- Start + auto-odświeżanie ----------
  function start(){
    purgeBrokenSlots(); renderSlots();
    purgeBadBookings(); renderBookings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // reaguj na zmiany z klienta (inna karta/okno)
  window.addEventListener('storage', (e) => {
    if (['availableSlots','slots','freeSlots'].includes(e.key)) {
      purgeBrokenSlots(); renderSlots();
    }
    if (['bookings'].includes(e.key)) {
      purgeBadBookings(); renderBookings();
    }
  });
})();
// ===== [HOTFIX ADMIN] naprawa "Invalid Date", duplikatów i starych kluczy =====
(() => {
  if (window.__ADMIN_HOTFIX__) return; window.__ADMIN_HOTFIX__ = true;

  const STORAGE_KEYS = ['availableSlots','slots','freeSlots'];
  const TARGET_KEY = 'availableSlots';

  // -- bezpieczne parse
  function safeParse(s, fb){ try { return JSON.parse(s); } catch { return fb; } }
  function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

  // -- normalizacja pojedynczego slotu -> {date:'YYYY-MM-DD', time:'HH:MM'} lub null
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  function normSlot(s){
    if (!s) return null;
    let d = (s.date || '').trim();
    let t = (s.time || '').trim();
    // podetnij HH:MM:SS -> HH:MM
    if (t.length >= 5) t = t.slice(0,5);
    // spróbuj rozpoznać datę, jeśli nie w ISO
    if (!ISO_DATE.test(d)) {
      // czasem bywa dd.mm.yyyy albo yyyy/mm/dd
      const dt = new Date(d);
      if (!Number.isNaN(dt.getTime())) {
        const yyyy = String(dt.getFullYear());
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const dd = String(dt.getDate()).padStart(2,'0');
        d = `${yyyy}-${mm}-${dd}`;
      }
    }
    // walidacja końcowa
    if (!ISO_DATE.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;
    const test = new Date(`${d}T${t}:00`);
    if (Number.isNaN(test.getTime())) return null;
    return { date: d, time: t };
  }

  // -- wczytaj z wielu kluczy, znormalizuj, zdeduplikuj
  function loadMergedSlots(){
    const bag = [];
    for (const k of STORAGE_KEYS){
      const arr = safeParse(localStorage.getItem(k), []);
      if (Array.isArray(arr)) bag.push(...arr);
    }
    const normed = bag.map(normSlot).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const s of normed){
      const key = `${s.date}T${s.time}`;
      if (!seen.has(key)){ seen.add(key); out.push(s); }
    }
    return out.sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  }

  function writeBackUnified(slots){
    // zawsze zapisuj tylko pod TARGET_KEY, a pozostałe wyczyść
    save(TARGET_KEY, slots);
    for (const k of STORAGE_KEYS){
      if (k !== TARGET_KEY) localStorage.removeItem(k);
    }
  }

  // -- render listy (działa z dowolnymi przyciskami Usuń)
  const list = document.querySelector('#slotsList');
  function pretty(dt){ return new Date(dt).toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'}); }
  function render(){
    if (!list) return;
    const slots = safeParse(localStorage.getItem(TARGET_KEY), []);
    list.innerHTML = '';
    slots.forEach((s, i)=>{
      const item = document.createElement('div');
      item.className = 'slotItem row';
      item.dataset.date = s.date;
      item.dataset.time = s.time;
      item.innerHTML = `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div><strong>${pretty(`${s.date}T${s.time}:00`)}</strong></div>
          <button class="btn btn-danger removeSlot" data-index="${i}">Usuń</button>
        </div>`;
      list.appendChild(item);
    });
  }

  // -- init: scalenie i naprawa
  (function initRepair(){
    const merged = loadMergedSlots();       // z wielu kluczy → lista OK
    writeBackUnified(merged);               // zapisz tylko do availableSlots
    render();
  })();

  // -- add: podmień obsługę "Dodaj termin" tak, żeby najpierw naprawiała
  const addBtn = document.querySelector('#addSlot');
  const inDate = document.querySelector('#slotDate');
  const inTime = document.querySelector('#slotTime');

  function addSlotFixed(){
    const merged = loadMergedSlots();
    writeBackUnified(merged); // jeszcze raz zsynchronizuj przed dodaniem

    const raw = { date: (inDate?.value||'').trim(), time: (inTime?.value||'').trim() };
    const s = normSlot(raw);
    if (!s){ alert('Wybierz poprawną datę (YYYY-MM-DD) i godzinę (HH:MM).'); return; }

    // duplikaty
    if (merged.some(x => x.date===s.date && x.time===s.time)){
      alert('Taki termin już istnieje.');
      return;
    }

    merged.push(s);
    merged.sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
    writeBackUnified(merged);
    render();
  }

  addBtn && addBtn.addEventListener('click', addSlotFixed);

  // -- usuwanie: delegacja na każdy przycisk "Usuń", niezależnie od klasy
  list && list.addEventListener('click', (e)=>{
    const card = e.target.closest('.slotItem');
    const btn = e.target.closest('button');
    if (!card || !btn) return;
    const d = card.dataset.date, t = card.dataset.time;
    const merged = loadMergedSlots();
    const idx = merged.findIndex(s => s.date===d && s.time===t);
    if (idx > -1){
      merged.splice(idx,1);
      writeBackUnified(merged);
      render();
    }
  });

  // -- auto-refresh gdy inna karta coś zmieni
  window.addEventListener('storage', (e)=>{
    if (STORAGE_KEYS.includes(e.key)) {
      const merged = loadMergedSlots();
      writeBackUnified(merged);
      render();
    }
  });
})();
