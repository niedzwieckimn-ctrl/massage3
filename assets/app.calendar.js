// assets/app.calendar.js
(function (global) {
  const byTime = (a,b) => new Date(a.when) - new Date(b.when);
  const ymd = d => new Date(d).toISOString().slice(0,10);

  function getSlots() {
    try { return JSON.parse(localStorage.getItem('slots') || '[]') || []; }
    catch { return []; }
  }

  function buildMap(slots) {
    const map = {};
    for (const s of slots) {
      if (s.taken === true) continue;         // pokazuj tylko wolne
      const k = ymd(s.when);
      (map[k] ||= []).push(s);
    }
    for (const k in map) map[k].sort(byTime);
    return map;
  }

  function fillTimes(dateStr) {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;

    const map = buildMap(getSlots());
    const list = map[dateStr] || [];

    timeEl.innerHTML = '';
    if (!list.length) {
      const o = new Option('Brak wolnych godzin', '');
      o.disabled = true; o.selected = true;
      timeEl.add(o);
      return;
    }

    const ph = new Option('Wybierz godzinę…', '');
    ph.disabled = true; ph.selected = true;
    timeEl.add(ph);

    for (const s of list) {
      const t = new Date(s.when);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      timeEl.add(new Option(`${hh}:${mm}`, s.id));  // value = id slota
    }
  }

  function mount() {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const map = buildMap(getSlots());
    const days = Object.keys(map).sort();

    // ustaw zakres i domyślną datę
    if (days.length) {
      dateEl.min = days[0];
      dateEl.max = days[days.length-1];
      if (!dateEl.value || !map[dateEl.value]) dateEl.value = days[0];
    } else {
      dateEl.removeAttribute('min'); dateEl.removeAttribute('max');
    }

    if (dateEl.value) fillTimes(dateEl.value);
    else {
      const timeEl = document.getElementById('time');
      if (timeEl) { timeEl.innerHTML = ''; timeEl.add(new Option('Brak wolnych godzin','')); }
    }
  }

  // zmiana daty -> odśwież godziny
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'date') fillTimes(e.target.value);
  });

  // pierwszy render po starcie
  document.addEventListener('DOMContentLoaded', mount);

  // po synchronizacji slotów (CloudSlots.pull) – przerysuj
  global.addEventListener('slots-synced', mount);

  // opcjonalny ręczny refresh
  global.ModCalendar = { refresh: mount, fillTimes };
})(window);
