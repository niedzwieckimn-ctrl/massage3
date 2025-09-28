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

/**************************
 * REZERWACJE – logika
 **************************/

// 1) Pobranie list wg statusu
async function dbLoadBookingsByStatus(statuses) {
  // statuses = tablica, np. ['pending','Niepotwierdzona', null]
  // Pobieramy od razu powiązane rekordy (slots, clients, services)
  const sel = `
  id, booking_no, status, notes, created_at,
  slot_id, service_id, client_id,
  slots(when), clients(name, email, phone), services(name)
  `;
  let q = sb.from('bookings').select(sel).order('created_at', { ascending: false });

  if (statuses && statuses.length) {
    // PostgREST: in(...) nie lubi nulli, więc zróbmy or(...)
    const parts = [];
    statuses.forEach(s => {
      if (s == null) parts.push('status.is.null');
      else parts.push(`status.eq.${s}`);
    });
    q = q.or(parts.join(','));
  }
  const { data, error } = await q;
  if (error) { console.error('[dbLoadBookingsByStatus]', error); return []; }

  // Uporządkuj dane do wygodnego formatu
  return (data || []).map(r => ({
    id: r.id,
    booking_no: r.booking_no || shortId(r.id),
    status: r.status || 'pending',
    notes: r.notes || '',
    created_at: r.created_at,
    when: r.slots?.when || null,
    client: r.clients || {},      // {name,email,phone}
    service: r.services || {},    // {title}
    slot_id: r.slot_id
  }));
}

// 2) Akcje: potwierdź / usuń
async function dbConfirmBooking(id) {
  const { error } = await sb.from('bookings').update({ status: 'Potwierdzona' }).eq('id', id);
  if (error) { alert('Nie udało się potwierdzić.'); console.error(error); return false; }
  return true;
}

async function dbDeleteBooking(id, slot_id) {
  const { error } = await sb.from('bookings').delete().eq('id', id);
  if (error) { alert('Nie udało się usunąć rezerwacji.'); console.error(error); return false; }
  // (opcjonalnie) zwolnij slot
  if (slot_id) {
    await sb.from('slots').update({ taken: false }).eq('id', slot_id).then(() => {}, () => {});
  }
  return true;
}

// 3) Render list
function renderBookingsList(containerId, list, isConfirmed) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div class="text-sm opacity-70">Brak pozycji</div>`;
    return;
  }

  const rows = list.map(b => {
    const dateStr = b.when ? new Date(b.when).toLocaleString() : '(brak daty)';
    const name = b.client?.name || '(bez imienia)';
    const service = b.service?.title || '(usługa?)';

    // Przyciski: potwierdzone nie mają zielonego
    const btnConfirm = isConfirmed ? '' : `<button class="btn btn-green" data-act="confirm" data-id="${b.id}">Potwierdź</button>`;
    const btnDelete = `<button class="btn btn-red" data-act="delete" data-id="${b.id}" data-slot="${b.slot_id}">Usuń</button>`;
    const btnDetails = `<button class="btn" data-act="details" data-id="${b.id}">Szczegóły</button>`;

    return `
      <div class="card" data-row="${b.id}">
        <div class="row-main">
          <div><b>${name}</b></div>
          <div>Nr: ${b.booking_no}</div>
          <div>${dateStr}</div>
          <div>${service}</div>
        </div>
        <div class="row-actions">
          ${btnConfirm}
          ${btnDelete}
          ${btnDetails}
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = rows;

  // Handlery przycisków
  el.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const act = ev.currentTarget.dataset.act;
      const id = ev.currentTarget.dataset.id;
      const slotId = ev.currentTarget.dataset.slot || null;
      const booking = list.find(x => x.id === id);

      if (act === 'confirm') {
        if (!(await dbConfirmBooking(id))) return;
        // (opcjonalnie) e-maile
        try { await sendBookingEmailsOnConfirm(booking); } catch(e) { console.warn('Email confirm failed', e); }
        await loadBookingsUI(); // przeładuj obie listy
      }
      else if (act === 'delete') {
        if (!confirm('Usunąć rezerwację?')) return;
        if (!(await dbDeleteBooking(id, slotId))) return;
        await loadBookingsUI();
      }
      else if (act === 'details') {
        showBookingDetails(booking);
      }
    });
  });
}

