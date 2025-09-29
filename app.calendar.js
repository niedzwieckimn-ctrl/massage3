(function (global) {
  // --- utils ---
  function ymd(d) {
    const x = new Date(d);
    return [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-');
  }
  function byTime(a, b) { return new Date(a.when) - new Date(b.when); }

  // Pobierz sloty z localStorage (jeśli są) albo z Supabase (fallback)
  async function getSlots() {
    try {
      const cached = JSON.parse(localStorage.getItem('slots') || '[]');
      if (Array.isArray(cached) && cached.length) return cached;
    } catch (_) {}
    if (!global.sb) return [];
    // fallback – tylko wolne i w przyszłości
    const today = new Date(); today.setHours(0,0,0,0);
    const { data, error } = await sb
      .from('free_slots')
      .select('id, when, taken')
      .order('when', { ascending: true });
    if (error) { console.warn('[calendar] free_slots error:', error); return []; }
    return (data || []).filter(s => !s.taken && new Date(s.when) >= today);
  }

  // Zbuduj mapę: YYYY-MM-DD -> [sloty]
  function buildMap(slots) {
    const map = {};
    (slots || []).forEach(s => {
      const key = ymd(s.when);
      (map[key] ||= []).push(s);
    });
    Object.values(map).forEach(arr => arr.sort(byTime));
    return map;
  }

  // Wypełnij select z godzinami
  function fillTimes(dateStr, map) {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;
    timeEl.innerHTML = '';
    const arr = map[dateStr] || [];
    if (!arr.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Brak wolnych godzin'; o.disabled = true; o.selected = true;
      timeEl.appendChild(o);
      return;
    }
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Wybierz godzinę…'; ph.disabled = true; ph.selected = true;
    timeEl.appendChild(ph);

    arr.forEach(s => {
      const t = new Date(s.when);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${hh}:${mm}`;
      timeEl.appendChild(o);
    });
  }

  // Ustawienia i zdarzenia flatpickr / <input type="date">
  function mountCalendar(map) {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const days = Object.keys(map).sort();
    if (!days.length) return;

    // input[type=date]
    dateEl.min = days[0];
    dateEl.max = days[days.length - 1];
    if (!dateEl.value) dateEl.value = days[0];

    // flatpickr – jeśli jest załadowany
    if (typeof global.flatpickr === 'function') {
      // odśwież istniejący instancję albo twórz nową
      if (global.fp && typeof global.fp.destroy === 'function') {
        try { global.fp.destroy(); } catch(_) {}
      }
      global.fp = flatpickr(dateEl, {
        dateFormat: 'Y-m-d',
        disableMobile: true,
        enable: days,
        defaultDate: dateEl.value,
        onChange: (_, str) => { if (str) fillTimes(str, map); },
        onDayCreate: (_, __, ___, dayElem) => {
          const key = ymd(dayElem.dateObj);
          if (map[key]) dayElem.classList.add('fp-has-slot');
        }
      });
      // styl podświetlenia dni z wolnymi terminami
      const styleId = 'fp-has-slot-style';
      if (!document.getElementById(styleId)) {
        const s = document.createElement('style'); s.id = styleId;
        s.textContent = '.flatpickr-day.fp-has-slot{box-shadow:inset 0 0 0 2px rgba(99,255,185,.9);border-radius:8px}';
        document.head.appendChild(s);
      }
    }

    // Po ustawieniu daty – wypełnij godziny
    fillTimes(dateEl.value, map);

    // Reakcja na ręczne przestawienie daty (gdy brak flatpickr)
    dateEl.addEventListener('change', () => fillTimes(dateEl.value, map));
  }

  async function refreshFromStorageOrDb() {
    const slots = await getSlots();
    const map = buildMap(slots);
    mountCalendar(map);
  }

  // Główne wejście
  async function init() {
    await refreshFromStorageOrDb();
  }

  // Reaguj, gdy inny kod nadpisze localStorage 'slots' (np. sync po stronie public)
  global.addEventListener('storage', (e) => {
    if (e.key === 'slots') refreshFromStorageOrDb();
  });

  // Reaguj na nasz event (jeśli kiedyś dodasz CloudSlots.pull())
  global.addEventListener('slots-synced', refreshFromStorageOrDb);

  // Start
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // eksport opcjonalny
  global.ModCalendar = { refresh: refreshFromStorageOrDb };
})(window);
