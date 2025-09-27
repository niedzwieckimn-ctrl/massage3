/* ===========================
   Pomocnicze (bez zmian UI)
=========================== */

function el(sel){ return document.querySelector(sel); }
function els(sel){ return Array.from(document.querySelectorAll(sel)); }

function fmt2(n){ return (n<10?'0':'')+n; }
function fmtHM(d){
  const nd = (d instanceof Date) ? d : new Date(d);
  return fmt2(nd.getHours())+':'+fmt2(nd.getMinutes());
}
function fmtDate(d){
  const nd = (d instanceof Date) ? d : new Date(d);
  return nd.getFullYear()+'-'+fmt2(nd.getMonth()+1)+'-'+fmt2(nd.getDate());
}

/* prosta warstwa na localStorage – używamy jako cache */
const LS = {
  get(key, def){
    try{
      if (window.Store && Store.get) return Store.get(key, def); // jeśli masz Store.js
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (def ?? null);
    }catch(e){ return def ?? null; }
  },
  set(key, val){
    try{
      if (window.Store && Store.set) return Store.set(key, val);
      localStorage.setItem(key, JSON.stringify(val));
    }catch(e){}
  }
};

/* mały toast (opcjonalnie – nie psuje Twoich istniejących) */
function toast(msg, type='warning', ms=4000){
  // jeśli masz już swoje toasty – możesz podmienić tę funkcję na no-op
  try{
    const t = document.createElement('div');
    t.className = 'toast '+type;
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', left:'50%', bottom:'20px', transform:'translateX(-50%)',
      background:'#333', color:'#fff', padding:'10px 14px', borderRadius:'8px', zIndex:9999,
      fontSize:'14px', boxShadow:'0 6px 20px rgba(0,0,0,.25)'
    });
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), ms);
  }catch(e){}
}

/* ===========================
   SUPABASE – adapter publiczny
=========================== */

/**
 * Pobierz usługi (aktywne) i wyrenderuj do <select id="service">.
 * Każdy <option> ma data-id = uuid (service.id).
 */
async function renderServices(){
  const sel = el('#service');
  if (!sel) return;

  // wyczyść (bez duplikatów)
  sel.innerHTML = '';
  // placeholder
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Wybierz zabieg';
  sel.appendChild(ph);

  let services = LS.get('services', []);
  // najpierw cache, żeby UI nie było puste
  if (Array.isArray(services) && services.length){
    for (const s of services){
      const opt = document.createElement('option');
      opt.value = s.name;           // wyświetlasz nazwę, ale...
      opt.dataset.id = s.id;        // ...używamy uuid do zapisu
      opt.textContent = `${s.name} — ${(Number(s.price)||0).toFixed(2)} zł`;
      sel.appendChild(opt);
    }
  }

  // spróbuj ściągnąć z chmury
  if (window.sb){
    try{
      const { data, error } = await window.sb
        .from('services')
        .select('id, name, price, duration_min, active')
        .eq('active', true)
        .order('name', { ascending: true });

      if (!error && Array.isArray(data)){
        LS.set('services', data);
        // nadpisz listę (żeby nie dublować)
        sel.innerHTML = '';
        const ph2 = document.createElement('option');
        ph2.value = '';
        ph2.textContent = 'Wybierz zabieg';
        sel.appendChild(ph2);

        for (const s of data){
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.dataset.id = s.id;
          opt.textContent = `${s.name} — ${(Number(s.price)||0).toFixed(2)} zł`;
          sel.appendChild(opt);
        }
      }
    }catch(e){
      console.warn('[public] renderServices ERR:', e);
    }
  }
}

/**
 * Ściągnij z Supabase wszystkie WOLNE sloty i zapisz do cache (localStorage).
 * Używane do mapki godzin.
 */
