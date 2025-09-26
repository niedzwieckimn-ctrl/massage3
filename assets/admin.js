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

  // Klik "Usuń" — trwałe usuwanie: najpierw w chmurze, potem lokalnie, potem refresh
list.onclick = async (e) => {
  const btn = e.target.closest('button[data-when]');
  if (!btn) return;

  const id   = btn.dataset.id || null;
  const when = btn.dataset.when || null;

  // 1) próbujemy usunąć w Supabase bez blokowania UI
  if (window.sb && id) {
    try {
      await window.sb
        .from('slots')
        .delete()
        .eq('id', id);
      console.log('[admin] supabase delete OK', id);
    } catch (err) {
      console.warn('[admin] supabase delete ERR', err);
      // nie przerywamy — i tak usuniemy lokalnie, ale zgłosimy błąd
    }
  } else if (window.CloudSlots && (id || when)) {
    // jeśli korzystasz z adaptera zamiast bezpośredniego sb, spróbuj przez niego
    try {
      await CloudSlots.deleteSlot(id || when);
      console.log('[admin] cloud delete OK', id || when);
    } catch (err) {
      console.warn('[admin] cloud delete ERR', err);
    }
  }

  // 2) usuń lokalnie (od razu dla responsywności)
  let slots = Store.get('slots', []) || [];
  slots = id ? slots.filter(s => s.id !== id) : slots.filter(s => s.when !== when);
  Store.set('slots', slots);
  renderSlots();

  // 3) opcjonalnie: ściągnij świeże dane z chmury (jeśli masz pull)
  if (window.CloudSlots && typeof CloudSlots.pull === 'function') {
    try { await CloudSlots.pull(); } catch(_) { /* ignore */ }
  }
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
    });
  }
}

// --- Usługi & Cennik ---
async function renderServices(){
  const tbody = el('#servicesBody');
  if (!tbody) return;

  // 1) Ściągnij z chmury (jeśli jest sb); jeśli błąd – zostaw to co w localStorage
  let services = Store.get('services', []);
  if (window.sb) {
    const { data, error } = await window.sb
      .from('services')
      .select('id, name, price, duration_min, active')
      .order('name', { ascending: true });

    if (!error && Array.isArray(data)) {
      services = data;
      Store.set('services', services); // nadpisz lokalne świeżymi
    } else {
      console.warn('[admin] services pull error:', error);
    }
  }

  // 2) Render
  if (!services.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="notice">Brak usług.</div></td></tr>';
    return;
  }

  tbody.innerHTML = services.map(s => `
    <tr data-id="${s.id}">
      <td><input class="svc-name" value="${s.name ?? ''}"></td>
      <td><input class="svc-price" type="number" step="0.01" value="${s.price ?? ''}"></td>
      <td><input class="svc-dur" type="number" value="${s.duration_min ?? ''}"></td>
      <td style="text-align:center"><input class="svc-act" type="checkbox" ${s.active ? 'checked' : ''}></td>
      <td><button class="btn danger svc-del">Usuń</button></td>
    </tr>
  `).join('');
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
  renderServices();
// 2) Odświeżenie po wejściu w kartę "Usługi & Cennik"
  const tabServices = document.querySelector('.tabbar_tab[data-tab="services"]');
  if (tabServices) tabServices.addEventListener('click', () => renderServices());
});

});

