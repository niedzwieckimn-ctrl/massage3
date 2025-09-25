/* =========================================================
   ADMIN — komplet pod Twój admin.html / store.js / adapter
   ========================================================= */

/* ---- Mini helpery UI ---- */
const $  = (sel, r=document)=> r.querySelector(sel);
const $$ = (sel, r=document)=> Array.from(r.querySelectorAll(sel));

const fmtMoney = (n)=> new Intl.NumberFormat('pl-PL',{ style:'currency', currency:'PLN', minimumFractionDigits:2 }).format(Number(n||0));
const fmtDate  = (iso)=> {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
};

/* ---- Sesja PIN ---- */
const Session = {
  isAuthed(){ return sessionStorage.getItem('adminAuthed')==='1'; },
  login(){    sessionStorage.setItem('adminAuthed','1'); },
  logout(){   sessionStorage.removeItem('adminAuthed'); }
};

/* ---- MIGRACJA SLOTÓW (bezpiecznik) ---- */
function migrateSlots(){
  let slots = Store.get('slots',[]) || [];
  if(!Array.isArray(slots)) slots = [];
  let changed=false;

  slots = slots.map(s=>{
    if(!s.id){ s.id = Store.uid(); changed=true; }
    if(s.when){
      const iso = new Date(s.when).toISOString();
      if(iso !== s.when){ s.when = iso; changed=true; }
    }
    if(typeof s.taken!=='boolean'){ s.taken = !!s.taken; changed=true; }
    return s;
  }).filter(s=> s.when && !Number.isNaN(new Date(s.when).getTime()));

  if(changed){
    slots.sort((a,b)=> new Date(a.when)-new Date(b.when));
    Store.set('slots', slots);
  }
}

/* =========================================================
   WOLNE TERMINY (SLOTS)
   ========================================================= */
function renderSlots(){
  const list = $('#slotsList');
  if(!list) return;

  const slots = (Store.get('slots',[]) || [])
    .sort((a,b)=> new Date(a.when)-new Date(b.when));

  list.innerHTML = slots.length ? '' : '<div class="notice">Brak dodanych terminów.</div>';

  for(const s of slots){
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div>${fmtDate(s.when)}</div>
      <div class="inline">
        <button class="btn danger" data-id="${s.id}" data-when="${s.when}">Usuń</button>
      </div>`;
    list.appendChild(row);
  }

  // Klik "Usuń" — TRWAŁE (Cloud → Local)
  list.onclick = async (e)=>{
    const btn = e.target.closest('button[data-when]');
    if(!btn) return;
    const id   = btn.dataset.id;
    const when = btn.dataset.when;

    // 1) Supabase (PRZED czyszczeniem localStorage, bo adapter czyta z localStorage)
    if(window.CloudSlots && typeof CloudSlots.deleteSlot === 'function'){
      try{
        await CloudSlots.deleteSlot(id);      // adapter znajdzie slot po id w localStorage i usunie po WHEN w bazie
        console.log('[admin] cloud delete OK', when);
      }catch(err){
        console.warn('[admin] cloud delete ERR', err);
      }
    }

    // 2) Lokalnie
    let curr = Store.get('slots',[]) || [];
    curr = curr.filter(x=> x.id!==id);
    Store.set('slots', curr);
    renderSlots();

    // 3) (opcjonalnie) dociągnij świeżą listę z chmury
    if(window.CloudSlots && typeof CloudSlots.pull==='function'){
      try{ await CloudSlots.pull(); }catch(_){}
    }
  };

  // Dodawanie nowego terminu
  const addBtn = $('#addSlot');
  if(addBtn && !addBtn._bound){
    addBtn._bound = true;
    addBtn.addEventListener('click', ()=>{
      const d = $('#slotDate')?.value.trim();
      const t = $('#slotTime')?.value.trim().slice(0,5);
      if(!d || !t || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)){
        alert('Podaj poprawną datę (rrrr-mm-dd) i godzinę (HH:MM)');
        return;
      }
      const iso = new Date(`${d}T${t}:00`).toISOString();

      // Local — antyduplikat
      let slots = Store.get('slots',[]) || [];
      if(slots.some(x=> x.when===iso)){ alert('Taki termin już istnieje'); return; }
      slots.push({ id: Store.uid(), when: iso, taken:false });
      slots.sort((a,b)=> new Date(a.when)-new Date(b.when));
      Store.set('slots', slots);
      $('#slotDate').value=''; $('#slotTime').value='';
      renderSlots();

      // Cloud — wyślij najnowszy
      if(window.CloudSlots && typeof CloudSlots.pushNewSlotFromLocal==='function'){
        CloudSlots.pushNewSlotFromLocal()
          .then(()=> console.log('[admin] push slot OK'))
          .catch(e => console.warn('[admin] push slot ERR', e));
      }
    });
  }
}

/* =========================================================
   USŁUGI & CENNIK (LocalStorage — proste CRUD)
   ========================================================= */
function renderServices(){
  const tbody = $('#servicesBody');
  if(!tbody) return;

  let services = Store.get('services',[]) || [];
  tbody.innerHTML = services.length ? '' : '<tr><td colspan="4">Brak usług.</td></tr>';

  services.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name||''}</td>
      <td>${s.durationMin||s.duration_min||0} min</td>
      <td>${fmtMoney(s.price||0)}</td>
      <td class="inline">
        <button class="btn secondary" data-act="edit" data-id="${s.id}">Edytuj</button>
        <button class="btn danger"    data-act="del"  data-id="${s.id}">Usuń</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Akcje w tabeli usług
  tbody.onclick = (e)=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const id = btn.dataset.id;
    let services = Store.get('services',[]) || [];
    const idx = services.findIndex(x=> x.id===id);
    if(idx<0) return;

    if(btn.dataset.act==='edit'){
      const cur = services[idx];
      const name = prompt('Nazwa usługi:', cur.name || '') ?? cur.name;
      if(name===null) return;
      const dur  = prompt('Czas (minuty):', String(cur.durationMin||cur.duration_min||60)) ?? cur.durationMin;
      const price= prompt('Cena (zł):', String(cur.price||0)) ?? cur.price;
      services[idx] = { ...cur, name: String(name).trim(), durationMin: Number(dur), price: Number(price) };
      Store.set('services', services);
      renderServices();
    }else if(btn.dataset.act==='del'){
      if(!confirm('Usunąć usługę?')) return;
      services = services.filter(x=> x.id!==id);
      Store.set('services', services);
      renderServices();
    }
  };

  // Dodaj usługę
  const addBtn = $('#addService');
  if(addBtn && !addBtn._bound){
    addBtn._bound = true;
    addBtn.addEventListener('click', ()=>{
      const name = prompt('Nazwa usługi:');       if(!name) return;
      const dur  = Number(prompt('Czas (minuty):')||60);
      const price= Number(prompt('Cena (zł):')||0);
      const services = Store.get('services',[]) || [];
      services.push({ id: Store.uid(), name: String(name).trim(), durationMin: dur, price });
      Store.set('services', services);
      renderServices();
    });
  }
}

/* =========================================================
   KLIENCI (LocalStorage – listing)
   ========================================================= */
function renderClients(){
  const wrap = $('#clientsList');
  if(!wrap) return;

  const clients = Store.get('clients',[]) || [];
  wrap.innerHTML = clients.length ? '' : '<div class="notice">Brak klientów.</div>';

  clients.forEach(c=>{
    const row = document.createElement('div');
    row.className='listItem';
    row.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <div>
          <div><strong>${c.name||''}</strong></div>
          <div class="meta">${c.email||''} • ${c.phone||''}</div>
        </div>
        <div>
          <button class="btn secondary" data-cid="${c.id||''}">Szczegóły</button>
        </div>
      </div>`;
    wrap.appendChild(row);
  });

  // (opcjonalnie) obsługa szczegółów
  wrap.onclick = (e)=>{
    const btn = e.target.closest('button[data-cid]');
    if(!btn) return;
    alert('Podgląd klienta będzie w następnej iteracji (zostawiamy layout bez zmian).');
  };
}

