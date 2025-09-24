/* =========================================================
   ADMIN (Supabase + LocalStorage) — wersja naprawiona
   ========================================================= */

/* ---- Krótkie pomocnicze funkcje UI ---- */
window.el  = window.el  || function (sel, r = document) { return r.querySelector(sel); };
window.els = window.els || function (sel, r = document) { return r.querySelectorAll(sel); };

function fmtMoney(n){ return new Intl.NumberFormat('pl-PL', { style:'currency', currency:'PLN', minimumFractionDigits:2 }).format(Number(n||0)); }
function fmtDate(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
}

/* ---- Sesja PIN ---- */
const Session = {
  isAuthed(){ return sessionStorage.getItem('adminAuthed') === '1'; },
  login(){    sessionStorage.setItem('adminAuthed','1'); },
  logout(){   sessionStorage.removeItem('adminAuthed'); }
};

function requireAuth(){
  const loginView = el('#loginView');
  const appView   = el('#appView');
  if(!loginView || !appView) return;

  if(Session.isAuthed()){
    loginView.style.display = 'none';
    appView.style.display   = 'block';
    renderAll();
  }else{
    appView.style.display   = 'none';
    loginView.style.display = 'block';
  }
}

function login(){
  const pinInput = el('#pin');
  const pin = (pinInput && pinInput.value || '').trim();
  const expected = (Store.get('pin','') || '2505');     // PIN z localStorage albo 2505
  if(pin === expected){ Session.login(); requireAuth(); }
  else { alert('Błędny PIN'); }
}
function logout(){ Session.logout(); requireAuth(); }

/* =========================================================
   RENDER — Sloty / Usługi / Klienci / Ustawienia
   ========================================================= */

/* --- Wolne terminy --- */
function renderSlots(){
  const list = el('#slotsList');
  if(!list) return;

  const slots = (Store.get('slots',[]) || []).sort((a,b)=> new Date(a.when)-new Date(b.when));
  list.innerHTML = slots.length ? '' : '<div class="notice">Brak dodanych terminów.</div>';

  for(const s of slots){
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div>${fmtDate(s.when)}</div>
      <div class="inline">
        <button class="btn danger" data-id="${s.id||''}" data-when="${s.when}">Usuń</button>
      </div>
    `;
    list.appendChild(row);
  }

  // Klik "Usuń"
  list.onclick = (e)=>{
    const btn = e.target.closest('button[data-when]');
    if(!btn) return;
    const id   = btn.dataset.id;
    const when = btn.dataset.when;
    let curr = Store.get('slots',[]) || [];
    curr = id ? curr.filter(x=>x.id!==id) : curr.filter(x=>x.when!==when);
    Store.set('slots', curr);
    renderSlots();
  };

  // Dodawanie nowego terminu
  const addBtn = el('#addSlot');
  if(addBtn && !addBtn._bound){
    addBtn._bound = true;
    addBtn.addEventListener('click', ()=>{
      const d = el('#slotDate')?.value.trim();
      let   t = el('#slotTime')?.value.trim().slice(0,5);
      if(!d || !t || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)){
        alert('Podaj poprawną datę i godzinę'); return;
      }
      const iso = new Date(`${d}T${t}:00`).toISOString();

      let slots = Store.get('slots',[]) || [];
      // anty-duplikat lokalnie
      if(slots.some(s => s.when === iso)){ alert('Taki termin już istnieje'); return; }

      slots.push({ id: Store.uid(), when: iso, taken:false });
      slots.sort((a,b)=> new Date(a.when)-new Date(b.when));
      Store.set('slots', slots);

      el('#slotDate').value = '';
      el('#slotTime').value = '';
      renderSlots();
	  if (window.CloudSlots) {
  CloudSlots.pushNewSlotFromLocal()
    .then(function(){ console.log('[admin] push+pull OK'); })
    .catch(function(e){ console.warn('[admin] push ERR', e); });
}


      // push do chmury (jeśli adapter wczytany)
      if(window.CloudSlots && typeof CloudSlots.pushNewSlotFromLocal === 'function'){
        CloudSlots.pushNewSlotFromLocal()
          .then(()=> console.log('[admin] push OK'))
          .catch(err=> console.error('[admin] push ERR', err));
      }
    });
  }
}

/* --- Usługi (zostawiamy stare zachowanie – z Store) --- */
function renderServices(){
  const tbody = el('#servicesBody');
  if(!tbody) return;

  const services = Store.get('services',[]) || [];
  if(!services.length){
    tbody.innerHTML = '<tr><td colspan="4">Brak usług.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  services.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name||''}</td>
      <td>${s.durationMin||0} min</td>
      <td>${fmtMoney(s.price||0)}</td>
      <td class="inline">
        <!-- przyciski edycji/usuń możesz dodać później -->
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* --- Klienci (zostawiamy z Store) --- */
function renderClients(){
  const wrap = el('#clientsList');
  if(!wrap) return;
  const clients = Store.get('clients',[]) || [];
  wrap.innerHTML = clients.length ? '' : '<div class="notice">Brak klientów.</div>';

  for(const c of clients){
    const div = document.createElement('div');
    div.className = 'listItem';
    div.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <span class="meta">${c.name||''} — ${c.email||''} — ${c.phone||''}</span>
        <button class="btn secondary" data-id="${c.id||''}">Otwórz</button>
      </div>`;
    wrap.appendChild(div);
  }
}

/* --- Ustawienia (nic nie zmieniamy) --- */
function renderSettings(){ /* pozostawiam pustą, jeśli nie masz ustawień do pokazania */ }

/* ---- Render całości ---- */
function renderAll(){
  renderSlots();
  // (reszta kart zadziała jak u Ciebie dotąd)
  renderServices();
  renderClients();
  renderSettings();
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', ()=>{
  const loginBtn  = el('#loginBtn');
  const logoutBtn = el('#logoutBtn');

  if(loginBtn)  loginBtn.onclick  = login;
  if(logoutBtn) logoutBtn.onclick = logout;

  const sd = el('#slotDate');
  if(sd) sd.setAttribute('min', new Date().toISOString().slice(0,10));

  // przełączanie zakładek (kafelki)
  const tabs  = document.querySelectorAll('.tabbar .tab');
  const panes = document.querySelectorAll('.tabpane');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const id = t.dataset.tab;
      panes.forEach(p => {
        p.style.display = (p.dataset.pane === id ? 'block' : 'none');
      });
    });
  });

  requireAuth();
});

