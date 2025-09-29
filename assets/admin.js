(function(global){
  async function loadBookings(){
    let {data,error}=await sb.from('bookings').select('id,status,booking_no,notes,slots(when),clients(name,email,phone),services(name)').order('created_at',{ascending:false});
    if(error){console.error(error);return;}
    console.log('Bookings:',data);
    // TODO: render into #bookingsPending and #bookingsConfirmed
  }
  global.Admin={loadBookings};
  document.addEventListener('DOMContentLoaded',()=>{loadBookings();});
})(window);
