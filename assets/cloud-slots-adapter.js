// assets/cloud-slots-adapter.js
// Minimalny adapter: UI i LocalStorage zostają, a my dodajemy sync z Supabase.

(function(){
  'use strict';

  // 1) Konfiguracja Supabase – WSTAW SWOJE DANE:
  const SUPABASE_URL = 'https://eibzijpelnmvbtslquun.supabase.co';      // <-- wklej URL
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYnppanBlbG5tdmJ0c2xxdXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTE1OTcsImV4cCI6MjA3NDE4NzU5N30.Dp4u9PlhP-_pGmiNTHp5zSjrMUDfA_k2i85_71_9koo';                   // <-- wklej anon public

  // 2) Jeśli SDK nie jest w HTML, wstrzyknij je dynamicznie
  function ensureSupabaseSdk(){
    return new Promise((resolve)=>{
      if (window.supabase) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }

  // 3) Utwórz klienta
  let sb;
  async function initSupabase(){
    await ensureSupabaseSdk();
    if (!window.sb) {
      window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    sb = window.sb;
  }

  // 4) Pomocnicze
  const wait = (ms)=> new Promise(r=>setTimeout(r, ms));
  const get = (k, fb=[]) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
  };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // 5) Import slotów z chmury -> LocalStorage (żeby stare UI od razu widziało dane)
  async function pullSlotsToLocal(){
    const { data, error } = await sb.from('slots').select('id, when, taken').order('when',{ascending:true});
    if (error) { console.warn('Cloud pull slots error', error); return; }
    // zapisujemy do localStorage pod kluczem jak w starej apce:
    const clean = (data||[]).map(x=>({ id: x.id, when: x.when, taken: !!x.taken }));
    set('slots', clean);
    // wywołujemy event, by stare renderery mogły się odświeżyć jeśli słuchają
    document.dispatchEvent(new Event('slots-synced'));
  }

  // 6) Dodanie slota do chmury (wołamy zamiast starego zapisu)
  async function pushNewSlotFromLocal(){
    // chwila, by stare UI zapisało do localStorage
    await wait(50);
    const local = get('slots', []);
    // znajdź rekordy bez id (albo świeżo dodane)
    // zakładamy, że UI dodaje na koniec. Weź ostatni i spróbuj wstawić:
    const newest = local[local.length - 1];
    if (!newest) return;

    // jeśli już ma id (np. UI je generuje), to wstawimy z tym id.
    const payload = { when: newest.when, taken: !!newest.taken };
    if (newest.id) payload.id = newest.id;

    const { data, error } = await sb.from('slots').insert(payload).select('id').single();
    if (error) { console.warn('Cloud push slot error', error); return; }

    // ujednolicamy localStorage: wpisz id z bazy (jeśli brakowało)
    if (!newest.id && data?.id){
      newest.id = data.id;
      set('slots', local);
    }
  }

  // 7) Usunięcie slota w chmurze na podstawie DOM kliknięcia
  async function deleteSlotInCloudById(id){
    if (!id) return;
    const { error } = await sb.from('slots').delete().eq('id', id);
    if (error) { console.warn('Cloud delete slot error', error); }
  }

  // 8) Podpinamy się pod zdarzenia UI (bez zmian w admin.js)
  function attachUiHooks(){
    // Kliknięcie "Dodaj termin"
    const addBtn = document.querySelector('#addSlot');
    if (addBtn){
      addBtn.addEventListener('click', async ()=>{
        // po kliknięciu stare UI zapisuje do localStorage → my to dorzucimy do chmury
        await pushNewSlotFromLocal();
        await pullSlotsToLocal(); // a potem zaciągniemy z chmury (żeby mieć id, porządek)
      });
    }

    // Kliknięcia "Usuń" (delegacja)
    const slotsList = document.querySelector('#slotsList');
    if (slotsList){
      slotsList.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-id]');
        if (!btn) return;
        const id = btn.dataset.id;  // stary UI ma data-id — użyjemy tego
        await deleteSlotInCloudById(id);
        await pullSlotsToLocal();
      });
    }
  }

  // 9) Start adaptera: inicjalizacja + import danych + podpięcie hooków
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await initSupabase();
      await pullSlotsToLocal();  // na starcie: chmura → local
      attachUiHooks();           // zaczepiamy się w istniejące UI
      console.log('[cloud-slots-adapter] ready');
    }catch(err){
      console.error('[cloud-slots-adapter] init error', err);
    }
  });
})();