async function pullPublicSlots(){
  if (!window.sb) return;
  try{
    const { data, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .order('when', { ascending: true });

    if (!error && Array.isArray(data)){
      LS.set('slots', data);
    }
  }catch(e){
    console.warn('[public] pullPublicSlots ERR:', e);
  }
}

/**
 * Zwraca slot (id, when, taken) po dacie i godzinie wybranej przez klienta.
 * Szuka w Supabase w zakresie 00:00–23:59 UTC danego dnia,
 * a następnie dopasowuje HH:MM lokalne.
 */
async function getSlotByDateTime(dateStr, timeStr){
  if (!window.sb) return null;
  try{
    const [y,m,d] = dateStr.split('-').map(Number);
    // zakres dnia UTC
    const from = new Date(Date.UTC(y, m-1, d, 0, 0, 0));
    const to   = new Date(Date.UTC(y, m-1, d, 23, 59, 59));

    const { data: slots, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .eq('taken', false)
      .gte('when', from.toISOString())
      .lte('when', to.toISOString())
      .order('when', { ascending: true });

    if (error || !Array.isArray(slots)) return null;

    // dopasuj HH:MM w czasie lokalnym
    const found = slots.find(s => fmtHM(new Date(s.when)) === timeStr);
    return found || null;
  }catch(e){
    console.warn('[public] getSlotByDateTime ERR:', e);
    return null;
  }
}

/**
 * Znajdź po e-mailu lub utwórz klienta.
 * Zwraca uuid klienta lub null.
 */
async function ensureClient({ name, email, phone, address }){
  if (!window.sb) return null;
  try{
    let { data: c, error: e1 } = await window.sb
      .from('clients')
      .select('id')
      .eq('email', email)
      .single();

    if (c && c.id) return c.id;

    let { data: ins, error: e2 } = await window.sb
      .from('clients')
      .insert({ name, email, phone, address })
      .select('id')
      .single();

    if (ins && ins.id) return ins.id;
  }catch(e){
    console.warn('[public] ensureClient ERR:', e);
  }
  return null;
}

/**
 * Utwórz rezerwację (bookings), oznacz slot jako zajęty, odśwież publiczne sloty (cache).
 * Zwraca { ok: true/false, booking }.
 */
async function createBooking({ client_id, service_id, slot_id, notes }){
  if (!window.sb) return { ok:false, error:'no sb' };
  try{
    const { data: booking, error: bErr } = await window.sb
      .from('bookings')
      .insert({ client_id, service_id, slot_id, notes })
      .select('id, created_at')
      .single();

    if (bErr) return { ok:false, error:bErr };

    // oznacz slot jako zajęty
    const { error: sErr } = await window.sb
      .from('slots')
      .update({ taken: true })
      .eq('id', slot_id);
    if (sErr) console.warn('[public] slot mark taken ERR:', sErr);

    // odśwież wolne sloty w cache
    await pullPublicSlots();

    return { ok:true, booking };
  }catch(e){
    console.warn('[public] createBooking ERR:', e);
    return { ok:false, error:e };
  }
}

/* ===========================
   Render godzin (mapka slotów)
=========================== */

function renderTimeOptions(){
  const dateEl = el('#date');
  const timeEl = el('#time');
  if (!dateEl || !timeEl) return;

  const dateStr = dateEl.value?.trim();
  timeEl.innerHTML = '';

  if (!dateStr){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Wybierz datę.';
    timeEl.appendChild(opt);
    return;
  }

  // sloty z cache (wcześniej ściągane z chmury)
  const slots = LS.get('slots', []) || [];
  const filtered = slots
    .filter(s => !s.taken && fmtDate(s.when) === dateStr)
    .sort((a,b) => new Date(a.when) - new Date(b.when));

  if (!filtered.length){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Brak wolnych godzin.';
    timeEl.appendChild(opt);
    return;
  }

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Wybierz godzinę…';
  timeEl.appendChild(ph);

  for (const s of filtered){
    const opt = document.createElement('option');
    opt.value = fmtHM(new Date(s.when));
    opt.textContent = fmtHM(new Date(s.when));
    timeEl.appendChild(opt);
  }
}

/* ===========================
   Obsługa formularza (JEDEN submit)
=========================== */

async function handleSubmit(e){
  e.preventDefault();
  console.log('[FORM] submit start');

  // 1) Dane z formularza
  const name   = el('#name')?.value?.trim() || '';
  const email  = el('#email')?.value?.trim() || '';
  const phone  = el('#phone')?.value?.trim() || '';
  const address= el('#address')?.value?.trim() || '';
  const notes  = el('#notes')?.value?.trim() || '';
  const rodo   = el('#rodo')?.checked || false;

  const dateStr= el('#date')?.value?.trim() || '';
  const timeStr= el('#time')?.value?.trim() || '';

  // 2) Usługa – bierzemy UUID z <option data-id>
  const sel    = el('#service');
  const service_id = sel && sel.selectedIndex>0 ? sel.options[sel.selectedIndex].dataset.id : '';
  const service_name = sel && sel.selectedIndex>0 ? sel.options[sel.selectedIndex].textContent : '';

  if (!name || !email || !phone || !dateStr || !timeStr || !service_id || !rodo){
    toast('Uzupełnij wymagane pola (w tym zgoda RODO).', 'warning');
    return;
  }

  // 3) szukamy slota po dacie/godzinie
  let slot = null;
  try{
    slot = await getSlotByDateTime(dateStr, timeStr);
  }catch(e){
    console.warn('[FORM] getSlotByDateTime ERR:', e);
  }
  if (!slot){
    toast('Nie znaleziono wybranego terminu.', 'warning');
    return;
  }

  // 4) klient (po e-mailu)
  const client_id = await ensureClient({ name, email, phone, address });
  if (!client_id){
    toast('Nie udało się zapisać klienta.', 'warning');
    return;
  }

  // 5) rezerwacja
  const res = await createBooking({
    client_id,
    service_id,
    slot_id: slot.id,
    notes
  });
  if (!res.ok){
    console.warn('[FORM] booking err:', res.error);
    toast('Nie udało się utworzyć rezerwacji.', 'warning');
    return;
  }

  // 6) e-mail do masażystki (jeśli masz sendEmail)
  if (typeof sendEmail === 'function'){
    try{
      const whenStr = `${dateStr} ${timeStr}`;
      const html = `
        <h3>Nowa rezerwacja</h3>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Zabieg:</b> ${service_name}</p>
        <p><b>Klient:</b> ${name}</p>
        <p><b>Adres / kontakt:</b> ${address}<br>Tel.: ${phone}<br>Email: ${email}</p>
        ${notes ? `<p><b>Uwagi:</b> ${notes}</p>` : ''}
      `;
      await sendEmail({ subject:`Nowa rezerwacja — ${whenStr}`, html });
    }catch(e){
      console.warn('[FORM] e-mail ERR:', e);
    }
  }

  // 7) baner „Dziękujemy” + reset
  const thanks = document.getElementById('bookingThanks');
  if (thanks){
    thanks.innerHTML = 'Dziękujemy za rezerwację.<br>Poczekaj na potwierdzenie e-mail.';
    thanks.classList.add('show');
    setTimeout(()=>thanks.classList.remove('show'), 5000);
  }
  el('#form')?.reset();
  renderTimeOptions();

  console.log('[FORM] submit done!');
}

/* ===========================
   INIT – jeden zestaw listenerów
=========================== */

async function initPublic(){
  // minimalna data (dziś)
  const d = el('#date');
  if (d) d.setAttribute('min', new Date().toISOString().slice(0,10));

  await pullPublicSlots();   // cache slotów
  await renderServices();    // <select> usługi
  renderTimeOptions();       // godziny dla domyślnej/wybranej daty

  // reaguj na zmianę daty
  el('#date')?.addEventListener('change', renderTimeOptions);

  // JEDEN submit
  const form = el('#form');
  if (form && !form._bound){
    form.addEventListener('submit', handleSubmit);
    form._bound = true;
  }

  // odśwież mapkę, gdy LS się zmieni (np. przez Admina)
  window.addEventListener('storage', (e)=>{
    if (e.key === 'slots' || e.key === 'bookings') renderTimeOptions();
    if (e.key === 'services') renderServices();
  });
}

window.addEventListener('DOMContentLoaded', ()=>{ initPublic(); });