// 4) Szczegóły – prosty modal
function showBookingDetails(b) {
  const body = document.getElementById('bookingModalBody');
  const modal = document.getElementById('bookingModal');
  const dateStr = b.when ? new Date(b.when).toLocaleString() : '(brak daty)';
  body.innerHTML = `
    <div><b>Rezerwacja nr:</b> ${b.booking_no}</div>
    <div><b>Data/godzina:</b> ${dateStr}</div>
    <div><b>Klient:</b> ${b.client?.name || ''} &lt;${b.client?.email || '-'}&gt;, ${b.client?.phone || ''}</div>
    <div><b>Usługa:</b> ${b.service?.title || ''}</div>
    <div><b>Status:</b> ${b.status}</div>
    <div><b>Notatki:</b><br>${(b.notes || '').replace(/\n/g,'<br>')}</div>
  `;
  modal.classList.remove('hidden');
}
document.getElementById('bookingModalClose')?.addEventListener('click', () => {
  document.getElementById('bookingModal')?.classList.add('hidden');
});
document.getElementById('bookingModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'bookingModal') e.currentTarget.classList.add('hidden');
});

// 5) E-mail po POTWIERDZENIU (opcjonalnie, działa z Twoją funkcją Netlify)
async function sendBookingEmailsOnConfirm(b) {
  if (!b) return;
  const subject = `Potwierdzenie rezerwacji #${b.booking_no}`;
  const html = bookingEmailHtml(b, /*confirmed*/true);
  // do masażystki (z ustawień) i do klienta
  const therapist = (window.APP_SETTINGS?.contactEmail) || null;
  const recipients = [therapist, b.client?.email].filter(Boolean);
  const SEND_ENDPOINT = '/.netlify/functions/send-email';
  await Promise.all(recipients.map(to => fetch(SEND_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html })
  })));
}

// 6) HTML maila (ten sam szablon co przy tworzeniu, tylko inny tytuł)
function bookingEmailHtml(b, confirmed) {
  const d = b.when ? new Date(b.when).toLocaleString() : '';
  return `
    <h2>${confirmed ? 'Rezerwacja POTWIERDZONA' : 'Nowa rezerwacja'}</h2>
    <p><b>Nr:</b> ${b.booking_no}</p>
    <p><b>Data/godzina:</b> ${d}</p>
    <p><b>Klient:</b> ${b.client?.name || ''} &lt;${b.client?.email || ''}&gt;, ${b.client?.phone || ''}</p>
    <p><b>Usługa:</b> ${b.service?.title || ''}</p>
    ${b.notes ? `<p><b>Notatki:</b><br>${(b.notes||'').replace(/\n/g,'<br>')}</p>` : ''}
  `;
}

// 7) Skrót do czytelnych numerów (gdy brak booking_no)
function shortId(id) { return String(id).slice(0, 8); }

// 8) Główne odświeżenie UI
async function loadBookingsUI() {
  // „Niepotwierdzone” = pending/NULL/„Niepotwierdzona”
  const pending = await dbLoadBookingsByStatus(['pending', 'Niepotwierdzona', null]);
  // „Potwierdzone”
  const confirmed = await dbLoadBookingsByStatus(['Potwierdzona', 'confirmed']);
  renderBookingsList('pendingBookings', pending, /*isConfirmed*/false);
  renderBookingsList('confirmedBookings', confirmed, /*isConfirmed*/true);
}

// 9) Start na wejściu do zakładki „Rezerwacje”
if (document.getElementById('pendingBookings') || document.getElementById('confirmedBookings')) {
  loadBookingsUI();
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
    loadBookingsUI();

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
