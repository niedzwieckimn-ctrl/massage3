/* === storage === */
function sp(k){ try{ return JSON.parse(localStorage.getItem(k)||'[]'); }catch{ return []; } }
function sv(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

/* === slots helpers (ISO only) === */
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME=/^\d{2}:\d{2}$/;

function isValidIso(date,time){
  if(!ISO_DATE.test(date||'')||!ISO_TIME.test(time||'')) return false;
  return !Number.isNaN(new Date(`${date}T${time}:00`).getTime());
}
function loadSlots(){ return sp('availableSlots'); }
function saveSlots(a){ sv('availableSlots', a); }

/* === bookings === */
function loadBookings(){ return sp('bookings'); }
function saveBookings(a){ sv('bookings', a); }

/* === render slots === */
function renderSlots(){
  const list = document.getElementById('slotsList');
  if (!list) return;
  const slots = loadSlots().slice().sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));
  list.innerHTML='';
  slots.forEach((s, idx)=>{
    const pretty = new Date(`${s.date}T${s.time}:00`).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
    const row = document.createElement('div');
    row.className='row slotItem';
    row.dataset.date = s.date;
    row.dataset.time = s.time;
    row.innerHTML = `
      <div><strong>${pretty}</strong></div>
      <div><button class="btn-danger removeSlot" data-index="${idx}">Usuń</button></div>
    `;
    list.appendChild(row);
  });
}

/* === render bookings (termin wizyty) === */
function renderBookings(){
  const box = document.getElementById('upcoming');
  if (!box) return;
  const arr = loadBookings().slice()
    .filter(b => b?.date && b?.time && !Number.isNaN(new Date(`${b.date}T${b.time}:00`).getTime()))
    .sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));
  box.innerHTML='';
  arr.forEach((b, i)=>{
    const pretty = new Date(`${b.date}T${b.time}:00`).toLocaleString('pl-PL',{dateStyle:'medium', timeStyle:'short'});
    const card = document.createElement('div');
    card.className='row bookingItem';
    card.dataset.date = b.date;
    card.dataset.time = b.time;
    card.innerHTML = `
      <div>
        <strong>${pretty}</strong> — ${b.service || 'Zabieg'}
        <div style="opacity:.75">${b.client?.name || ''} • ${b.client?.email || ''} • ${b.client?.phone || ''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge">${b.status || 'Oczekująca'}</span>
        <button class="btn-success confirm" data-idx="${i}">Potwierdź</button>
        <button class="btn-danger delete"  data-idx="${i}">Usuń</button>
      </div>
    `;
    box.appendChild(card);
  });
}

/* === add/remove slot === */
function addSlot(){
  const d = (document.getElementById('slotDate')?.value || '').trim();
  const t = (document.getElementById('slotTime')?.value || '').trim();
  if (!isValidIso(d,t)){ alert('Podaj poprawną datę (YYYY-MM-DD) i godzinę (HH:MM).'); return; }
  const arr = loadSlots();
  if (arr.some(s=>s.date===d && s.time===t)){ alert('Taki termin już istnieje.'); return; }
  arr.push({date:d, time:t});
  arr.sort((a,b)=>(`${a.date}T${a.time}`).localeCompare(`${b.date}T${b.time}`));
  saveSlots(arr);
  renderSlots();
  // poinformuj index, że są nowe sloty
  window.dispatchEvent(new StorageEvent('storage', { key:'availableSlots' }));
}
function removeSlotByIndex(idx){
  const arr = loadSlots();
  if (Number.isFinite(idx) && arr[idx]){
    arr.splice(idx,1); saveSlots(arr); renderSlots();
    window.dispatchEvent(new StorageEvent('storage', { key:'availableSlots' }));
  }
}

/* === actions === */
document.addEventListener('DOMContentLoaded', ()=>{
  // init
  renderSlots();
  renderBookings();

  // add slot
  document.getElementById('addSlot')?.addEventListener('click', addSlot);

  // remove slot (delegacja)
  document.getElementById('slotsList')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.removeSlot');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    removeSlotByIndex(idx);
  });

  // bookings actions
  document.getElementById('upcoming')?.addEventListener('click', (e)=>{
    const c = e.target.closest('.confirm');
    const d = e.target.closest('.delete');
    const arr = loadBookings();
    if (c) {
      const i = Number(c.dataset.idx);
      if (arr[i]) { arr[i].status = 'Potwierdzona'; saveBookings(arr); renderBookings(); }
    }
    if (d) {
      const i = Number(d.dataset.idx);
      if (arr[i]) { arr.splice(i,1); saveBookings(arr); renderBookings(); }
    }
  });
});