/* =========================================================
   USTAWIENIA (LocalStorage)
   ========================================================= */
function renderSettings(){
  const s = Store.get('settings',{}) || {};
  $('#setEmail') && ($('#setEmail').value = s.contactEmail || '');
  $('#setTel')   && ($('#setTel').value   = s.contactPhone || '');
  $('#setRodo')  && ($('#setRodo').value  = s.rodoText || '');
  $('#setPIN')   && ($('#setPIN').value   = Store.get('pin','2505'));
}

function bindSettings(){
  const btn = $('#saveSettingsBtn');
  if(btn && !btn._bound){
    btn._bound = true;
    btn.addEventListener('click', ()=>{
      const settings = {
        contactEmail: $('#setEmail')?.value.trim() || '',
        contactPhone: $('#setTel')?.value.trim()   || '',
        rodoText:     $('#setRodo')?.value.trim()  || ''
      };
      Store.set('settings', settings);
      const newPin = ($('#setPIN')?.value || '').trim();
      if(newPin) Store.set('pin', newPin);
      alert('Zapisano ustawienia.');
    });
  }
}

/* =========================================================
   REZERWACJE — (placeholdery do wyświetlania)
   ========================================================= */
function renderUpcoming(){ $('#upcoming') && ($('#upcoming').innerHTML=''); }
function renderConfirmed(){ $('#confirmed') && ($('#confirmed').innerHTML=''); }

/* =========================================================
   RENDER CAŁOŚCI + LOGIN
   ========================================================= */
function renderAll(){
  renderUpcoming();
  renderConfirmed();
  renderSlots();
  renderServices();
  renderClients();
  renderSettings();
  bindSettings();
}

/* =========================================================
   START
   ========================================================= */
document.addEventListener('DOMContentLoaded', ()=>{
  migrateSlots();

  // Login / Logout
  $('#loginBtn')  && ($('#loginBtn').onclick  = ()=>{
    const pinInput = $('#pin');
    const pin = (pinInput && pinInput.value || '').trim();
    const expected = Store.get('pin','2505');
    if(pin === String(expected)){ Session.login(); requireAuth(); }
    else alert('Błędny PIN');
  });
  $('#logoutBtn') && ($('#logoutBtn').onclick = ()=>{ Session.logout(); requireAuth(); });

  function requireAuth(){
    const loginView = $('#loginView');
    const appView   = $('#appView');
    if(Session.isAuthed()){
      loginView && (loginView.style.display='none');
      appView   && (appView.style.display='block');
      // wystartuj auto-sync jeśli masz adapter
      if(window.CloudSlots && typeof CloudSlots.startAutoSync==='function'){
        CloudSlots.startAutoSync(5000);
      }
      renderAll();
    }else{
      appView   && (appView.style.display='none');
      loginView && (loginView.style.display='block');
    }
  }

  // nasłuch synchronizacji z chmury → odśwież listę slotów
  document.addEventListener('slots-synced', ()=>{
    console.log('[admin] slots-synced → refresh');
    renderSlots();
  });

  // minimalne ograniczenie daty (dziś+)
  const sd = $('#slotDate');
  if(sd) sd.setAttribute('min', new Date().toISOString().slice(0,10));

  // pokaż właściwy widok
  requireAuth();
});
