(function (global) {
  function ymd(d){ const x=new Date(d); return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-'); }

  function fillTimes(){
    const dateEl = document.getElementById('date');
    const timeSel = document.getElementById('time');
    if (!dateEl || !timeSel) return;
    const dateKey = dateEl.value;
    const slots = (global.CloudSlots?.get?.() || []).filter(s => (s.taken === false || s.taken == null));
    const times = slots.filter(s => ymd(s.when) === dateKey).sort((a,b)=> new Date(a.when) - new Date(b.when));
    timeSel.innerHTML = '';
    if (!times.length) {
      const o = document.createElement('option'); o.value=''; o.textContent='Brak wolnych godzin'; timeSel.appendChild(o); timeSel.disabled = true; return;
    }
    times.forEach(s=>{ const t=new Date(s.when); const hh=String(t.getHours()).padStart(2,'0'); const mm=String(t.getMinutes()).padStart(2,'0');
      const o=document.createElement('option'); o.value = s.id; o.textContent = `${hh}:${mm}`; timeSel.appendChild(o);
    });
    timeSel.disabled = false;
  }

  global.addEventListener('slots-synced', () => {
    const dateEl = document.getElementById('date'); if (!dateEl) return;
    const slots = (global.CloudSlots?.get?.() || []).filter(s => s.taken===false || s.taken==null).sort((a,b)=> new Date(a.when)-new Date(b.when));
    if (!slots.length) { fillTimes(); return; }
    const days = [...new Set(slots.map(s => ymd(s.when)))];
    dateEl.min = days[0]; dateEl.max = days[days.length-1];
    if (!dateEl.value) { dateEl.value = days[0]; dateEl.dispatchEvent(new Event('change',{bubbles:true})); } else { fillTimes(); }
    let host = document.getElementById('availableDaysHelper');
    if(!host){ host = document.createElement('div'); host.id='availableDaysHelper'; host.style.marginTop='6px'; host.style.display='flex'; host.style.flexWrap='wrap'; host.style.gap='6px'; dateEl.parentElement.appendChild(host); }
    host.innerHTML='';
    days.slice(0,90).forEach(d=>{ const b=document.createElement('button'); b.type='button'; b.textContent=d;
      b.style.padding='4px 8px'; b.style.border='1px solid #ddd'; b.style.borderRadius='6px'; b.style.cursor='pointer';
      b.style.background = (dateEl.value===d)?'#eef5ff':'#fff';
      b.addEventListener('click', ()=>{ dateEl.value=d; dateEl.dispatchEvent(new Event('change',{bubbles:true})); global.dispatchEvent(new Event('slots-synced')); });
      host.appendChild(b);
    });
  });

  document.addEventListener('change', (e)=>{ if (e.target && e.target.id==='date') fillTimes(); });
  document.addEventListener('DOMContentLoaded', async ()=>{ if (global.CloudSlots?.pull) await global.CloudSlots.pull(); });

  global.afterBookingMarkTaken = async function (slot_id){
    try { await sb.from('slots').update({ taken: true }).eq('id', slot_id); if (global.CloudSlots?.pull) await global.CloudSlots.pull(); } catch(e){ console.warn('[afterBookingMarkTaken]', e); }
  };
})(window);
