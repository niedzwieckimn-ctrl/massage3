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
// === SUPABASE helpers (admin) ===
async function dbLoadServices(){
  const { data, error } = await sb.from('services')
    .select('*').order('name', { ascending: true });
  if(error){ console.error('DB services', error); return []; }
  return data || [];
}

async function dbUpsertService(svc){
  const { error } = await sb.from('services').upsert(svc, { onConflict: 'id' });
  if(error) throw error;
}

async function dbDeleteService(id){
  const { error } = await sb.from('services').delete().eq('id', id);
  if(error) throw error;
}

async function dbLoadSlots(){
  const { data, error } = await sb.from('slots')
    .select('id, when, taken').order('when', { ascending: true });
  if(error){ console.error('DB slots', error); return []; }
  return data || [];
}

async function dbAddSlot(iso){
  const id = crypto.randomUUID();
  const { error } = await sb.from('slots').insert({ id, when: iso, taken: false });
  if(error) throw error;
  return id;
}

async function dbDeleteSlot(id){
  const { error } = await sb.from('slots').delete().eq('id', id);
  if(error) throw error;
}

async function dbLoadBookings(){
  const { data, error } = await sb.from('bookings')
    .select('*').order('createdAt', { ascending: false });
  if(error){ console.error('DB bookings', error); return []; }
  return data || [];
}

async function dbUpdateBooking(id, patch){
  const { error } = await sb.from('bookings').update(patch).eq('id', id);
  if(error) throw error;
}

async function dbLoadClients(){
  const { data, error } = await sb.from('clients')
    .select('*').order('name', { ascending: true });
  if(error){ console.error('DB clients', error); return []; }
  return data || [];
}

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
// Lista slotów (tylko wolne)
async function renderSlots(){
  const list = document.getElementById('slotsList');
  if (!list) return;

  list.innerHTML = '<div class="notice">Ładowanie…</div>';

  const slots = await dbLoadSlots();
  const free = slots.filter(s => !s.taken);

  if (!free.length){
    list.innerHTML = '<div class="notice">Brak dodanych terminów.</div>';
    return;
  }

  list.innerHTML = '';
  free.forEach(s=>{
    const dstr = new Date(s.when).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div><b>${dstr}</b></div>
      <div class="inline">
        <button class="btn danger" data-id="${s.id}">Usuń</button>
      </div>
    `;
    list.appendChild(row);
  });

  // klik "Usuń"
  list.onclick = async (e)=>{
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    if (!confirm('Usunąć ten termin?')) return;
    try{
      await dbDeleteSlot(btn.dataset.id);
      await renderSlots();
    }catch(err){ alert('Błąd usuwania'); console.error(err); }
  };
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
document.addEventListener('DOMContentLoaded', () => {
  // handler przycisku „Dodaj termin”
  const addBtn = document.getElementById('addSlot');
  if (addBtn)
  // Dodawanie slota (po kliknięciu przycisku)
async function onAddSlot(e){
  e?.preventDefault?.();
  const d = document.getElementById('slotDate').value.trim(); // YYYY-MM-DD
  const t = document.getElementById('slotTime').value.trim(); // HH:MM
  if (!d || !t){ alert('Wybierz datę i godzinę'); return; }

  const iso = new Date(`${d}T${t}:00`).toISOString();
  try{
    await dbAddSlot(iso);
    document.getElementById('slotDate').value = '';
    document.getElementById('slotTime').value = '';
    await renderSlots();
  }catch(err){ alert('Nie udało się dodać'); console.error(err); }
}
{
    // upewnij się, że to nie jest submit formularza
    addBtn.setAttribute('type', 'button');
    addBtn.addEventListener('click', onAddSlot);
  }

  // pierwszy render listy terminów
  renderSlots();
});


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

// --- Wolne terminy (Supabase) ---
async function renderSlots(){
  const list = el('#slotsList');
  list.innerHTML = '<div class="notice">Ładowanie…</div>';

  const { data: slots, error } = await sb
    .from('slots')
    .select('*')
    .eq('taken', false)
    .order('when', { ascending: true });

  if (error) {
    console.error(error);
    list.innerHTML = '<div class="notice">Błąd pobierania terminów.</div>';
    return;
  }

  if (!slots.length){
    list.innerHTML = '<div class="notice">Brak dodanych terminów.</div>';
    return;
  }

  list.innerHTML = '';
  for (const s of slots){
    const d = new Date(s.when).toLocaleString('pl-PL');
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div class="inline"><b>${d}</b></div>
      <div class="inline">
        <button class="btn danger" data-id="${s.id}">Usuń</button>
      </div>
    `;
    list.appendChild(row);
  }

  // delegacja: klik "Usuń"
  list.onclick = async (e)=>{
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('Na pewno usunąć ten termin?')) return;

    const { error } = await sb.from('slots').delete().eq('id', id);
    if (error){ alert('Błąd przy usuwaniu'); console.error(error); return; }
    renderSlots();
  };
}
// Dodaj termin (Supabase)
el('#addSlot').onclick = async ()=>{
  const d = el('#slotDate').value.trim();   // yyyy-mm-dd
  const t = el('#slotTime').value.trim();   // hh:mm
  if (!d || !t){ alert('Wybierz datę i godzinę'); return; }

  const whenISO = new Date(`${d}T${t}:00`).toISOString();

  // próbujemy wstawić termin; unikalność pilnujemy po (when)
  const { error } = await sb.from('slots').insert([{ when: whenISO, taken: false }]);
  if (error){
    // jeśli dubluje się termin, Supabase zwróci błąd unikalności (jeśli dodasz uniq index)
    console.error(error);
    alert('Błąd przy dodawaniu terminu (może już istnieje)');
    return;
  }

  // wyczyść pola i odśwież listę
  el('#slotDate').value = '';
  el('#slotTime').value = '';
  renderSlots();
};


