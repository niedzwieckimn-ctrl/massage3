
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
  renderConfirmed();
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
   card.innerHTML = `
  <div class="inline" style="justify-content:space-between">
    <div>
      <strong>${whenStr}</strong> — ${client.name || '—'}
    </div>
    <div>
      <span class="badge">${b.status || 'Oczekująca'}</span>
      <button class="btn small ghost" data-act="details" data-id="${b.id}">Szczegóły</button>
      <button class="btn small success" data-act="confirm" data-id="${b.id}">Potwierdź</button>
      <button class="btn small danger" data-act="delete" data-id="${b.id}">Usuń</button>
    </div>
  </div>
`;

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
function renderConfirmed() {
  const bookings = Store.get('bookings', [])
    .filter(b => b.status === 'Potwierdzona')
    .sort((a, b) => new Date(a.when) - new Date(b.when));

  const slots = Store.get('slots', []);
  const services = Store.get('services', []);
  const clients = Store.get('clients', []);

  const wrap = el('#confirmed');
  wrap.innerHTML = bookings.length ? '' : '<div class="notice">Brak potwierdzonych rezerwacji.</div>';

  for (const b of bookings) {
    const slot = slots.find(s => s.id === b.slotId);
    const service = services.find(s => s.id === b.serviceId) || {};
    const client = clients.find(c => c.id === b.clientId) || {};

    const whenStr = slot ? new Date(slot.when).toLocaleString('pl-PL') : '—';

    const card = document.createElement('div');
    card.className = 'listItem';
    card.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <div>
          <strong>${whenStr}</strong> — ${client.name || '—'}
        </div>
        <div>
          <span class="badge success">Potwierdzona</span>
          <button class="btn small ghost" data-act="details" data-id="${b.id}">Szczegóły</button>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  }
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
    if(!d||!t) { alert('Termin został dodany'); return;}
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
/* === AdminBookings module (doklej NA KOŃCU assets/admin.js) ============== */
(function AdminBookings(){
  // ------ LS helpers
  const LS = {
    get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set: (k, v)    => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del: (k)       => { try { localStorage.removeItem(k); } catch {} },
  };

  // ------ Klucze
  const KEY_BOOKINGS  = 'bookings';
  const KEY_SLOTS_ARR = 'FREE_SLOTS';     // zgodność wstecz [{date,time}]
  const KEY_SLOTS_MAP = 'ms_slots_v6';    // docelowo {"YYYY-MM-DD":["HH:MM",...]}

  // sprzątanie antyku (żeby nie mieszał)
  LS.del('FREE_SLOTS_V2');

  // ------ Slots API
  function loadSlotsArr(){
    const map = LS.get(KEY_SLOTS_MAP, null);
    if (map && typeof map === 'object'){
      const out = [];
      Object.keys(map).forEach(d => (map[d]||[]).forEach(t => out.push({date:d, time:t})));
      return out;
    }
    return LS.get(KEY_SLOTS_ARR, []);
  }
  function saveSlotsFromArr(arr){
    // zapisz w obu współczesnych formatach
    LS.set(KEY_SLOTS_ARR, arr);
    const map = {};
    arr.forEach(s => {
      if (!s?.date || !s?.time) return;
      (map[s.date] ||= []).push(s.time);
    });
    Object.keys(map).forEach(d => map[d].sort());
    LS.set(KEY_SLOTS_MAP, map);
    // usuń bardzo stary klucz
    LS.del('FREE_SLOTS_V2');
  }
  function removeSlot(date, time){
    const arr = loadSlotsArr().filter(s => !(s.date===date && s.time===time));
    saveSlotsFromArr(arr);
    // powiadom inne karty (index) o zmianie
    try{ window.dispatchEvent(new StorageEvent('storage', { key: KEY_SLOTS_MAP })); }catch{}
  }

  // ------ Bookings API
  const loadBookings = () => LS.get(KEY_BOOKINGS, []);
  const saveBookings = (a) => LS.set(KEY_BOOKINGS, Array.isArray(a)?a:[]);

  // ------ UI refs (nie wymagane do istnienia we wszystkich widokach)
  const elUpcoming  = document.getElementById('upcoming');
  const elConfirmed = document.getElementById('confirmed');
  const elSlotDate  = document.getElementById('slotDate');
  const elSlotTime  = document.getElementById('slotTime');
  const btnAddSlot  = document.getElementById('addSlot');
  const elSlotsList = document.getElementById('slotsList');

  // ------ Helpers
  function prettyDate(b){
    if (b.date && b.time){
      const d = new Date(`${b.date}T${b.time}:00`);
      if (!Number.isNaN(d.getTime()))
        return d.toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});
    }
    if (b.when){
      const d = new Date(b.when);
      if (!Number.isNaN(d.getTime()))
        return d.toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});
    }
    return '—';
  }

  // ------ Renderers
  function renderUpcoming(){
    if (!elUpcoming) return;
    const list = loadBookings()
      .filter(b => (b.status||'Oczekująca') !== 'Potwierdzona')
      .sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));

    elUpcoming.innerHTML = list.length ? list.map(b => {
      const p = prettyDate(b);
      const who = [b.client?.name, b.client?.phone, b.client?.email].filter(Boolean).join(' • ');
      return `
        <div class="card" data-id="${b.id}">
          <div class="inline" style="justify-content:space-between;gap:12px">
            <div>
              <div><strong>${p}</strong> — ${b.service || 'Zabieg'}</div>
              ${who ? `<div class="muted">${who}</div>` : ``}
              ${b.client?.address ? `<div class="muted">${b.client.address}</div>` : ``}
              ${b.notes ? `<div class="muted"><em>${b.notes}</em></div>` : ``}
            </div>
            <div class="inline" style="gap:8px">
              <span class="chip">${b.status || 'Oczekująca'}</span>
              <button class="btn"           data-action="details"  data-id="${b.id}">Szczegóły</button>
              <button class="btn success"   data-action="confirm"  data-id="${b.id}">Potwierdź</button>
              <button class="btn danger"    data-action="delete"   data-id="${b.id}">Usuń</button>
            </div>
          </div>
        </div>`;
    }).join('') : `<div class="muted">Brak rezerwacji do potwierdzenia.</div>`;
  }

  function renderConfirmed(){
    if (!elConfirmed) return;
    const list = loadBookings()
      .filter(b => (b.status||'').toLowerCase() === 'potwierdzona')
      .sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));

    elConfirmed.innerHTML = list.length ? list.map(b => {
      const p = prettyDate(b);
      const who = [b.client?.name, b.client?.phone, b.client?.email].filter(Boolean).join(' • ');
      return `
        <div class="card" data-id="${b.id}">
          <div class="inline" style="justify-content:space-between;gap:12px">
            <div>
              <div><strong>${p}</strong> — ${b.service || 'Zabieg'}</div>
              ${who ? `<div class="muted">${who}</div>` : ``}
              ${b.client?.address ? `<div class="muted">${b.client.address}</div>` : ``}
              ${b.notes ? `<div class="muted"><em>${b.notes}</em></div>` : ``}
            </div>
            <div class="inline" style="gap:8px">
              <span class="chip" style="background:#0a7a2f;color:#fff">Potwierdzona</span>
              <button class="btn" data-action="details" data-id="${b.id}">Szczegóły</button>
            </div>
          </div>
        </div>`;
    }).join('') : `<div class="muted">Brak potwierdzonych rezerwacji.</div>`;
  }

  function renderSlotsUI(){
    if (!elSlotDate || !elSlotTime || !elSlotsList) return;
    const arr = loadSlotsArr().sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
    // pickery (prosto: unikalne daty, a dla pierwszej – godziny)
    const dates = [...new Set(arr.map(s=>s.date))].sort();
    elSlotDate.innerHTML = dates.length
      ? dates.map(d=>`<option value="${d}">${new Date(d).toLocaleDateString('pl-PL',{dateStyle:'medium'})}</option>`).join('')
      : `<option value="">—</option>`;
    const first = dates[0] || '';
    const times = arr.filter(s=>s.date===first).map(s=>s.time);
    elSlotTime.innerHTML = times.length
      ? times.map(t=>`<option value="${t}">${t}</option>`).join('')
      : `<option value="">—</option>`;

    elSlotsList.innerHTML = arr.length ? arr.map(s=>{
      const pretty = new Date(`${s.date}T${s.time}:00`).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});
      return `<div class="inline" style="justify-content:space-between;border:1px solid #e5e5e5;border-radius:10px;padding:8px 10px;margin:6px 0">
        <div><strong>${pretty}</strong></div>
        <button class="btn danger" data-act="remove-slot" data-date="${s.date}" data-time="${s.time}">Usuń</button>
      </div>`;
    }).join('') : `<div class="muted">Brak wolnych terminów.</div>`;
  }

  function renderAll(){
    renderUpcoming();
    renderConfirmed();
    renderSlotsUI();
  }

  // ------ Modal „Szczegóły”
  function ensureModalRoot(){
    let root = document.getElementById('modalRoot');
    if (!root){
      root = document.createElement('div');
      root.id = 'modalRoot';
      root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:9999';
      document.body.appendChild(root);
      const s = document.createElement('style'); s.textContent = `
        .adm-modal{background:#fff;color:#111;width:min(560px,calc(100% - 32px));border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.35)}
        .adm-modal header{padding:14px 16px;border-bottom:1px solid #eee;font-weight:700}
        .adm-modal .content{padding:16px}
        .adm-modal .actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #eee}
      `; document.head.appendChild(s);
    }
    return root;
  }
  function showBookingDetails(b){
    const root = ensureModalRoot();
    const fallback = (() => {
      const p = prettyDate(b);
      return `
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 8px;color:#666;width:42%">Nr rezerwacji</td><td style="padding:6px 8px"><b>${b.id??'-'}</b></td></tr>
          <tr><td style="padding:6px 8px;color:#666">Status</td><td style="padding:6px 8px">${b.status||'Oczekująca'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Usługa</td><td style="padding:6px 8px">${b.service||'-'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Data i godzina</td><td style="padding:6px 8px">${p}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Klient</td><td style="padding:6px 8px">${b.client?.name||'-'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">E-mail</td><td style="padding:6px 8px">${b.client?.email||'-'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Telefon</td><td style="padding:6px 8px">${b.client?.phone||'-'}</td></tr>
          <tr><td style="padding:6px 8px;color:#666">Adres</td><td style="padding:6px 8px">${b.client?.address||'-'}</td></tr>
          ${b.notes ? `<tr><td style="padding:6px 8px;color:#666">Uwagi</td><td style="padding:6px 8px">${b.notes}</td></tr>` : ''}
        </table>
      `;
    })();
    const inner = (typeof b.detailsHtml === 'string' && b.detailsHtml.trim()) ? b.detailsHtml : fallback;

    root.innerHTML = `
      <div class="adm-modal" role="dialog" aria-modal="true">
        <header>Szczegóły rezerwacji</header>
        <div class="content">${inner}</div>
        <div class="actions"><button class="btn" data-close>Zamknij</button></div>
      </div>`;
    root.style.display = 'flex';
    const onClick = (e)=>{
      if (e.target === root || e.target.closest('[data-close]')) {
        root.style.display = 'none'; root.innerHTML = ''; root.removeEventListener('click', onClick);
      }
    };
    root.addEventListener('click', onClick);
  }

  // ------ Wysyłka maila do klienta po potwierdzeniu
  async function sendConfirmEmail(b){
    try{
      const pretty = prettyDate(b);
      const html = b.detailsHtml || `
        <h2>Twoja wizyta została potwierdzona</h2>
        <p><b>Usługa:</b> ${b.service||'-'}</p>
        <p><b>Termin:</b> ${pretty}</p>
        ${b.notes ? `<p><b>Uwagi:</b> ${b.notes}</p>` : ''}
      `;
      const payload = { to: b.client?.email || '', subject: `Potwierdzenie wizyty — ${pretty}`, html };
      const r = await fetch('/.netlify/functions/send-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      return r.ok;
    }catch(_){ return false; }
  }

  // ------ Delegacja klików
  document.addEventListener('click', async (e)=>{
    // usuwanie slotu (Wolne terminy)
    const rm = e.target.closest('[data-act="remove-slot"]');
    if (rm){
      removeSlot(rm.dataset.date, rm.dataset.time);
      renderSlotsUI();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const all = loadBookings();
    const i = all.findIndex(b => String(b.id) === String(id));
    if (i < 0) return;

    if (btn.dataset.action === 'details'){
      showBookingDetails(all[i]);
      return;
    }

    if (btn.dataset.action === 'delete'){
      if (!confirm('Usunąć rezerwację?')) return;
      const b = all[i];
      all.splice(i,1);
      saveBookings(all);
      // (opcjonalnie) przywróć slot jeśli usuwamy niepotwierdzoną
      if ((b.status||'') !== 'Potwierdzona' && b.date && b.time){
        const arr = loadSlotsArr();
        if (!arr.some(s=>s.date===b.date && s.time===b.time)){
          arr.push({date:b.date, time:b.time});
          saveSlotsFromArr(arr);
        }
      }
      renderAll();
      return;
    }

    if (btn.dataset.action === 'confirm'){
      const b = all[i];

      // uzupełnij datę/godzinę jeśli brakuje (np. przyszło tylko "when")
      if (!b.date || !b.time){
        const cand = b.when || b.startDateTime || (b.slot && b.slot.when) || null;
        if (cand){
          const d = new Date(cand);
          if (!Number.isNaN(d.getTime())){
            b.date = d.toISOString().slice(0,10);
            b.time = d.toTimeString().slice(0,5);
          }
        }
      }

      b.status = 'Potwierdzona';
      b.confirmedAt = new Date().toISOString();
      all[i] = b;
      saveBookings(all);

      // zdejmij slot z Wolnych terminów
      if (b.date && b.time) removeSlot(b.date, b.time);

      const ok = await sendConfirmEmail(b);
      (window.showSuccess || window.alert)( ok
        ? 'Potwierdzono i wysłano e-mail do klienta.'
        : 'Potwierdzono. Wysyłka e-mail do klienta nie powiodła się.'
      );

      renderAll();
      return;
    }
  });

  // ------ Add slot (Wolne Terminy)
  btnAddSlot && btnAddSlot.addEventListener('click', ()=>{
    const d = (elSlotDate?.value || '').trim();
    const t = (elSlotTime?.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) {
      (window.showError || window.alert)('Wybierz poprawną datę i godzinę.');
      return;
    }
    const arr = loadSlotsArr();
    if (arr.some(s=>s.date===d && s.time===t)){
      (window.showWarn || window.alert)('Taki termin już istnieje.');
      return;
    }
    arr.push({date:d, time:t});
    saveSlotsFromArr(arr);
    renderSlotsUI();
  });

  // ------ Init
  document.addEventListener('DOMContentLoaded', renderAll);
  window.addEventListener('storage', (e)=>{
    if ([KEY_BOOKINGS, KEY_SLOTS_MAP, KEY_SLOTS_ARR, 'FREE_SLOTS_V2'].includes(e.key)) renderAll();
  });
})();
