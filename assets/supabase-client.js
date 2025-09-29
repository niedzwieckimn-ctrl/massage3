// assets/supabase-client.js
// WYMAGANE: w index.html wcześniej <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

(function () {
  const URL  = 'https://TWÓJ-PROJEKT.supabase.co';     // <- wklej Project URL z Supabase
  const ANON = 'TWÓJ_PUBLICZNY_ANON_KEY';              // <- wklej anon public key

  if (!window.supabase) {
    console.error('[supabase-client] Brak SDK (@supabase/supabase-js@2).');
    return;
  }
  if (!URL || !ANON) {
    console.error('[supabase-client] Brak SUPABASE URL/ANON.');
    return;
  }

  try {
    window.sb = supabase.createClient(URL, ANON);
    console.log('[supabase-client] OK');
  } catch (e) {
    console.error('[supabase-client] init error:', e);
  }
})();
