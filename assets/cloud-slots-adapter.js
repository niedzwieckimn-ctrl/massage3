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

    // Najnowszy = OSTATNI element (bo onAddSlot dopisuje na koniec)
    var newest = all[all.length - 1];
    if (!newest) return Promise.resolve();

    var payload = { id: newest.id, when: newest.when, taken: !!newest.taken };

    return sb
      .from('slots')
      .insert(payload)
      .select('id')
      .single()
      .then(function (res) {
        if (res.error) {
          // 23505 = duplikat when -> pobieramy istniejący i podmieniamy ID lokalnie
          if (res.error.code === '23505') {
            return sb
              .from('slots')
              .select('id, when')
              .eq('when', payload.when)
              .single()
              .then(function (r2) {
                if (!r2.error && r2.data) {
                  var synced = all.map(function (s) {
                    return s.when === r2.data.when
                      ? Object.assign({}, s, { id: r2.data.id })
                      : s;
                  });
                  set('slots', synced);
                  document.dispatchEvent(new Event('slots-synced'));
                }
              });
          } else {
            log('push error', res.error);
          }
          return;
        }

        // sukces – jeśli baza zwróciła inne id, podmień lokalnie
        var synced2 = all.map(function (s) {
          return s.when === newest.when
            ? Object.assign({}, s, { id: res.data.id })
            : s;
        });
        set('slots', synced2);
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
