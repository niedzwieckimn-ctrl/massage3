(function () {
  var sb = null; // klient Supabase

  function log() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[cloud-slots]');
    console.log.apply(console, a);
  }

  // proste get/set jak w Store
  function get(k, def) {
    try { 
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def; 
    } catch (_) { 
      return def; 
    }
  }
  function set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  // 1) Pobierz sloty z chmury -> zapisz lokalnie -> powiadom UI
  function pullSlotsToLocal() {
    return sb
      .from('slots')
      .select('id, when, taken, created_at')
      .order('when', { ascending: true })
      .then(function (res) {
        var data = res.data, error = res.error;
        if (error) { log('pull error', error); return; }

        var clean = (data || []).map(function (x) {
          return {
            id: x.id,
            when: x.when,
            taken: !!x.taken,
            createdAt: x.created_at || x.createdAt || x.when
          };
        });

        set('slots', clean);
        document.dispatchEvent(new Event('slots-synced'));
      });
  }

  // 2) Wyślij ostatnio dodany lokalny slot do chmury
  function pushNewSlotFromLocal() {
  var all = get('slots', []);
  if (!all.length) return Promise.resolve();

  // najnowszy = ostatni element (dopiero co dodany lokalnie)
  var newest = all[all.length - 1];
  if (!newest) return Promise.resolve();

  // wykryj czy ID wygląda na UUID (xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  var isUUID = function (v) {
    return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
  };

  // jeżeli lokalne id NIE jest uuid -> NIE wysyłaj go, niech baza nada sama
  var payload = { when: newest.when, taken: !!newest.taken };
  if (isUUID(newest.id)) {
    payload.id = newest.id; // OK, przekaż jeżeli już jest prawidłowe UUID
  }

  return sb
    .from('slots')
    .insert(payload)
    .select('id, when')
    .single()
    .then(function (res) {
      if (res.error) {
        // 23505 = duplikat 'when' -> podmień tylko id lokalnie
        if (res.error.code === '23505') {
          return sb
            .from('slots')
            .select('id, when')
            .eq('when', newest.when)
            .single()
            .then(function (r2) {
              if (!r2.error && r2.data) {
                var updated = all.map(function (s) {
                  return s.when === r2.data.when
                    ? Object.assign({}, s, { id: r2.data.id })
                    : s;
                });
                set('slots', updated);
                document.dispatchEvent(new Event('slots-synced'));
              }
            });
        } else {
          log('push error', res.error);
        }
        return;
      }

      // sukces – baza zwróciła id (nowo nadane UUID); podmień lokalnie
      var updated2 = all.map(function (s) {
        return s.when === res.data.when
          ? Object.assign({}, s, { id: res.data.id })
          : s;
      });
      set('slots', updated2);
      document.dispatchEvent(new Event('slots-synced'));
    });
}

  // 3) Usuń slot w chmurze
  function deleteSlotInCloud(id) {
    if (!id) return Promise.resolve();
    return sb
      .from('slots')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) log('delete error', res.error);
      });
  }

  // Publiczne API adaptera
  window.CloudSlots = {
    init: function (client) {
      sb = client;
      log('ready');
      pullSlotsToLocal();
    },
    pullSlotsToLocal: pullSlotsToLocal,
    pushNewSlotFromLocal: pushNewSlotFromLocal,
    deleteSlotInCloud: deleteSlotInCloud
  };
})();
