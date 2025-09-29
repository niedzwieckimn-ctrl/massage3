// assets/cloud-slots-adapter.js
(function (global) {
  const LS_KEY = 'slots';

  async function pull() {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const { data, error } = await sb
        .from('free_slots')            // jeśli używasz 'slots', zmień tutaj
        .select('id, when, taken')
        .order('when', { ascending: true });

      if (error) throw error;

      const cleaned = (data || []).filter(s => !s.taken && new Date(s.when) >= today);
      localStorage.setItem(LS_KEY, JSON.stringify(cleaned));
      global.dispatchEvent(new Event('slots-synced'));
      return cleaned;
    } catch (e) {
      console.error('CloudSlots.pull error', e);
      return [];
    }
  }

  function get() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  global.CloudSlots = { pull, get };
})(window);
