(function(global){
  const LS_KEY='slots';
  async function pull(){
    try {
      let {data,error}=await global.sb.from('free_slots').select('id,when,taken').order('when',{ascending:true});
      if(error) throw error;
      const today=new Date(); today.setHours(0,0,0,0);
      const cleaned=(data||[]).filter(s=>(!s.taken)&&new Date(s.when)>=today);
      localStorage.setItem(LS_KEY,JSON.stringify(cleaned));
      global.dispatchEvent(new Event('slots-synced'));
    } catch(e){ console.error('[cloud-slots] pull error',e); localStorage.setItem(LS_KEY,'[]'); global.dispatchEvent(new Event('slots-synced'));}
  }
  function get(){ try{return JSON.parse(localStorage.getItem(LS_KEY)||'[]')}catch{return []}}
  global.CloudSlots={pull,get};
})(window);
