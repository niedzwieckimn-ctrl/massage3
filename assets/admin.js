function el(s,r=document){return r.querySelector(s)}
function els(s,r=document){return [...r.querySelectorAll(s)]}
function fmtMoney(v){return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(v);}
function fmtDate(d){return new Date(d).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'})}

// --- Sesja
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

// --- Migracja slotów (na wszelki wypadek)
function migrateSlots(){
  let slots = Store.get('slots',[]) || [];
  let changed = false;
  slots = slots.map(s=>{
    const when = s.when || (s.date && s.time ? `${s.date}T${String(s.time).slice(0,5)}:00` : null);
    if(!when) return s;
    const iso = new Date(when).toISOString();
    if(!s.id || !s.when){ changed=true; }
    return { id: s.id || Store.uid(), when: iso };
  }).filter(s=>s && s.when && !Number.isNaN(new Date(s.when).getTime()));
  // dedup po when
  const seen=new Set(), out=[];
  for(const s of slots){ if(seen.has(s.when)) {changed=true; continue;} seen.add(s.when); out.push(s); }
  if(changed) Store.set('slots', out.sort((a,b)=> new Date(a.when)-new Date(b.when)));
}

// --- Render All
function renderAll(){
  renderUpcoming();
  renderConfirmed();
  renderSlots();
  renderServices();
  renderClients();
  renderSettings();
}

// --- Rezerwacje (Oczekujące)
function renderUpcoming(){
  const bookings = Store.get('bookings',[]);
  const slots    = Store.get('slots',[]);
  const services = Store.get('services',[]);
  const clients  = Store.get('clients',[]);
  const items = bookings.map(b=>{
    const slot = slots.find(s=>s.id===b.slotId) || {};
    const service = services.find(s=>s.id===b.serviceId) || {};
    const client = clients.find(c=>c.id===b.clientId) || {};
    return {...b, when: slot.when, serviceName: service.name, clientName: client.name};
  }).sort((a,b)=> new Date(a.when||0)-new Date(b.when||0));

  const wrap = el('#upcoming');
  wrap.innerHTML = items.length? '' : '<div class="notice">Brak rezerwacji.</div>';

  for(const it of items){
    const whenStr = it.when ? new Date(it.when).toLocaleString('pl-PL') : '—';
    const card = document.createElement('div');
    card.className='listItem';
    card.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <div><strong>${whenStr}</strong> — ${it.clientName || '—'} (Nr: ${it.bookingNo||''})</div>

        <div>
          <span class="badge">${it.status || 'Oczekująca'}</span>
          <button class="btn small ghost"   data-act="details" data-id="${it.id}">Szczegóły</button>
          <button class="btn small success" data-act="confirm" data-id="${it.id}">Potwierdź</button>
          <button class="btn small danger"  data-act="delete"  data-id="${it.id}">Usuń</button>
        </div>
      </div>`;
    wrap.appendChild(card);
  }

  wrap.onclick = async (e)=>{
    const id  = e.target.dataset.id;
    const act = e.target.dataset.act;
    if(!id || !act) return;

    let list = Store.get('bookings',[]);
    const i  = list.findIndex(b=>b.id===id);
    if(i<0) return;
    const b = list[i];

    if(act==='details'){ openClient(b.clientId); return; }

    if(act==='delete'){
      if(!confirm('Usunąć rezerwację?')) return;
      list.splice(i,1);
      Store.set('bookings',list);
      renderAll(); return;
    }

    if(act==='confirm'){
      b.status='Potwierdzona'; b.confirmedAt=new Date().toISOString();
      list[i]=b; Store.set('bookings',list);
      try{ await sendConfirmEmail(b); }catch(_){}
      renderAll(); return;
    }
  };
}

// --- Rezerwacje (Potwierdzone)
function renderConfirmed(){
  const bookings = Store.get('bookings',[])
    .filter(b => (b.status||'').toLowerCase().includes('potwierdz'));
  const slots    = Store.get('slots',[]);
  const services = Store.get('services',[]);
  const clients  = Store.get('clients',[]);

  const items = bookings.map(b=>{
    const slot = slots.find(s=>s.id===b.slotId) || {};
    const service = services.find(s=>s.id===b.serviceId) || {};
    const client = clients.find(c=>c.id===b.clientId) || {};
    return {...b, when: slot.when, serviceName: service.name, clientName: client.name};
  }).filter(it=>!!it.when)
    .sort((a,b)=> new Date(a.when)-new Date(b.when));

  const wrap = el('#confirmed');
  wrap.innerHTML = items.length? '' : '<div class="notice">Brak potwierdzonych rezerwacji.</div>';
  for(const it of items){
    const whenStr = new Date(it.when).toLocaleString('pl-PL');
    const card = document.createElement('div');
    card.className='listItem';
    card.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <div><strong>${whenStr}</strong> — ${it.clientName || '—'}</div>
        <div><span class="badge success">Potwierdzona</span>
             <button class="btn small ghost" data-act="details" data-id="${it.id}">Szczegóły</button></div>
      </div>`;
    wrap.appendChild(card);
  }
}

// --- Wolne terminy
function renderSlots(){
  const list  = el('#slotsList');
  const slots = (Store.get('slots',[])||[]).sort((a,b)=> new Date(a.when)-new Date(b.when));
  list.innerHTML = slots.length? '' : '<div class="notice">Brak dodanych terminów.</div>';
  for(const s of slots){
    const row = document.createElement('div');
    row.className='listItem inline'; row.style.justifyContent='space-between';
    row.innerHTML = `<div><b>${fmtDate(s.when)}</b></div>
      <div class='inline'><button class='btn danger' data-id='${s.id||''}' data-when='${s.when}'>Usuń</button></div>`;
    list.appendChild(row);
  }
  list.onclick = (e)=>{
    const btn = e.target.closest('button[data-when]'); if(!btn) return;
    const id = btn.dataset.id, when = btn.dataset.when;
    let slots = Store.get('slots',[]);
    slots = id ? slots.filter(s=>s.id!==id) : slots.filter(s=>s.when!==when);
    Store.set('slots',slots); renderSlots();
  };

  el('#addSlot').onclick = ()=>{
    const d = el('#slotDate').value.trim();
    const t = el('#slotTime').value.trim().slice(0,5);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)){
      alert('Podaj poprawną datę i godzinę.'); return;
    }
    const iso = new Date(`${d}T${t}:00`).toISOString();
    let slots = Store.get('slots',[]);
    if(slots.some(s=>s.when===iso)){ alert('Taki termin już istnieje!'); return; }
    slots.push({id:Store.uid(), when:iso});
    slots.sort((a,b)=> new Date(a.when)-new Date(b.when));
    Store.set('slots',slots);
    el('#slotDate').value=''; el('#slotTime').value='';
    renderSlots();
  };
}

