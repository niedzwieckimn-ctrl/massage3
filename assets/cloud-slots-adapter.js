/* prosty adapter: pull = nadpisuje localStorage; push = insert -> pull */
(function(global){
  var sb = null;
  function log(){ var a=Array.prototype.slice.call(arguments); a.unshift('[cloud-slots]'); console.log.apply(console,a); }

  var CloudSlots = {
    init: function(supabaseClient){
      sb = supabaseClient;
      log('ready');
      return CloudSlots.pullSlotsToLocal();
    },

    pullSlotsToLocal: function(){
      if(!sb) return Promise.resolve();
      return sb.from('slots').select('id,when,taken').order('when',{ascending:true})
        .then(function(res){
          var data = (res && res.data) || [];
          var clean = data.map(function(x){ return { id:x.id, when:x.when, taken:!!x.taken }; });
          localStorage.setItem('slots', JSON.stringify(clean));
          document.dispatchEvent(new Event('slots-synced'));
        })
        .catch(function(err){ console.warn('[cloud-slots] pull error', err); });
    },

    pushNewSlotFromLocal: function(){
      if(!sb) return Promise.resolve();
      var all = JSON.parse(localStorage.getItem('slots') || '[]');
      if(!all.length) return Promise.resolve();
      var newest = all[all.length-1];
      if(!newest) return Promise.resolve();

      var payload = { when: newest.when, taken: !!newest.taken };
      // jeśli lokalne id wygląda jak UUID, przekaż je; inaczej nie przekazuj
      if(typeof newest.id === 'string' && newest.id.length === 36) payload.id = newest.id;

      return sb.from('slots').insert(payload).select('id,when').single()
        .then(function(res){
          var d = res && res.data;
          if(!d) return;
          // podmień lokalne id na id z bazy
          var updated = all.map(function(s){ return s.when === d.when ? Object.assign({}, s, { id: d.id }) : s; });
          localStorage.setItem('slots', JSON.stringify(updated));
          document.dispatchEvent(new Event('slots-synced'));
        })
        .catch(function(err){
          // jeżeli duplikat (23505) -> pobierz istniejący i zaktualizuj lokalnie
          var code = err && (err.code || (err.error && err.error.code));
          if(code === '23505' || code === 23505){
            return sb.from('slots').select('id,when').eq('when', payload.when).single()
              .then(function(r2){
                var d2 = r2 && r2.data;
                if(!d2) return;
                var synced = all.map(function(s){ return s.when === d2.when ? Object.assign({}, s, { id: d2.id }) : s; });
                localStorage.setItem('slots', JSON.stringify(synced));
                document.dispatchEvent(new Event('slots-synced'));
              })
              .catch(function(e2){ console.warn('[cloud-slots] duplicate follow-up error', e2); });
          }
          console.warn('[cloud-slots] push error', err);
        });
    },

    deleteSlot: function(id){
      if(!sb || !id) return Promise.resolve();
      return sb.from('slots').delete().eq('id', id).then(function(){ return CloudSlots.pullSlotsToLocal(); })
        .catch(function(err){ console.warn('[cloud-slots] delete error', err); });
    }
  };

  global.CloudSlots = CloudSlots;
})(window);
