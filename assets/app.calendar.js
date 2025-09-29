(function (global) {
  function fillTimes() {
    const dateEl = document.getElementById('date');
    const timeSel = document.getElementById('time');
    if (!dateEl || !timeSel) return;

    const slots = global.CloudSlots.get() || [];
    const dateKey = dateEl.value;

    // wybieramy tylko sloty na wybraną datę
    const times = slots
      .filter((s) => global.Helpers.ymd(s.when) === dateKey)
      .sort((a, b) => new Date(a.when) - new Date(b.when));

    // czyścimy select z godzinami
    timeSel.innerHTML = '';

    if (!times.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Brak wolnych godzin';
      timeSel.appendChild(o);
      return;
    }

    // wstawiamy dostępne godziny
    times.forEach((s) => {
      const t = new Date(s.when);
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${String(t.getHours()).padStart(2, '0')}:${String(
        t.getMinutes()
      ).padStart(2, '0')}`;
      timeSel.appendChild(o);
    });
  }

  function highlightDays() {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const slots = global.CloudSlots.get() || [];
    if (!slots.length) return;

    const days = [...new Set(slots.map((s) => global.Helpers.ymd(s.when)))];

    // minimalna data to pierwszy wolny dzień
    dateEl.min = days[0];
    // maksymalna data to ostatni wolny dzień
    dateEl.max = days[days.length - 1];

    // jeżeli nic nie wybrane → ustaw pierwszy wolny dzień
    if (!dateEl.value) {
      dateEl.value = days[0];
    }
  }

  function refreshCalendar() {
    highlightDays();
    fillTimes();
  }

  // nasłuch na zdarzenia
  global.addEventListener('slots-synced', refreshCalendar);
  document.addEventListener('DOMContentLoaded', () => {
    refreshCalendar();
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'date') {
      fillTimes();
    }
  });

  // eksport
  global.ModCalendar = { refreshCalendar };
})(window);
