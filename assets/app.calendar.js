// assets/app.calendar.js
(function (global) {
  // ===== helpers =====
  function ymd(d) { return new Date(d).toISOString().slice(0,10); }
  function byTime(a,b){ return new Date(a.when) - new Date(b.when); }

  function getSlots(){
    try { return JSON.parse(localStorage.getItem('slots') || '[]') || []; }
    catch { return []; }
  }

  function buildMap(slots){
    var map = {};
    for (var i=0;i<slots.length;i++){
      var s = slots[i];
      if (s.taken) continue;
      var k = ymd(s.when);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
    Object.keys(map).forEach(function(k){ map[k].sort(byTime); });
    return map;
  }

  // ===== główna funkcja: wypełnij godziny =====
  function fillTimes(dateStr){
    var timeEl = document.getElementById('time');
    if (!timeEl) return;

    // wyczyść
    timeEl.innerHTML = '';

    var slots = getSlots();
    var todays = [];
    for (var i=0;i<slots.length;i++){
      var s = slots[i];
      if (!s.taken && ymd(s.when) === dateStr) todays.push(s);
    }
    todays.sort(byTime);

    if (todays.length === 0){
      var none = new Option('Brak wolnych godzin','');
      none.disabled = true; none.selected = true;
      timeEl.add(none);
      return;
    }

    // jeżeli tylko jedna – ustaw automatycznie
    if (todays.length === 1){
      var t = new Date(todays[0].when);
      var hh = String(t.getHours()).padStart(2,'0');
      var mm = String(t.getMinutes()).padStart(2,'0');
      var opt = new Option(hh+':'+mm, todays[0].id);
      opt.selected = true;
      timeEl.add(opt);
      timeEl.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // inaczej: placeholder + wszystkie godziny
    var ph = new Option('Wybierz godzinę…','');
    ph.disabled = true; ph.selected = true;
    timeEl.add(ph);

    for (var j=0;j<todays.length;j++){
      var s2 = todays[j];
      var tt = new Date(s2.when);
      var hh2 = String(tt.getHours()).padStart(2,'0');
      var mm2 = String(tt.getMinutes()).padStart(2,'0');
      timeEl.add(new Option(hh2+':'+mm2, s2.id));
    }
  }

  // ===== mount: ustaw datę i wypełnij godziny =====
  function mount(){
    var dateEl = document.getElementById('date');
    if (!dateEl) return;

    // mapa dni -> sloty
    var map = buildMap(getSlots());
    var days = Object.keys(map).sort();

    if (days.length){
      // ustaw zakres i pierwszy wolny dzień
      dateEl.min = days[0];
      dateEl.max = days[days.length-1];
      if (!dateEl.value || !map[dateEl.value]) { dateEl.value = days[0]; }
      // wypełnij godziny
      fillTimes(dateEl.value);
    } else {
      dateEl.removeAttribute('min');
      dateEl.removeAttribute('max');
      var timeEl = document.getElementById('time');
      if (timeEl){
        timeEl.innerHTML = '';
        var none = new Option('Brak wolnych godzin','');
        none.disabled = true; none.selected = true;
        timeEl.add(none);
      }
    }
  }

  // zmiana daty → przeładuj godziny
  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'date'){
      fillTimes(e.target.value);
    }
  });

  // po zsynchronizowaniu slotów z chmury
  global.addEventListener('slots-synced', mount);

  // po załadowaniu DOM – spróbuj z tego co już w cache
  document.addEventListener('DOMContentLoaded', mount);

  // eksport prostego API
  global.ModCalendar = {
    refresh: mount,
    fillTimes: fillTimes
  };
})(window);
