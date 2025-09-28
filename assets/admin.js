(function (global) {
  function toUtcIso(dateStr, timeStr) { const local = new Date(`${dateStr}T${timeStr}:00`); return new Date(local.getTime() - local.getTimezoneOffset()*60000).toISOString(); }

  if (!global.__slotFormWired) {
    const form = document.getElementById('slotAddForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (global.__addingSlot) return; global.__addingSlot = true;
        const btn = form.querySelector('button[type=submit]'); btn?.setAttribute('disabled','disabled');
        try {
          const date = document.getElementById('slotDate')?.value;
          const time = document.getElementById('slotTime')?.value;
          if (!date || !time) { alert('Podaj datę i godzinę'); return; }
          const whenIso = toUtcIso(date, time);
          const { error } = await sb.from('slots').insert([{ when: whenIso, taken: false }]);
          if (error) { console.error('add slot error', error); alert('Nie udało się dodać slota'); return; }
          if (global.CloudSlots?.pull) await global.CloudSlots.pull();
          alert('Dodano termin'); form.reset();
        } finally { btn?.removeAttribute('disabled'); global.__addingSlot = false; }
      });
      global.__slotFormWired = true;
    }
  }

  global.loadBookingsForAdmin = async function(statuses){
    const sel = `id, booking_no, status, notes, created_at, slot_id, service_id, client_id,
      slots(when), clients(name, email, phone), services(name)`;
    let q = sb.from('bookings').select(sel).order('created_at',{ascending:false});
    if (statuses && statuses.length){
      const parts = []; statuses.forEach(s => parts.push(s==null ? 'status.is.null' : `status.eq.${s}`));
      q = q.or(parts.join(','));
    }
    const { data, error } = await q;
    if (error) { console.error('[admin bookings]', error); return []; }
    return data || [];
  };

  global.renderBookings = () => global.loadBookingsUI ? global.loadBookingsUI() : void 0;
})(window);
