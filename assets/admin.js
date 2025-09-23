/* =========================================
   ADMIN (Supabase-only)
========================================= */

// --- Krótkie helpery UI (pojedyncza definicja) ---
const el  = window.el  || ((s,d=document)=>d.querySelector(s));
const els = window.els || ((s,d=document)=>[...d.querySelectorAll(s)]);
const money = v => `${(Number(v)||0).toFixed(2)} zł`;
const dtPL  = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
};

// (Nie trzymaj w tym pliku żadnych <script>...</script> – to ma być tylko JS)

/* Usługi */
async function dbLoadServices(){
  const { data, error } = await sb.from('services')
    .select('id, name, price, duration_min, active')
    .order('name', { ascending:true });
  if (error){ console.error('DB services', error); return []; }
  return data || [];
}
async function dbUpsertService(svc){ // {id?, name, price, duration_min, active}
  const { error } = await sb.from('services').upsert(svc, { onConflict:'id' });
  if (error) throw error;
}
async function dbDeleteService(id){
  const { error } = await sb.from('services').delete().eq('id', id);
  if (error) throw error;
}

/* Sloty (wolne terminy) */
async function dbLoadSlots(){
  const { data, error } = await sb.from('slots')
    .select('id, when, taken')
    .order('when', { ascending:true });
  if (error){ console.error('DB slots', error); return []; }
  return data || [];
}
async function dbAddSlot(isoWhen){
  const { error } = await sb.from('slots').insert({ when: isoWhen, taken:false });
  if (error) throw error;
}
async function dbDeleteSlot(id){
  const { error } = await sb.from('slots').delete().eq('id', id);
  if (error) throw error;
}

