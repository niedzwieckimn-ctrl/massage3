(function (global) {
  const LS_KEY = 'slots';
  async function pull() {
    try {
      let { data, error } = await (global.sb)
        .from('free_slots')
        .select('id, when, taken')
        .order('when', { ascending: true });
      if (error) {
        const res = await (global.sb)
          .from('slots')
          .select('id, when, taken')
          .order('when', { ascending: true });
        data = res.data || []; error = res.error || null;
      }
      if (error) throw error;
      const today = new Date(); today.setHours(0,0,0,0);
      const cleaned = (data || []).filter(s => (s.taken === false || s.taken == null) && new Date(s.when) >= today);
      localStorage.setItem(LS_KEY, JSON.stringify(cleaned));
      global.dispatchEvent(new Event('slots-synced'));
      return { ok: true, count: cleaned.length };
    } catch (e) {
      console.error('[cloud-slots] pull exception:', e);
      localStorage.setItem(LS_KEY, '[]');
      global.dispatchEvent(new Event('slots-synced'));
      return { ok: false, error: e };
    }
  }
  function get() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
  global.CloudSlots = global.CloudSlots || {}; global.CloudSlots.pull = pull; global.CloudSlots.get = get;
  console.log('[cloud-slots] ready');
})(window);
