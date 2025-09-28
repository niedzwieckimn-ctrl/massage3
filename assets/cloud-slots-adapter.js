/* CloudSlots – adapter do Supabase (bez async/await) */
window.CloudSlots = (function () {
  var sb = null;

  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function get(key, def) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v || def;
    } catch (e) { return def; }
  }
  function isUUID(v) {
    return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
  }

  /* ściąga wszystkie sloty z chmury do LocalStorage */
  function pull() {
    if (!sb) return Promise.resolve();
   return sb
  .from('slots')
  .select('id, when, taken, created_at')
  .eq('taken', false)                         // <-- tylko wolne
  .gte('when', new Date().toISOString())      // <-- (opcjonalnie) tylko przyszłe
  .order('when', { ascending: true })

      .then(function (res) {
        var data = res.data, error = res.error;
        if (error) {
          console.warn('[cloud-slots] pull error', error);
          return;
        }
        var clean = (data || []).map(function (x) {
          return {
            id: x.id,
            when: x.when,
            taken: !!x.taken,
            created_at: x.created_at
          };
        });
        set('slots', clean);
        document.dispatchEvent(new Event('slots-synced'));
        console.log('[cloud-slots] pull OK', clean.length);
      });
  }

  /* szuka najnowszego lokalnego slotu i wpycha go do chmury */
  function pushNewSlotFromLocal() {
    var all = get('slots', []);
    if (!all || !all.length) return Promise.resolve();

    // najnowszy po created_at (a jak go brak – po when)
    var newest = all.slice().sort(function (a, b) {
      var ad = new Date(a.created_at || a.when).getTime();
      var bd = new Date(b.created_at || b.when).getTime();
      return bd - ad;
    })[0];
    if (!newest) return Promise.resolve();

    // budujemy payload; jeżeli lokalne id jest uuid – przekażemy je; jak nie, pominąć (baza nada nowe)
    var payload = { when: newest.when, taken: !!newest.taken };
    if (isUUID(newest.id)) payload.id = newest.id;

    return sb
      .from('slots')
      .insert(payload)
      .select('id, when, created_at')
      .single()
      .then(function (res) {
        var data = res.data, error = res.error;

        // duplikat 'when' -> nie nadpisuj; znajdź istniejący wiersz w bazie i podmień loklane id
        if (error) {
          if (error.code === '23505') {
            return sb
              .from('slots')
              .select('id, when, created_at')
              .eq('when', newest.when)
              .single()
              .then(function (r2) {
                var row = r2.data;
                if (row) {
                  var updated = all.map(function (s) {
                    return (s.when === row.when)
                      ? Object.assign({}, s, { id: row.id, created_at: row.created_at || s.created_at })
                      : s;
                  });
                  set('slots', updated);
                  document.dispatchEvent(new Event('slots-synced'));
                  console.log('[cloud-slots] duplicate handled -> local id updated');
                }
              });
          } else {
            console.warn('[cloud-slots] push error', error);
          }
          return;
        }

        // sukces -> baza zwróciła id (i created_at); podmień lokalnie
        var updated2 = all.map(function (s) {
          return (s.when === data.when)
            ? Object.assign({}, s, { id: data.id, created_at: data.created_at || s.created_at })
            : s;
        });
        set('slots', updated2);
        document.dispatchEvent(new Event('slots-synced'));
        console.log('[cloud-slots] push OK', data);
      });
  }

  function startAutoSync(ms) {
    ms = ms || 5000;
    pull(); // pierwsze odświeżenie od razu
    setInterval(function () { pull(); }, ms);
  }

  return {
    init: function (_sb) {
      sb = _sb;
      console.log('[cloud-slots] ready');
    },
    pull: pull,
    pushNewSlotFromLocal: pushNewSlotFromLocal,
    startAutoSync: startAutoSync
  };
})();
