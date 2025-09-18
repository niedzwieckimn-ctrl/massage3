/* === STORAGE helpers === */
function loadSlots(){ try { return JSON.parse(localStorage.getItem('availableSlots')||'[]'); } catch { return []; } }
function saveSlots(a){ localStorage.setItem('availableSlots', JSON.stringify(a)); }
function loadBookings(){ try { return JSON.parse(localStorage.getItem('bookings')||'[]'); } catch { return []; } }
function saveBookings(a){ localStorage.setItem('bookings', JSON.stringify(a)); }

/* === GODZINY dla wybranej daty === */
function uniqueDates(){ return [...new Set(loadSlots().filter(s=>s?.date).map(s=>s.date))]; }
function timesForDate(date){
  return loadSlots()
    .filter(s => s?.date === date && s?.time)
    .map(s => String(s.time).slice(0,5))
    .sort((a,b)=>a.localeCompare(b));
}

function refreshCalendarEnabledDays(){
  const dateEl = document.querySelector('#date');
  const fp = dateEl && dateEl._flatpickr;
  if (!fp) return;
  fp.set('enable', uniqueDates());
  fp.redraw();
}

function populateTimeOptions(){
  const dateEl = document.querySelector('#date');
  const timeEl = document.querySelector('#time');
  if (!dateEl || !timeEl) return;
  const d = (dateEl.value || '').trim();
  const times = d ? timesForDate(d) : [];
  timeEl.innerHTML = '';
  if (!d) { timeEl.disabled = true; timeEl.add(new Option('— wybierz datę —','')); return; }
  if (!times.length) { timeEl.disabled = true; timeEl.add(new Option('Brak wolnych godzin','')); return; }
  timeEl.disabled = false;
  times.forEach(t => timeEl.add(new Option(t, t)));
}

/* === Hook odświeżający, wołany po zmianie slotów (rezerwacja/usuwanie) === */
window.onSlotsChanged = function(){
  refreshCalendarEnabledDays();
  populateTimeOptions();
};

/* === Jedyny handler REZERWACJI === */
function getText(sel){
  const el = document.querySelector(sel);
  if (!el) return '';
  if (el.tagName === 'SELECT') {
    const opt = el.options[el.selectedIndex];
    return (opt?.text || opt?.label || '').trim();
  }
  return (el.value || '').trim();
}
function genShortId(){ return String(Math.floor(1000 + Math.random() * 9000)); }

function installSubmit(){
  let form = document.querySelector('#form') || document.querySelector('form');
  if (!form) return;
  // zdejmij stare listenery przez klon
  const clone = form.cloneNode(true);
  form.parentNode.replaceChild(clone, form);
  form = clone;

  let SENDING = false;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (SENDING) return; SENDING = true;

    const reservation = {
      id: genShortId(),
      service: getText('#service'),
      date: getText('#date'),
      time: getText('#time'),
      notes: getText('#notes'),
      client: {
        name:    getText('#name'),
        email:   getText('#email'),
        phone:   getText('#phone'),
        address: getText('#address'),
      },
    };

    try {
      const res = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation })
      });
      const t = await res.text(); let data={}; try{ data = JSON.parse(t); }catch{}

      if (res.ok && data.ok) {
        // bookings (z terminem wizyty)
        const arr = loadBookings();
        arr.push({ ...reservation, status:'Oczekująca', createdAt: new Date().toISOString() });
        saveBookings(arr);

        // zdejmij slot z availableSlots
        const slots = loadSlots();
        const i = slots.findIndex(s => s?.date===reservation.date && String(s.time||'').slice(0,5)===String(reservation.time||'').slice(0,5));
        if (i > -1) { slots.splice(i,1); saveSlots(slots); }

        // baner
        const b = document.getElementById('bookingThanks');
        if (b){ b.classList.add('show'); setTimeout(()=>b.classList.remove('show'), 3500); }

        // odśwież kalendarz/godziny
        window.onSlotsChanged();
      } else {
        alert('❌ Błąd wysyłki: ' + (data.error || t || res.status));
      }
    } catch(err){
      alert('❌ Błąd sieci: ' + err.message);
    } finally {
      SENDING = false;
    }
  }, { capture:true });
}

/* === Start === */
document.addEventListener('DOMContentLoaded', ()=>{
  populateTimeOptions();
  refreshCalendarEnabledDays();

  // jeśli używasz flatpickr, dopnij onChange, by po wyborze dnia odświeżyć godziny
  const dateEl = document.querySelector('#date');
  if (dateEl){
    dateEl.addEventListener('change', populateTimeOptions);
    if (dateEl._flatpickr) {
      dateEl._flatpickr.config.onChange.push(()=> setTimeout(populateTimeOptions, 0));
    }
  }

  // reaguj na zmiany z admina (inna karta)
  window.addEventListener('storage', (e)=>{
    if (['availableSlots'].includes(e.key)) window.onSlotsChanged();
  });

  installSubmit();
});
