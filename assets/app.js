(function (global) {
  function ymd(d){
    const x=new Date(d);
    return [
      x.getFullYear(),
      String(x.getMonth()+1).padStart(2,'0'),
      String(x.getDate()).padStart(2,'0')
    ].join('-');
  }

  function fillTimes(){
    const dateEl = document.getElementById('date');
    const timeSel = document.getElementById('time');
    if (!dateEl || !timeSel) return;

    const dateKey = dateEl.value;
    const slots = (global.CloudSlots.get() || []);

    const times = slots
      .filter(s => ymd(s.when) === dateKey)
      .sort((a,b)=> new Date(a.when)-new Date(b.when));

    timeSel.innerHTML = '';
    if (!times.length) {
      const o=document.createElement('option');
      o.value='';
      o.textContent='Brak wolnych godzin';
      timeSel.appendChild(o);
      timeSel.disabled=true;
      return;
    }

    times.forEach(s=>{
      const t=new Date(s.when);
      const hh=String(t.getHours()).padStart(2,'0');
      const mm=String(t.getMinutes()).padStart(2,'0');
      const o=document.createElement('option');
      o.value=s.id;
      o.textContent=`${hh}:${mm}`;
      timeSel.appendChild(o);
    });
    timeSel.disabled=false;
  }

  // Obsługa kalendarza
  global.addEventListener('slots-synced', () => {
    const dateEl = document.getElementById('date');
    if (!dateEl) return;

    const slots = (global.CloudSlots.get() || [])
      .sort((a,b)=> new Date(a.when)-new Date(b.when));

    if (!slots.length) {
      fillTimes();
      return;
    }

    const days = [...new Set(slots.map(s => ymd(s.when)))];
    dateEl.min = days[0];
    dateEl.max = days[days.length-1];

    if (!dateEl.value) {
      dateEl.value = days[0];
      dateEl.dispatchEvent(new Event('change',{bubbles:true}));
    } else {
      fillTimes();
    }
  });

  document.addEventListener('change', (e)=>{
    if (e.target && e.target.id==='date') fillTimes();
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    if (global.CloudSlots?.pull) {
      await global.CloudSlots.pull();
    }

    // 🔥 obsługa rezerwacji
    const form = document.getElementById('bookingForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); // 👉 blokuje odświeżanie strony

        const name  = form.querySelector('#name')?.value;
        const email = form.querySelector('#email')?.value;
        const phone = form.querySelector('#phone')?.value;
        const service_id = form.querySelector('#service')?.value;
        const slot_id    = form.querySelector('#time')?.value;

        if (!name || !email || !service_id || !slot_id) {
          alert('Uzupełnij wszystkie pola');
          return;
        }

        try {
          // klient
          let { data:client, error:clientErr } = await sb
            .from('clients')
            .insert([{ name, email, phone }])
            .select('id')
            .single();

          if (clientErr && !client) throw clientErr;

          const client_id = client?.id;

          // rezerwacja
          const booking_no = Math.random().toString(36).substr(2,8).toUpperCase();
          let { error:bookErr } = await sb.from('bookings').insert([{
            slot_id, service_id, client_id, booking_no, status:'pending'
          }]);
          if (bookErr) throw bookErr;

          // oznacz slot jako zajęty
          await sb.from('slots').update({ taken:true }).eq('id', slot_id);

          alert('Rezerwacja wysłana! Sprawdź maila.');
          form.reset();
          await global.CloudSlots.pull();
        } catch (err) {
          console.error('Booking error:', err);
          alert('Nie udało się złożyć rezerwacji');
        }
      });
    }
  });
})(window);
