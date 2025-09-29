(function(global){
  // Non-invasive calendar helper; only used if explicitly called
  function autoFillCalendar(){
    const dateEl=document.getElementById('date'); const timeSel=document.getElementById('time');
    if(!dateEl||!timeSel||!global.CloudSlots?.get) return;
    const slots=global.CloudSlots.get()||[];
    if(!slots.length) return;
    const days=[...new Set(slots.map(s=> (global.Helpers?global.Helpers.ymd(s.when):new Date(s.when).toISOString().slice(0,10))))];
    if(!dateEl.value){ dateEl.value = days[0]; }
    const dateKey=dateEl.value;
    const times=slots.filter(s=> (global.Helpers?global.Helpers.ymd(s.when):new Date(s.when).toISOString().slice(0,10))===dateKey)
                     .sort((a,b)=> new Date(a.when)-new Date(b.when));
    timeSel.innerHTML='';
    times.forEach(s=>{const t=new Date(s.when);const o=document.createElement('option');o.value=s.id;o.textContent=`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;timeSel.appendChild(o);});
  }
  global.ModCalendar = global.ModCalendar || { autoFillCalendar };
})(window);
