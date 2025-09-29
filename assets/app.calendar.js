(function(global){
  function fillTimes(){
    const dateEl=document.getElementById('date'); const timeSel=document.getElementById('time');
    if(!dateEl||!timeSel)return;
    const slots=global.CloudSlots.get()||[];
    const dateKey=dateEl.value;
    const times=slots.filter(s=>Helpers.ymd(s.when)===dateKey).sort((a,b)=>new Date(a.when)-new Date(b.when));
    timeSel.innerHTML='';
    if(!times.length){const o=document.createElement('option');o.value='';o.textContent='Brak wolnych godzin';timeSel.appendChild(o);timeSel.disabled=true;return;}
    times.forEach(s=>{const t=new Date(s.when);const hh=String(t.getHours()).padStart(2,'0');const mm=String(t.getMinutes()).padStart(2,'0');const o=document.createElement('option');o.value=s.id;o.textContent=`${hh}:${mm}`;timeSel.appendChild(o);});
    timeSel.disabled=false;
  }
  global.addEventListener('slots-synced',()=>{
    const dateEl=document.getElementById('date'); if(!dateEl)return;
    const slots=global.CloudSlots.get()||[].sort((a,b)=>new Date(a.when)-new Date(b.when));
    if(!slots.length){fillTimes();return;}
    const days=[...new Set(slots.map(s=>Helpers.ymd(s.when)))];
    dateEl.min=days[0]; dateEl.max=days[days.length-1];
    if(!dateEl.value){dateEl.value=days[0];dateEl.dispatchEvent(new Event('change',{bubbles:true}));} else {fillTimes();}
  });
  document.addEventListener('change',(e)=>{if(e.target&&e.target.id==='date')fillTimes();});
  document.addEventListener('DOMContentLoaded',async()=>{if(global.CloudSlots?.pull)await global.CloudSlots.pull();});
})(window);