// --- Usługi (Supabase)
async function renderServices(){
  const services = await dbLoadServices();
  const tbody = document.getElementById('servicesBody');
  if (!tbody) return;

  if (!services.length){
    tbody.innerHTML = '<tr><td colspan="4">Brak usług.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  services.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.duration_min} min</td>
      <td>${Number(s.price).toFixed(2)} zł</td>
      <td class="inline">
        <button class="btn secondary" data-act="edit" data-id="${s.id}">Edytuj</button>
        <button class="btn danger" data-act="del" data-id="${s.id}">Usuń</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Klik "Dodaj usługę"
el('#addService').onclick = async () => {
  const name = prompt('Nazwa usługi:'); 
  if (!name) return;

  const duration = parseInt(prompt('Czas trwania (min):') || '60', 10);
  const price = parseFloat(prompt('Cena (PLN):') || '180', 10);

  const svc = {
    id: crypto.randomUUID(),
    name,
    duration_min: duration,
    price,
    active: true
  };

  try{
    await dbUpsertService(svc);
    await renderServices();
  }catch(err){
    alert('Nie udało się dodać usługi.');
    console.error(err);
  }
};
// Klik w przyciski Edytuj/Usuń (w tabeli usług)
document.getElementById('servicesBody').onclick = async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;

  if (act === 'del'){
    if (!confirm('Usunąć tę usługę?')) return;
    try{
      await dbDeleteService(id);
      await renderServices();
    }catch(err){
      alert('Błąd usuwania.');
      console.error(err);
    }
    return;
  }

  if (act === 'edit'){
    try{
      // pobierz aktualny rekord (prosto z DB)
      const current = (await dbLoadServices()).find(x => x.id === id);
      if (!current){ alert('Nie znaleziono usługi.'); return; }

      const name = prompt('Nazwa usługi:', current.name);
      if (!name) return;

      const duration = parseInt(prompt('Czas trwania (min):', current.duration_min) || current.duration_min, 10);
      const price = parseFloat(prompt('Cena (PLN):', current.price) || current.price, 10);

      await dbUpsertService({ id, name, duration_min: duration, price, active: true });
      await renderServices();
    }catch(err){
      alert('Błąd edycji.');
      console.error(err);
    }
  }
};


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
  `  // Sugestie
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

      const html = `<h2>Wizyta została potwierdzona </h2>
      <p><b>Usługa:</b> ${service.name||'-'}</p>
      <p><b>Termin:</b> ${whenStr}</p>
      ${b.notes ? `<p><b>Uwagi:</b> ${b.notes}</p>` : ''}
	  <hr>
<p><b>Aby wizyta była dla Ciebie jak najbardziej komfortowa i efektywna, prosimy o przygotowanie się według poniższych wskazówek:</b></p>
<ul style="margin-top:8px; margin-bottom:8px;">
  <li>Zadbaj o świeżą higienę osobistą, aby czuć się swobodnie i zrelaksowanie.</li>
  <li>Unikaj obfitych posiłków bezpośrednio przed masażem – dzięki temu ciało lepiej się odpręży.</li>
  <li>Nie stosuj balsamów ani kremów tuż przed wizytą, by olejki i techniki masażu działały w pełni.</li>
  <li>Poinformuj nas o ewentualnych alergiach, dolegliwościach lub szczególnych potrzebach – to pomoże nam zadbać o Twoje bezpieczeństwo.</li>
</ul>
<p>Dziękujemy za zaufanie i do zobaczenia w <b>Massage & SPA</b> 🌿</p>
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
document.addEventListener('DOMContentLoaded', async () => {
    // Załaduj listę usług z Supabase
    await renderServices();

    // Załaduj terminy z Supabase
    await renderSlots();

    // Obsługa przycisków
    el('#loginBtn').onclick = login;
    el('#logoutBtn').onclick = logout;
    el('#saveClientBtn').onclick = saveClient;
    el('#closeClientBtn').onclick = () => el('#clientModal').style.display = 'none';
    el('#saveSettingsBtn').onclick = saveSettings;

    const addBtn = document.getElementById('addSlot');
    if (addBtn){
        addBtn.setAttribute('type','button'); // żeby nie wysyłał formularza
        addBtn.addEventListener('click', onAddSlot);
    }
});
