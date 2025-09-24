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

    var newest = all[all.length - 1];
    if (!newest) return Promise.resolve();

    var payload = { when: newest.when, taken: !!newest.taken };
    if (isUUID(newest.id)) payload.id = newest.id;

    console.log('[cloud-slots] push start', payload);

    return sb.from('slots')
      .insert(payload)
      .select('id, when')
      .single()
      .then(function (r1) {
        if (r1.error) {
          if (r1.error.code === '23505') {
            // duplikat when – pobierz istniejący i zsynchronizuj
            return sb.from('slots').select('id, when').eq('when', payload.when).single();
          }
          console.warn('[cloud-slots] push error', r1.error);
          return;
        }
        return r1;
      })
      .then(function (r2) {
        if (!r2 || r2.error || !r2.data) return;
        var updated = all.map(function (s) {
          return (s.when === r2.data.when) ? { id: r2.data.id, when: s.when, taken: !!s.taken } : s;
        });
        localStorage.setItem('slots', JSON.stringify(updated));
        document.dispatchEvent(new Event('slots-synced'));
        console.log('[cloud-slots] push OK', r2.data);
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
