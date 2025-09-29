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

  // wyczyść poprzednie opcje
  timeEl.innerHTML = '';

  // pobierz sloty z cache
  const slots = JSON.parse(localStorage.getItem('slots') || '[]');
  const todays = slots
    .filter(s => !s.taken && new Date(s.when).toISOString().slice(0,10) === dateStr)
    .sort((a,b) => new Date(a.when) - new Date(b.when));

  if (todays.length === 0) {
    const opt = new Option('Brak wolnych godzin', '');
    opt.disabled = true;
    opt.selected = true;
    timeEl.add(opt);
    return;
  }

  // dodaj wszystkie godziny
  todays.forEach(s => {
    const t = new Date(s.when);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    timeEl.add(new Option(`${hh}:${mm}`, s.id));
  });

  // jeśli tylko jedna godzina → ustaw od razu
  if (todays.length === 1) {
    timeEl.selectedIndex = 0;
    timeEl.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // inaczej dodaj placeholder na początek
    const ph = new Option('Wybierz godzinę…', '');
    ph.disabled = true;
    timeEl.insertBefore(ph, timeEl.firstChild);
    timeEl.selectedIndex = 0;
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
