/* ===========================
   Helpers
=========================== */

function $(sel) { return document.querySelector(sel); }

function showToast(msg) {
  const t = document.getElementById('toast');
  const tx = document.getElementById('toast-text');
  if (t && tx) {
    tx.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3500);
  } else {
    alert(msg);
  }
}

function fmtHM(date) {
  try { return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function dayRangeLocalISO(dateStr) {
  // bez sufiksu "Z" – pracujemy w czasie lokalnym
  const from = new Date(`${dateStr}T00:00:00`);
  const to   = new Date(`${dateStr}T23:59:59`);
  return { from, to };
}

/* ===========================
   Netlify send-email wrapper
=========================== */

async function sendMailTherapist(subject, html) {
  // Jeśli nie ma okna sendEmail – to pomijamy w ciszy
  if (typeof window.sendEmail !== 'function') {
    console.warn('[MAIL] sendEmail not found – pomijam wysyłkę.');
    return { ok: false, skipped: true };
  }
  try {
    const r = await window.sendEmail({ subject, html });
    return { ok: true, response: r };
  } catch (e) {
    console.warn('[MAIL] błąd wysyłki:', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/* ===========================
   Kalendarz: odświeżenie / poke
=========================== */

function pokeCalendar() {
  // 1) jeśli masz funkcję podświetlania – użyj jej
  try {
    if (typeof window.updateCalendarHighlights === 'function') {
      window.updateCalendarHighlights();
    }
  } catch {}

  // 2) jeśli używasz flatpickr i trzymasz referencję w window.fp – przerysuj
  try {
    if (window.fp && typeof window.fp.redraw === 'function') {
      window.fp.redraw();
    }
  } catch {}

  // 3) dodatkowo wyemituj storage-event dla legacy integracji
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: 'slots' }));
  } catch {}
}

// (opcjonalnie) zsynchronizuj wolne sloty do localStorage('slots') – dla podświetlania dni:
async function syncSlotsToLS() {
  if (!window.sb) return;
  try {
    const nowISO = new Date().toISOString();
    const { data: slots, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .gte('when', nowISO)
      .eq('taken', false)
      .order('when', { ascending: true });

    if (!error && Array.isArray(slots)) {
      // Tu zapis do LS jest tylko dla kalendarza (legacy). Jeśli nie chcesz – zakomentuj dwie linijki niżej.
      localStorage.setItem('slots', JSON.stringify(slots));
      window.dispatchEvent(new StorageEvent('storage', { key: 'slots' }));
    }
  } catch {}
}

/* ===========================
   SUPABASE – operacje
=========================== */

// 1) ładuj usługi do <select id="service">
async function renderServicesSelect() {
  const sel = document.getElementById('service');
  if (!sel || !window.sb) return;

  sel.innerHTML = '<option value="">Wybierz zabieg</option>';

  const { data, error } = await window.sb
    .from('services')
    .select('id, name, price, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error || !Array.isArray(data)) {
    console.warn('[services] pull ERR:', error);
    return;
  }

  const opts = data.map(s => {
    const o = document.createElement('option');
    o.value = s.id; // UUID
    o.dataset.name = s.name;
    const price = Number(s.price || 0).toFixed(2).replace('.', ',');
    o.textContent = `${s.name} — ${price} zł`;
    return o;
  });

  opts.forEach(o => sel.appendChild(o));
}

// 2) pobierz wolne sloty (taken=false) dla danej daty
async function getFreeSlotsForDate(dateStr) {
  if (!window.sb) return [];
  const { from, to } = dayRangeLocalISO(dateStr);
  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', from.toISOString())
    .lte('when', to.toISOString())
    .eq('taken', false)
    .order('when', { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data;
}

// 3) wypełnij <select id="time"> na podstawie danej daty
async function renderTimeOptions() {
  const dateEl = document.getElementById('date');
  const timeSel = document.getElementById('time');
  if (!dateEl || !timeSel) return;

  const dateVal = dateEl.value;
  timeSel.innerHTML = '';
  timeSel.disabled = true;

  if (!dateVal) {
    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = 'Najpierw wybierz datę';
    timeSel.appendChild(ph);
    return;
  }

  const free = await getFreeSlotsForDate(dateVal);

  if (!free.length) {
    const o = document.createElement('option');
    o.value = '';
    o.disabled = true;
    o.textContent = 'Brak wolnych godzin';
    timeSel.appendChild(o);
    return;
  }

  const ph = document.createElement('option');
  ph.value = '';
  ph.disabled = true;
  ph.selected = true;
  ph.textContent = 'Wybierz godzinę';
  timeSel.appendChild(ph);

  free.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;            // <--- używamy ID slotu
    o.dataset.when = s.when;   // (opcjonalnie) ISO – do debug/podglądu
    o.textContent = fmtHM(new Date(s.when));
    timeSel.appendChild(o);
  });

  timeSel.disabled = false;
}

// 4) znajdź/utwórz klienta
async function dbFindOrCreateClient({ name, email, phone, address }) {
  if (!window.sb) return null;
  // spróbuj znaleźć po e-mailu
  let { data: cl, error: qErr } = await window.sb
    .from('clients')
    .select('id')
    .eq('email', email)
    .single();

  if (qErr || !cl) {
    // wstaw
    const ins = await window.sb
      .from('clients')
      .insert({ name, email, phone, address })
      .select('id')
      .single();
    if (ins.error || !ins.data) return null;
    cl = ins.data;
  }
  return cl.id;
}

// 5) utwórz rezerwację
async function dbCreateBooking({ client_id, service_id, slot_id, notes }) {
  if (!window.sb) return null;
  const { data, error } = await window.sb
    .from('bookings')
    .insert({ client_id, service_id, slot_id, notes })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

// 6) oznacz slot jako zajęty
async function dbMarkSlotTaken(slot_id) {
  if (!window.sb) return false;
  const { error } = await window.sb
    .from('slots')
    .update({ taken: true })
    .eq('id', slot_id);
  return !error;
}

/* ===========================
   Formularz: obsługa submit
=========================== */

async function handleSubmit(e) {
  e.preventDefault();
  console.log('[FORM] submit start');

  // 1) zbierz dane
  const name   = $('#name')?.value?.trim() || '';
  const email  = $('#email')?.value?.trim() || '';
  const phone  = $('#phone')?.value?.trim() || '';
  const address= $('#address')?.value?.trim() || '';
  const notes  = $('#notes')?.value?.trim() || '';
  const rodo   = $('#rodo')?.checked || false;

  const serviceSel = $('#service');
  const service_id = serviceSel?.value || '';
  const service_name = serviceSel?.options?.[serviceSel.selectedIndex]?.dataset?.name || serviceSel?.options?.[serviceSel.selectedIndex]?.textContent || '';

  const dateStr = $('#date')?.value || '';
  const timeSel = $('#time');
  const slot_id = timeSel?.value || '';

  if (!name || !email || !phone || !dateStr || !slot_id || !service_id || !rodo) {
    showToast('Uzupełnij wymagane pola (w tym zgoda RODO).');
    return;
  }

  // 2) rewalidacja slotu w Supabase po ID (musi istnieć i być wolny)
  try {
    const { data: slot, error: sErr } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('id', slot_id)
      .single();

    if (sErr || !slot || slot.taken) {
      showToast('Wybrany termin jest już zajęty.');
      // szybkie odświeżenie listy godzin + kalendarza
      await renderTimeOptions();
      await syncSlotsToLS();
      pokeCalendar();
      return;
    }
  } catch (e2) {
    console.warn('[FORM] slot revalidate ERR:', e2);
    showToast('Błąd rewalidacji terminu.');
    return;
  }

  // 3) klient
  const client_id = await dbFindOrCreateClient({ name, email, phone, address });
  if (!client_id) {
    showToast('Nie udało się zapisać klienta.');
    return;
  }

  // 4) rezerwacja
  const booking_id = await dbCreateBooking({ client_id, service_id, slot_id, notes });
  if (!booking_id) {
    showToast('Nie udało się utworzyć rezerwacji.');
    return;
  }

  // 5) oznacz slot jako zajęty
  const okTaken = await dbMarkSlotTaken(slot_id);
  if (!okTaken) {
    showToast('Nie udało się zablokować terminu.');
    return;
  }

  // 6) baner „Dziękujemy”
  const ty = document.getElementById('bookingThanks');
  if (ty) {
    ty.innerHTML = 'Dziękujemy za dokonanie rezerwacji,<br>poczekaj na jej potwierdzenie!';
    ty.style.display = 'block';
    setTimeout(() => { ty.style.display = 'none'; }, 5000);
  }

  // 7) e-mail do masażystki (jeśli funkcja istnieje)
  try {
    const html = `
      <h3>NOWA rezerwacja</h3>
      <p><b>Zabieg:</b> ${service_name || '(brak nazwy)'}<br/>
      <b>Data:</b> ${dateStr}<br/>
      <b>Godzina:</b> ${$('#time')?.options?.[$('#time').selectedIndex]?.textContent || ''}</p>
      <p><b>Klient:</b> ${name}<br/>Adres: ${address}<br/>Tel.: ${phone}<br/>Email: ${email}</p>
      ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : '' }
    `;
    await sendMailTherapist(`Nowa rezerwacja — ${dateStr}`, html);
  } catch (e) {
    console.warn('[MAIL] wysyłka ERR:', e);
  }

  // 8) odśwież UI (godziny / kalendarz)
  try {
    await renderTimeOptions(); // lista godzin
    await syncSlotsToLS();     // (opcjonalnie) synchro do LS, żeby kalendarz miał aktualne wolne
    pokeCalendar();            // i "szturchamy" kalendarz
  } catch {}

  // 9) reset
  document.getElementById('form')?.reset();
  console.log('[FORM] submit done!');
}

/* ===========================
   Init
=========================== */

document.addEventListener('DOMContentLoaded', async () => {
  // min dzisiejsza data
  const d = document.getElementById('date');
  if (d) d.setAttribute('min', new Date().toISOString().slice(0, 10));

  // listeners
  const form = document.getElementById('form');
  if (form) {
    // zabezpieczenie przed wielokrotnym bindem
    if (!form._bound) {
      form.addEventListener('submit', handleSubmit);
      form._bound = true;
    }
  }
  const dEl = document.getElementById('date');
  if (dEl) dEl.addEventListener('change', renderTimeOptions);

  // usługi + godziny na start
  try { await renderServicesSelect(); } catch {}
  try { await renderTimeOptions(); } catch {}

  // (opcjonalnie) zsynchronizuj wolne sloty do LS i odśwież kalendarz – żeby „duchy” nie miały punktu zaczepienia:
  try { await syncSlotsToLS(); } catch {}
  pokeCalendar();
});
