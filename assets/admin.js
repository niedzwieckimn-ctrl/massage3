'use strict';

/* ===========================
   Pomocnicze
=========================== */
const el = (sel, root = document) => root.querySelector(sel);
const money = (n) => (Number(n) || 0).toFixed(2) + ' zł';
const dtPL  = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
};

/* ===========================
   Sesja (PIN)
=========================== */
const PIN = '2505';
const Session = {
  isAuthed(){ return sessionStorage.getItem('adminAuthed') === '1'; },
  login(){ sessionStorage.setItem('adminAuthed', '1'); },
  logout(){ sessionStorage.removeItem('adminAuthed'); }
};

/* ===========================
   Zakładki (taby)
=========================== */
function initTabs(){
  const tabs  = document.querySelectorAll('.tabbar .tab');
  const panes = document.querySelectorAll('.tabpane');
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      panes.forEach(p=>p.style.display = (p.dataset.pane === t.dataset.tab) ? 'block' : 'none');
      t.classList.add('active');
    });
  });
}

/* ===========================
   SUPABASE – funkcje DB
   (wymagane: window.sb z admin.html)
=========================== */
// Usługi
async function dbLoadServices(){
  const { data, error } = await sb.from('services')
    .select('id, name, price, duration_min, active')
    .order('name', { ascending: true });
  if(error){ console.error('DB services:', error); return []; }
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

// Terminy
async function dbLoadSlots(){
  const { data, error } = await sb.from('slots')
    .select('id, when, taken')
    .order('when', { ascending: true });
  if(error){ console.error('DB slots:', error); return []; }
  return data || [];
}
async function dbAddSlot(iso){
  const { data, error } = await sb.from('slots').insert({ when: iso, taken: false }).select('id').single();
  if(error) throw error;
  return data.id;
}
async function dbDeleteSlot(id){
  const { error } = await sb.from('slots').delete().eq('id', id);
  if(error) throw error;
}

// Rezerwacje (prosty odczyt)
async function dbLoadBookings(){
  const { data, error } = await sb.from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if(error){ console.error('DB bookings:', error); return []; }
  return data || [];
}

/* ===========================
   RENDERY
=========================== */
// Usługi – lista + dodawanie/edycja/usuwanie
async function renderServices(){
  const tbody = el('#servicesBody'); if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4">Ładowanie…</td></tr>';

  const list = await dbLoadServices();
  if(!list.length){ tbody.innerHTML = '<tr><td colspan="4">Brak usług.</td></tr>'; return; }

  tbody.innerHTML = '';
  list.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.duration_min} min</td>
      <td>${money(s.price)}</td>
      <td class="inline">
        <button class="btn secondary" data-act="edit" data-id="${s.id}">Edytuj</button>
        <button class="btn danger" data-act="del" data-id="${s.id}">Usuń</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.onclick = async (e)=>{
    const id  = e.target.dataset.id;
    const act = e.target.dataset.act;
    if(!id || !act) return;

    if(act === 'del'){
      if(!confirm('Usunąć usługę?')) return;
      await dbDeleteService(id);
      renderServices();
      return;
    }

    if(act === 'edit'){
      const row = list.find(x=>x.id === id); if(!row) return;
      const name = prompt('Nazwa', row.name) || row.name;
      const duration_min = parseInt(prompt('Czas (min)', row.duration_min) || row.duration_min, 10);
      const price = parseFloat(prompt('Cena', row.price) || row.price);
      await dbUpsertService({ id, name, duration_min, price, active: true });
      renderServices();
    }
  };

  const addBtn = el('#addService');
  if(addBtn){
    addBtn.onclick = async ()=>{
      const name = prompt('Nazwa usługi:'); if(!name) return;
      const duration_min = parseInt(prompt('Czas trwania (min):', '60'), 10) || 60;
      const price = parseFloat(prompt('Cena (PLN):', '180'), 10) || 180;
      await dbUpsertService({ name, duration_min, price, active: true });
      renderServices();
    };
  }
}

// Terminy – lista + dodawanie/usuwanie
async function renderSlots(){
  const listEl = el('#slotsList'); if(!listEl) return;
  listEl.innerHTML = '<div class="notice">Ładowanie…</div>';

  const all  = await dbLoadSlots();
  const free = all.filter(s=>!s.taken);
  if(!free.length){ listEl.innerHTML = '<div class="notice">Brak dodanych terminów.</div>'; return; }

  listEl.innerHTML = '';
  free.forEach(s=>{
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div><b>${dtPL(s.when)}</b></div>
      <div class="inline">
        <button class="btn danger" data-id="${s.id}">Usuń</button>
      </div>`;
    listEl.appendChild(row);
  });

  listEl.onclick = async (e)=>{
    const id = e.target.dataset.id; if(!id) return;
    if(!confirm('Usunąć ten termin?')) return;
    await dbDeleteSlot(id);
    renderSlots();
  };

  const addBtn = el('#addSlot');
  if(addBtn){
    addBtn.onclick = async ()=>{
      const d = el('#slotDate').value.trim();
      const t = el('#slotTime').value.trim();
      if(!d || !t){ alert('Wybierz datę i godzinę.'); return; }
      const iso = new Date(`${d}T${t}:00`).toISOString();
      await dbAddSlot(iso);
      el('#slotDate').value = ''; el('#slotTime').value = '';
      renderSlots();
    };
  }
}

// Rezerwacje – proste listy
async function renderBookings(){
  const up = el('#upcoming'), cf = el('#confirmed');
  if(!up || !cf) return;

  up.innerHTML = cf.innerHTML = '<div class="notice">Ładowanie…</div>';
  const list = await dbLoadBookings();
  const upcoming  = list.filter(b => b.status !== 'Potwierdzona');
  const confirmed = list.filter(b => b.status === 'Potwierdzona');

  const paint = (wrap, arr)=>{
    if(!arr.length){ wrap.innerHTML = '<div class="notice">Brak pozycji.</div>'; return; }
    wrap.innerHTML = '';
    arr.forEach(b=>{
      const div = document.createElement('div');
      div.className = 'listItem inline';
      div.style.justifyContent = 'space-between';
      div.innerHTML = `
        <div><b>${dtPL(b.when)}</b> — ${b.client_name || ''}</div>
        <div class="badge ${b.status==='Potwierdzona'?'success':'warning'}">${b.status || 'Oczekująca'}</div>`;
      wrap.appendChild(div);
    });
  };
  paint(up, upcoming);
  paint(cf, confirmed);
}

/* ===========================
   Start / logowanie
=========================== */
function requireAuth(){
  const loginView = el('#loginView');
  const appView   = el('#appView');
  if(Session.isAuthed()){
    loginView.style.display = 'none';
    appView.style.display   = 'block';
    initTabs();
    renderServices();
    renderSlots();
    renderBookings();
  }else{
    loginView.style.display = 'block';
    appView.style.display   = 'none';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  console.log('ADMIN START');

  const loginBtn = el('#loginBtn');
  if(loginBtn){
    loginBtn.onclick = ()=>{
      const val = el('#pin').value.trim();
      if(val === PIN){ Session.login(); requireAuth(); }
      else alert('Błędny PIN');
    };
  }
  const logoutBtn = el('#logoutBtn');
  if(logoutBtn) logoutBtn.onclick = ()=>{ Session.logout(); requireAuth(); };

  requireAuth();
});