/* Rezerwacje (podgląd/potwierdzanie) */
async function dbLoadBookings(status){ // status: 'Oczekująca' lub 'Potwierdzona'
  let q = sb.from('bookings')
    .select(`
      id, booking_no, status, notes, created_at,
      slot:slots(id, when),
      client:clients(id, name, email, phone),
      service:services(id, name, price, duration_min)
    `)
    .order('created_at', { ascending:false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error){ console.error('DB bookings', error); return []; }
  return data || [];
}
async function dbUpdateBooking(id, patch){ // np. { status:'Potwierdzona' }
  const { error } = await sb.from('bookings').update(patch).eq('id', id);
  if (error) throw error;
}

/* Klienci */
async function dbLoadClients(){
  const { data, error } = await sb.from('clients')
    .select('id, name, email, phone, address, preferences, notes_general')
    .order('name', { ascending:true });
  if (error){ console.error('DB clients', error); return []; }
  return data || [];
}
async function dbUpdateClient(id, patch){
  const { error } = await sb.from('clients').update(patch).eq('id', id);
  if (error) throw error;
}

/* =========================
   RENDER — Terminy (Sloty)
   ========================= */
async function renderSlots(){
  const list = el('#slotsList');
  if (!list) return;

  list.innerHTML = '<div class="notice">Ładowanie…</div>';
  const rows = await dbLoadSlots();
  const free = rows.filter(s => !s.taken);

  if (!free.length){
    list.innerHTML = '<div class="notice">Brak dodanych terminów.</div>';
    return;
  }

  list.innerHTML = '';
  free.forEach(s=>{
    const dstr = dtPL(s.when);
    const row = document.createElement('div');
    row.className = 'listItem inline';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div><b>${dstr}</b></div>
      <div class="inline">
        <button class="btn danger" data-act="del-slot" data-id="${s.id}">Usuń</button>
      </div>
    `;
    list.appendChild(row);
  });
}

/* Dodanie terminu (z przycisku) */
async function onAddSlot(e){
  e?.preventDefault?.();
  const d = (el('#slotDate')?.value || '').trim(); // YYYY-MM-DD
  const t = (el('#slotTime')?.value || '').trim(); // HH:MM
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)){
    alert('Podaj datę i godzinę');
    return;
  }
  const iso = new Date(`${d}T${t}:00`).toISOString();
  try{
    // opcjonalnie: sprawdź duplikat
    const { data: dup } = await sb.from('slots').select('id').eq('when', iso).maybeSingle();
    if (dup){ alert('Taki termin już istnieje'); return; }

    await dbAddSlot(iso);
    el('#slotDate').value = '';
    el('#slotTime').value = '';
    await renderSlots();
  }catch(err){
    console.error(err);
    alert('Nie udało się dodać terminu');
  }
}

/* Obsługa kasowania terminu (delegacja klików) */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act="del-slot"]');
  if (!btn) return;
  if (!confirm('Usunąć ten termin?')) return;
  try{
    await dbDeleteSlot(btn.dataset.id);
    await renderSlots();
  }catch(err){
    console.error(err);
    alert('Błąd usuwania terminu');
  }
});

/* =========================
   RENDER — Usługi & Cennik
   ========================= */
async function renderServices(){
  const tbody = el('#servicesBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4">Ładowanie…</td></tr>';
  const services = await dbLoadServices();

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
      <td>${money(s.price)}</td>
      <td class="inline">
        <button class="btn secondary" data-act="edit-service" data-id="${s.id}">Edytuj</button>
        <button class="btn danger" data-act="del-service" data-id="${s.id}">Usuń</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* Klik: Dodaj usługę */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#addService');
  if (!btn) return;

  const name = prompt('Nazwa usługi:'); if (!name) return;
  const duration = parseInt(prompt('Czas trwania (min):') || '60', 10);
  const price = parseFloat(prompt('Cena (PLN):') || '180');

  try{
    await dbUpsertService({
      id: crypto.randomUUID(),
      name, duration_min: duration, price, active: true
    });
    await renderServices();
  }catch(err){
    console.error(err);
    alert('Nie udało się dodać usługi');
  }
});

/* Klik: Edytuj/Usuń usługę (delegacja) */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act="edit-service"],button[data-act="del-service"]');
  if (!btn) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;

  try{
    if (act === 'del-service'){
      if (!confirm('Usunąć tę usługę?')) return;
      await dbDeleteService(id);
      await renderServices();
      return;
    }

    if (act === 'edit-service'){
      // pobierz aktualny rekord
      const list = await dbLoadServices();
      const cur = list.find(x => x.id === id);
      if (!cur){ alert('Nie znaleziono usługi'); return; }

      const name = prompt('Nazwa usługi:', cur.name); if (!name) return;
      const duration = parseInt(prompt('Czas trwania (min):', cur.duration_min) || cur.duration_min, 10);
      const price = parseFloat(prompt('Cena (PLN):', cur.price) || cur.price);

      await dbUpsertService({ id, name, duration_min: duration, price, active: true });
      await renderServices();
    }
  }catch(err){
    console.error(err);
    alert('Operacja na usłudze nie powiodła się');
  }
});

/* =========================
   RENDER — Rezerwacje
   ========================= */
async function renderUpcoming(){
  const wrap = el('#upcomingList'); // kontener w zakładce „Rezerwacje oczekujące”
  if (!wrap) return;
  wrap.innerHTML = '<div class="notice">Ładowanie…</div>';

  const rows = await dbLoadBookings('Oczekująca');
  if (!rows.length){ wrap.innerHTML = '<div class="notice">Brak oczekujących rezerwacji.</div>'; return; }

  wrap.innerHTML = '';
  rows.forEach(b=>{
    const when = b.slot?.when ? dtPL(b.slot.when) : '-';
    const div = document.createElement('div');
    div.className = 'listItem';
    div.innerHTML = `
      <div class="inline" style="justify-content:space-between; gap:12px;">
        <div>
          <div><b>${when}</b> — ${b.service?.name || ''}</div>
          <div class="meta">${b.client?.name || ''} • ${b.client?.email || ''} • ${b.client?.phone || ''}</div>
          ${b.notes ? `<div class="meta">Uwagi: ${b.notes}</div>` : ''}
        </div>
        <div class="inline">
          <button class="btn primary" data-act="confirm-booking" data-id="${b.id}">Potwierdź</button>
          <button class="btn" data-act="details-booking" data-id="${b.id}">Szczegóły</button>
        </div>
      </div>`;
    wrap.appendChild(div);
  });
}

async function renderConfirmed(){
  const wrap = el('#confirmedList'); // kontener „Potwierdzone rezerwacje”
  if (!wrap) return;
  wrap.innerHTML = '<div class="notice">Ładowanie…</div>';

  const rows = await dbLoadBookings('Potwierdzona');
  if (!rows.length){ wrap.innerHTML = '<div class="notice">Brak potwierdzonych rezerwacji.</div>'; return; }

  wrap.innerHTML = '';
  rows.forEach(b=>{
    const when = b.slot?.when ? dtPL(b.slot.when) : '-';
    const div = document.createElement('div');
    div.className = 'listItem';
    div.innerHTML = `
      <div class="inline" style="justify-content:space-between; gap:12px;">
        <div>
          <div><b>${when}</b> — ${b.service?.name || ''}</div>
          <div class="meta">${b.client?.name || ''} • ${b.client?.email || ''} • ${b.client?.phone || ''}</div>
          <div class="meta">Nr: ${b.booking_no || '-'}</div>
        </div>
        <div class="inline">
          <button class="btn" data-act="details-booking" data-id="${b.id}">Szczegóły</button>
        </div>
      </div>`;
    wrap.appendChild(div);
  });
}

/* Kliki: potwierdź/szczegóły rezerwacji */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act="confirm-booking"],button[data-act="details-booking"]');
  if (!btn) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;

  // pobierz rekord (na świeżo)
  const all = await dbLoadBookings(); // wszystkie statusy
  const b = all.find(x => x.id === id);
  if (!b) { alert('Nie znaleziono rezerwacji'); return; }

  if (act === 'details-booking'){
    const html = `
      <h3>Rezerwacja</h3>
      <p><b>Termin:</b> ${b.slot?.when ? dtPL(b.slot.when) : '-'}</p>
      <p><b>Usługa:</b> ${b.service?.name || '-'}</p>
      <p><b>Klient:</b> ${b.client?.name || '-'} (${b.client?.email || ''} ${b.client?.phone ? '• '+b.client.phone : ''})</p>
      ${b.notes ? `<p><b>Uwagi:</b> ${b.notes}</p>` : ''}
      <p><b>Status:</b> ${b.status}</p>
      <p><b>Nr rezerwacji:</b> ${b.booking_no || '-'}</p>
    `;
    const modal = document.createElement('div');
    modal.className = 'adm-modal-root';
    modal.innerHTML = `<div class="adm-modal"><header>Szczegóły rezerwacji</header><div class="content">${html}</div><div class="actions"><button class="btn" data-close>Ok</button></div></div>`;
    Object.assign(modal.style, { position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.35)', zIndex:9999 });
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev)=>{
      if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove();
    });
    return;
  }

  if (act === 'confirm-booking'){
    try{
      await dbUpdateBooking(id, { status:'Potwierdzona' });
      await renderUpcoming();
      await renderConfirmed();
      alert('Rezerwacja potwierdzona');
    }catch(err){
      console.error(err);
      alert('Błąd potwierdzania rezerwacji');
    }
  }
});

/* =========================
   RENDER — Klienci
   ========================= */
async function renderClients(){
  const wrap = el('#clientsList');
  if (!wrap) return;

  wrap.innerHTML = '<div class="notice">Ładowanie…</div>';
  const rows = await dbLoadClients();

  if (!rows.length){
    wrap.innerHTML = '<div class="notice">Brak klientów.</div>';
    return;
  }

  wrap.innerHTML = '';
  rows.forEach(c=>{
    const div = document.createElement('div');
    div.className = 'listItem';
    div.innerHTML = `
      <div class="inline" style="justify-content:space-between">
        <div><b>${c.name}</b> <span class="meta">${c.email || ''} • ${c.phone || ''}</span></div>
        <button class="btn secondary" data-act="open-client" data-id="${c.id}">Otwórz</button>
      </div>`;
    wrap.appendChild(div);
  });
}

/* Podgląd klienta (prawy panel) */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act="open-client"]');
  if (!btn) return;

  const id = btn.dataset.id;
  const list = await dbLoadClients();
  const c = list.find(x => x.id === id);
  if (!c){ alert('Nie znaleziono klienta'); return; }

  // Uzupełnij modal
  el('#clientName') && (el('#clientName').textContent = c.name || '');
  el('#cEmail')     && (el('#cEmail').value = c.email || '');
  el('#cPhone')     && (el('#cPhone').value = c.phone || '');
  el('#cAddress')   && (el('#cAddress').value = c.address || '');
  el('#cNotes')     && (el('#cNotes').value = c.notes_general || '');

  // Proste sugestie
  const pref = c.preferences || {};
  const suggest = [];
  if (pref.massage) suggest.push(`Preferencje: ${pref.massage}`);
  if (pref.health)  suggest.push(`Zdrowie: ${pref.health}`);
  if (pref.allergies) suggest.push(`Alergie: ${pref.allergies}`);
  const rec = 'Zalecenie: praca na obszarach zwiększonego napięcia, kontrola reakcji bólowych, techniki rozluźniające.';
  el('#clientSuggestion') && (el('#clientSuggestion').textContent = (suggest.concat([rec])).join('\n• '));

  // Historia z Supabase (prosty podgląd po ID klienta)
  const { data: hist } = await sb.from('bookings')
    .select('created_at, status, notes, service:services(name)')
    .eq('client_id', id)
    .order('created_at', { ascending:false });

  const tbody = el('#historyBody');
  if (tbody){
    tbody.innerHTML = '';
    (hist||[]).forEach(h=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${dtPL(h.created_at)}</td>
        <td>${h.service?.name || '-'}</td>
        <td>${h.notes || ''}</td>
        <td>${h.status || ''}</td>`;
      tbody.appendChild(tr);
    });
  }

  // pokaż modal
  const modal = el('#clientModal');
  if (modal) { modal.style.display = 'block'; modal.dataset.id = id; }
});

