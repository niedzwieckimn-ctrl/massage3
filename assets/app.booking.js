(function(global){
  async function ensureClient({name,email,phone}){
    try {
      let r = await sb.from('clients').select('id').eq('email',email).maybeSingle();
      if(r.data?.id) return r.data.id;
      let ins = await sb.from('clients').insert([{name,email,phone}]).select('id').single();
      return ins.data.id;
    } catch(e){ console.error('[ensureClient]', e); throw e; }
  }
  async function createBooking({slot_id,service_id,client_id,notes}){
    try {
      const booking_no = (global.Helpers?.makeBookingNo?.() || ('B'+Date.now().toString(36).toUpperCase()));
      let ins = await sb.from('bookings').insert([{slot_id,service_id,client_id,status:'pending',booking_no,notes:notes||''}]).select('id,booking_no,status').single();
      return ins.data;
    } catch(e){ console.error('[createBooking]', e); throw e; }
  }
  async function markSlotTaken(slot_id){
    try { await sb.from('slots').update({taken:true}).eq('id', slot_id); await global.CloudSlots?.pull?.(); }
    catch(e){ console.error('[markSlotTaken]', e); }
  }
  global.ModBooking = global.ModBooking || { ensureClient, createBooking, markSlotTaken };
})(window);
