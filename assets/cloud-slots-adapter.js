(function (w) {
  if (!w.CloudSlots) w.CloudSlots = {};
  var sb = null, timer = null;

  function isUUID(v){ return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v); }

  CloudSlots.init = function (supabaseClient) {
    sb = supabaseClient;
    console.log('[cloud-slots] ready');
  };

  CloudSlots.pull = function () {
    if (!sb) return Promise.resolve();
    return sb.from('slots')
      .select('id, when, taken')
      .order('when', { ascending: true })
      .then(function (r) {
        if (r.error) { console.warn('[cloud-slots] pull error', r.error); return; }
        var clean = (r.data||[]).map(function (x) {
          return { id: x.id, when: x.when, taken: !!x.taken };
        });
        localStorage.setItem('slots', JSON.stringify(clean));
        document.dispatchEvent(new Event('slots-synced'));
        console.log('[cloud-slots] pull OK', clean.length);
      });
  };

  CloudSlots.pushNewSlotFromLocal = function () {
  if (!sb) return Promise.resolve();
  var all = JSON.parse(localStorage.getItem('slots') || '[]');
  if (!all.length) return Promise.resolve();

  // Najnowszy = ostatni (wstawiony lokalnie)
  var newest = all[all.length - 1];
  if (!newest) return Promise.resolve();

  // Nie wysyłaj ID jeśli to nie UUID – niech baza nada sama
  var isUUID = function (v){ return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v); };
  var payload = { when: newest.when, taken: !!newest.taken };
  if (isUUID(newest.id)) payload.id = newest.id;

  console.log('[cloud-slots] push start', payload);

  // UPSERT po "when" – brak 409, zwróci istniejący/nowy wiersz z id
  return sb.from('slots')
    .upsert(payload, { onConflict: 'when' })
    .select('id, when, taken')
    .single()
    .then(function (r) {
      if (r.error) { console.warn('[cloud-slots] upsert error', r.error); return; }

      // Podmień lokalnie ID tego konkretnego terminu
      var data = r.data;
      var updated = all.map(function (s) {
        return (s.when === data.when)
          ? { id: data.id, when: data.when, taken: !!data.taken }
          : s;
      });
      localStorage.setItem('slots', JSON.stringify(updated));
      document.dispatchEvent(new Event('slots-synced'));

      // Od razu ściągnij świeżą listę z chmury (żeby po F5 NIC nie znikło)
      return CloudSlots.pull();
    });
};


  CloudSlots.deleteSlot = function (id) {
    if (!sb) return Promise.resolve();
    var all = JSON.parse(localStorage.getItem('slots') || '[]');
    var s = all.find(function (x) { return x.id === id; });
    if (!s) return Promise.resolve();

    return sb.from('slots').delete().eq('when', s.when).then(function (r) {
      if (r.error) { console.warn('[cloud-slots] delete error', r.error); return; }
      var rest = all.filter(function (x) { return x.id !== id; });
      localStorage.setItem('slots', JSON.stringify(rest));
      document.dispatchEvent(new Event('slots-synced'));
      console.log('[cloud-slots] delete OK', s.when);
    });
  };

  CloudSlots.startAutoSync = function (ms) {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      CloudSlots.pull().catch(function(){});
    }, ms || 20000);
  };

})(window);
