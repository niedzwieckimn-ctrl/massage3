// assets/app.calendar.js
(function (global) {
  const ymd = d => new Date(d).toISOString().slice(0,10);
  const byTime = (a,b) => new Date(a.when) - new Date(b.when);

  function getSlots() {
    try { return JSON.parse(localStorage.getItem('slots') || '[]') || []; }
    catch { return []; }
  }

  function buildMap(slots) {
    const map = {};
    for (const s of slots) {
      if (s.taken) continue;
      const k = ymd(s.when);
      (map[k] ||= []).push(s);
    }
    Object.values(map).forEach(arr => arr.sort(byTime));
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
      timeEl.add(new Option(`${hh}:${mm}`, s.id));
    }
  }

  function mount() {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const map = buildMap(getSlots());
    const days = Object.keys(map).sort();

    if (days.length) {
      dateEl.min = days[0];
      dateEl.max = days[days.length - 1];
      if (!dateEl.value || !map[dateEl.value]) dateEl.value = days[0];
      fillTimes(dateEl.value);
    } else {
      dateEl.removeAttribute('min'); dateEl.removeAttribute('max');
      const timeEl = document.getElementById('time');
      if (timeEl) { timeEl.innerHTML = ''; timeEl.add(new Option('Brak wolnych godzin','')); }
    }
  }

  document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'date') fillTimes(e.target.value);
  });
  window.addEventListener('slots-synced', mount);

  global.ModCalendar = { refresh: mount, fillTimes };
})(window);