// --- Usługi
function renderServices(){
  const services = Store.get('services',[]);
  const tbody=el('#servicesBody'); tbody.innerHTML='';
  for(const s of services){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${s.durationMin} min</td><td>${fmtMoney(s.price)}</td>
    <td class='inline'><button class='btn secondary' data-act='edit' data-id='${s.id}'>Edytuj</button>
    <button class='btn danger' data-act='del' data-id='${s.id}'>Usuń</button></td>`;
    tbody.appendChild(tr);
  }
  el('#addService').onclick=()=>{
    const name=prompt('Nazwa usługi:'); if(!name) return;
    const duration=parseInt(prompt('Czas trwania (min):')||'60',10);
    const price=parseInt(prompt('Cena (PLN):')||'180',10);
    const list=Store.get('services',[]);
    list.push({id:Store.uid(), name, durationMin:duration, price});
    Store.set('services',list); renderServices();
  };
  tbody.onclick=(e)=>{
    const id=e.target.dataset.id, act=e.target.dataset.act; if(!id) return;
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

// --- Klienci
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
  wrap.onclick=(e)=>{ const id=e.target.dataset.id; if(id) openClient(id); }
}
function openClient(id){
  const c = Store.get('clients',[]).find(x=>x.id===id); if(!c) return;
  el('#clientName').textContent=c.name;
  el('#cEmail').value=c.email||''; el('#cPhone').value=c.phone||'';
  el('#cAddress').value=c.address||'';
  el('#cNotes').value=c.notesGeneral||'';
  el('#cPrefAll').value=c?.preferences?.allergies||'';
  el('#cPrefMassage').value=c?.preferences?.massage||'';
  el('#cPrefHealth').value=c?.preferences?.health||'';
  el('#cPrefMental').value=c?.preferences?.mental||'';
  // Historia
  const histWrap=el('#historyBody'); histWrap.innerHTML='';
  const bookings = Store.get('bookings',[]).filter(b=>b.clientId===id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const services = Store.get('services',[]);
  for(const b of bookings){
    const srv=services.find(s=>s.id===b.serviceId)||{name:'(usługa)'};
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${fmtDate(b.createdAt)}</td><td>${srv.name}</td><td>${b.notes||''}</td><td>${b.status||''}</td>`;
    histWrap.appendChild(tr);
  }
  // Sugestie
  const suggest=[]; if(c?.preferences?.massage) suggest.push('Preferencje: '+c.preferences.massage);
  if(c?.preferences?.health) suggest.push('Stan zdrowia: '+c.preferences.health);
  const last = bookings[0]?.notes; if(last) suggest.push('Ostatnia notatka: '+last);
  const rec='Na kolejnym spotkaniu skoncentrować się na obszarach napięciowych.';
  el('#clientSuggestion').textContent=(suggest.concat([rec])).join(' \n• ');
  el('#clientModal').style.display='block'; el('#clientModal').dataset.id=id;
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

// --- Ustawienia
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

// --- Mail potwierdzający (Netlify)
async function sendConfirmEmail(b){
  try{
    const slots = Store.get('slots',[]);
    const clients = Store.get('clients',[]);
    const services = Store.get('services',[]);

    const slot    = slots.find(s=>s.id===b.slotId);
    const client  = clients.find(c=>c.id===b.clientId) || {};
    const service = services.find(s=>s.id===b.serviceId) || {};

    if (!client.email) return false;

    const whenStr = slot ? new Date(slot.when).toLocaleString('pl-PL',
                     { dateStyle:'full', timeStyle:'short' }) : '';

    const html = `
      <h2>Potwierdzenie rezerwacji</h2>
      <p><b>Nr rezerwacji:</b> ${b.bookingNo || ''}</p>
      <p><b>Usługa:</b> ${service.name || '-'}</p>
      <p><b>Termin:</b> ${whenStr}</p>
      ${b.notes ? `<p><b>Uwagi klienta:</b> ${b.notes}</p>` : ''}
      <hr>
      <p><b>Aby wizyta była jak najbardziej komfortowa:</b></p>
      <ul>
        <li>Zadbaj o świeżą higienę osobistą.</li>
        <li>Nie jedz obficie tuż przed masażem.</li>
        <li>Nie używaj kremów tuż przed wizytą.</li>
        <li>Poinformuj nas o ewentualnych alergiach.</li>
      </ul>
      <p>Do zobaczenia w Massage & SPA!</p>
    `;

    const r = await fetch('/.netlify/functions/send-email', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        to: [client.email, 'THERAPIST'],   // ← klient + masażystka
        subject: `Potwierdzenie wizyty — ${whenStr}`,
        html
      })
    });
    return r.ok;
  }catch(_){ return false; }
}


// --- Init
document.addEventListener('DOMContentLoaded', ()=>{
  migrateSlots(); // defensywnie
  el('#loginBtn').onclick=login;
  el('#logoutBtn').onclick=logout;
  el('#saveClientBtn').onclick=saveClient;
  el('#closeClientBtn').onclick=()=> el('#clientModal').style.display='none';
  el('#saveSettingsBtn').onclick=saveSettings;
  el('#slotDate').setAttribute('min', new Date().toISOString().slice(0,10));
  requireAuth();
});
