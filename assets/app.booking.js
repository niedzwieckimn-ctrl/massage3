(function(global){
  async function ensureClient({name,email,phone}){
    let {data,error}=await sb.from('clients').select('id').eq('email',email).maybeSingle();
    if(error){console.error(error);return null;}
    if(data)return data.id;
    let ins=await sb.from('clients').insert([{name,email,phone}]).select('id').single();
    if(ins.error){console.error(ins.error);return null;}
    return ins.data.id;
  }
  async function createBooking({slot_id,service_id,client_id,notes}){
    const booking_no=Helpers.makeBookingNo();
    let {data,error}=await sb.from('bookings').insert([{slot_id,service_id,client_id,status:'pending',booking_no,notes}]).select().single();
    if(error){console.error(error);return null;} return data;
  }
  async function markSlotTaken(slot_id){await sb.from('slots').update({taken:true}).eq('id',slot_id);}
  global.Booking={ensureClient,createBooking,markSlotTaken};
})(window);