/* Zapis zmian klienta (z prawego panelu) */
function saveClient(){
  const id = el('#clientModal')?.dataset?.id; if (!id) return;
  const patch = {
    email:  el('#cEmail')?.value?.trim() || null,
    phone:  el('#cPhone')?.value?.trim() || null,
    address:el('#cAddress')?.value?.trim() || null,
    notes_general: el('#cNotes')?.value?.trim() || null,
    preferences: {
      allergies: el('#cPrefAll')?.value?.trim() || '',
      massage:   el('#cPrefMassage')?.value?.trim() || '',
      health:    el('#cPrefHealth')?.value?.trim() || '',
      mental:    el('#cPrefMental')?.value?.trim() || ''
    }
  };
  dbUpdateClient(id, patch)
    .then(()=> alert('Zapisano dane klienta'))
    .catch(err=> { console.error(err); alert('Błąd zapisu klienta'); });
}

/* Zamknij modal klienta */
function closeClient(){ const m = el('#clientModal'); if (m) m.style.display = 'none'; }

/* =========================
   Ustawienia (zostaw jak jest)
   ========================= */
function saveSettings(){
  const s = {
    contactEmail: el('#setEmail')?.value?.trim() || '',
    contactTel:   el('#setTel')?.value?.trim() || '',
    rodoText:     el('#setRodo')?.value?.trim() || '',
  };
  // jeśli kiedyś przeniesiemy to do DB – tu wstawimy zapis
  localStorage.setItem('settings', JSON.stringify(s));
  localStorage.setItem('pin', (el('#setPIN')?.value?.trim() || '2505'));
  alert('Zapisano ustawienia');
}

/* =========================
   INIT — start panelu
   ========================= */
document.addEventListener('DOMContentLoaded', async ()=>{
  // guziki główne
  el('#saveClientBtn')?.addEventListener('click', saveClient);
  el('#closeClientBtn')?.addEventListener('click', closeClient);
  el('#saveSettingsBtn')?.addEventListener('click', saveSettings);

  // przycisk dodawania terminu
  const addBtn = el('#addSlot');
  if (addBtn){
    addBtn.setAttribute('type','button'); // nie wysyłaj formularza
    addBtn.addEventListener('click', onAddSlot);
  }

  // minimalne przygotowanie daty
  const sd = el('#slotDate');
  if (sd) sd.setAttribute('min', new Date().toISOString().slice(0,10));

  // startowe załadowanie sekcji
  await renderSlots();
  await renderServices();
  await renderUpcoming();
  await renderConfirmed();
  await renderClients();
});
