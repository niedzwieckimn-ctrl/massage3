/* ========= Helpers ========= */

// Prosty fmt HH:MM
function fmtHM(d) {
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}

// Czy wygląda jak UUID?
const isUUID = (v)=> /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');

/**
 * Pobiera slot po dacie (YYYY-MM-DD) i godzinie (HH:MM)
 * Szuka w Supabase między 00:00 a 23:59 tego dnia i filtruje po HH:MM (lokalnie).
 * Zwraca obiekt slotu { id, when, taken } lub null.
 */
async function getSlotByDateTime(dateStr, timeStr) {
  if (!window.sb) return null;
  try {
    const [y,m,d] = dateStr.split('-').map(Number);
    // zakres: północ..23:59 UTC (unikamy Invalid time value)
    const from = new Date(Date.UTC(y, m-1, d, 0, 0, 0));
    const to   = new Date(Date.UTC(y, m-1, d, 23, 59, 59));

    const { data: slots, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .gte('when', from.toISOString())
      .lt('when',  to.toISOString())
      .order('when', { ascending: true });

    if (error || !Array.isArray(slots)) return null;

    // dopasuj po HH:MM (czas lokalny)
    const found = slots.find(s => fmtHM(new Date(s.when)) === timeStr);
    return found || null;
  } catch (e) {
    console.warn('[public] getSlotByDateTime ERR', e);
    return null;
  }
}

/**
 * Zwraca id klienta po e-mailu; jeśli nie istnieje – tworzy.
 */
async function ensureClient({ name, email, phone, address }) {
  if (!window.sb) return null;
  // 1) spróbuj znaleźć
  let { data: found, error: fErr } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();

  if (found && found.id) return found.id;

  // 2) utwórz
  let { data: created, error: cErr } = await window.sb
    .from('clients')
    .insert([{ name, email, phone, address }])
    .select('id')
    .single();

  if (cErr || !created?.id) {
    console.error('[public] create client ERR:', cErr);
    return null;
  }
  return created.id;
}

/**
 * Tworzy rezerwację i oznacza slot jako zajęty.
 * Zwraca { ok:true, booking } albo { ok:false, error }.
 */
async function createBooking({ client_id, service_id, slot_id, notes }) {
  if (!window.sb) return { ok:false, error:'no sb' };

  // 1) insert bookings
  let { data: booking, error: bErr } = await window.sb
    .from('bookings')
    .insert([{ client_id, service_id, slot_id, notes }])
    .select('id, created_at')
    .single();

  if (bErr) return { ok:false, error:bErr };

  // 2) mark slot taken
  let { error: updErr } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id);

  if (updErr) console.warn('[public] slot mark taken ERR:', updErr);

  return { ok:true, booking };
}

/**
 * Ładuje aktywne usługi do <select id="service">.
 * Czyści select przed wypełnieniem – nie ma duplikatów.
 */
async function loadServicesToSelect() {
  const sel = document.getElementById('service');
  if (!sel) return;

  // placeholder
  sel.innerHTML = `<option value="">Wybierz zabieg</option>`;

  if (!window.sb) return; // brak sb – zostaw tylko placeholder

  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error || !Array.isArray(data)) return;

  const opts = data.map(s => {
    const price = (s.price ?? 0).toFixed(2).replace('.', ',');
    return `<option value="${s.id}">${s.name} — ${price} zł</option>`;
  }).join('');

  sel.insertAdjacentHTML('beforeend', opts);
}

/**
 * Odświeża wolne sloty w localStorage – korzysta z Supabase,
 * żeby kalendarz klienta miał świeże dane.
 */
async function refreshClientSlotsCache() {
  if (!window.sb) return;
  try {
    const { data: freshSlots } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .order('when', { ascending: true });

    localStorage.setItem('slots', JSON.stringify(freshSlots || []));
  } catch(_) {}
}

/* ========= Inicjalizacja ========= */

(function(){
  const form = document.getElementById('bookingForm');
  if (!form) return;

  // przy wejściu na stronę spróbuj wczytać usługi
  loadServicesToSelect().catch(()=>{});

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // 1) zbierz dane
    const name     = (document.getElementById('name')?.value || '').trim();
    const email    = (document.getElementById('email')?.value || '').trim();
    const phone    = (document.getElementById('phone')?.value || '').trim();
    const address  = (document.getElementById('address')?.value || '').trim();
    const dateStr  = (document.getElementById('date')?.value || '').trim();
    const timeStr  = (document.getElementById('time')?.value || '').trim(); // może HH:MM albo UUID
    const notes    = (document.getElementById('notes')?.value || '').trim();
    const rodo     = !!document.querySelector('#rodo')?.checked;

    if (!name || !email || !phone || !dateStr || !timeStr || !rodo) {
      alert('Uzupełnij wymagane pola (w tym zgoda RODO).');
      return;
    }

    // 2) usługa – UUID bezpośrednio z <select id="service">
    const service_id = document.getElementById('service')?.value || '';
    if (!service_id || !isUUID(service_id)) {
      alert('Wybierz zabieg.');
      return;
    }

    // 3) slot – jeśli timeStr to UUID → używamy; jeśli HH:MM → pobierz z SB
    let slot_id = '';
    if (isUUID(timeStr)) {
      slot_id = timeStr;
    } else {
      const slot = await getSlotByDateTime(dateStr, timeStr);
      if (!slot) { alert('Nie znaleziono wybranego terminu.'); return; }
      if (slot.taken) { alert('Wybrany termin jest już zajęty.'); return; }
      slot_id = slot.id;
    }

    // 4) klient – znajdź lub utwórz
    const client_id = await ensureClient({ name, email, phone, address });
    if (!client_id) { alert('Nie udało się zapisać klienta.'); return; }

    // 5) rezerwacja
    const r = await createBooking({ client_id, service_id, slot_id, notes });
    if (!r.ok) { alert('Nie udało się utworzyć rezerwacji.'); return; }

    // 6) odśwież sloty u klienta (mapka)
    await refreshClientSlotsCache();

    // 7) opcjonalnie baner "Dziękujemy"
    const thanks = document.getElementById('bookingThanks');
    if (thanks) { thanks.classList.remove('hidden'); setTimeout(()=>thanks.classList.add('hidden'), 4000); }

    form.reset();
  });
})();
async function populateServicesSelect() {
  const sel = document.getElementById('service');
  if (!sel || !window.sb) return;

  sel.innerHTML = '<option value="">Wybierz zabieg</option>';

  const { data, error } = await window.sb
    .from('services')
    .select('id,name,price,active')
    .eq('active', true)
    .order('name', { ascending:true });

  if (error) {
    console.warn('[public] services pull error:', error);
    return;
  }

  (data || []).forEach(s => {
    const o = new Option(`${s.name} — ${Number(s.price||0).toFixed(2)} zł`, s.id);
    sel.add(o);
  });
}

// po DOMContentLoaded:
document.addEventListener('DOMContentLoaded', ()=>{
  populateServicesSelect();   // <-- to musi się wykonać po załadowaniu strony
});
