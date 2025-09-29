(function (global) {
  const ymd = d => new Date(d).toISOString().slice(0,10);
  const byTime = (a,b) => new Date(a.when) - new Date(b.when);

  function getCache() {
    try { return JSON.parse(localStorage.getItem('slots')||'[]') || []; }
    catch { return []; }
  }

  function buildMap(slots) {
    const map = {};
    (slots||[]).forEach(s => {
      if (s.taken) return;
      const k = ymd(s.when);
      (map[k] ||= []).push(s);
    });
    Object.values(map).forEach(arr => arr.sort(byTime));
    return map;
  }

  function fillTimes(dateStr, map) {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;
    timeEl.innerHTML = '';

    const arr = map[dateStr] || [];
    if (!arr.length) {
      const o = new Option('Brak wolnych godzin', '');
      o.disabled = true; o.selected = true;
      timeEl.add(o);
      return;
    }

    const ph = new Option('Wybierz godzinę…', '');
    ph.disabled = true; ph.selected = true;
    timeEl.add(ph);

    arr.forEach(s => {
      const t = new Date(s.when);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      timeEl.add(new Option(`${hh}:${mm}`, s.id));
    });
  }

  function mountCalendar() {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const map = buildMap(getCache());
    const days = Object.keys(map).sort();
    if (!days.length) {
      // brak slotów — wyczyść godziny i wyjdź
      const timeEl = document.getElementById('time');
      if (timeEl) { timeEl.innerHTML = ''; timeEl.add(new Option('Brak wolnych godzin','')); }
      return;
    }

    // ustaw zakres i domyślną datę
    dateEl.min = days[0];
    dateEl.max = days[days.length - 1];
    if (!dateEl.value || !map[dateEl.value]) dateEl.value = days[0];

    // wypełnij godziny
    fillTimes(dateEl.value, map);
  }

  function onDateChange() {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;
    const map = buildMap(getCache());
    fillTimes(dateEl.value, map);
  }

  // start + reakcje
  document.addEventListener('DOMContentLoaded', mountCalendar);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'date') onDateChange();
  });
  global.addEventListener('slots-synced', mountCalendar); // np. po dodaniu slota

  // eksport opcjonalny
  global.ModCalendar = { refresh: mountCalendar };
})(window);
