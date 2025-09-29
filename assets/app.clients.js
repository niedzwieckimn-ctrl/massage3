(function(global){
  async function load(client_id){
    let client=await sb.from('clients').select('*').eq('id',client_id).single();
    let details=await sb.from('client_details').select('*').eq('client_id',client_id).maybeSingle();
    let notes=await sb.from('client_notes').select('*').eq('client_id',client_id).order('created_at',{ascending:false});
    return {client:client.data,details:details.data,notes:notes.data};
  }
  async function saveDetails(client_id,data){return await sb.from('client_details').upsert({...data,client_id});}
  async function addSessionNote(client_id,{title,body}){return await sb.from('client_notes').insert([{client_id,note_type:'session',title,body}]);}
  async function addSuggestion(client_id,{body}){return await sb.from('client_notes').insert([{client_id,note_type:'suggestion',body}]);}
  async function buildSuggestion(client_id){
    const {client,details,notes}=await load(client_id);
    const latestSession=(notes||[]).find(n=>n.note_type==='session');
    let text=`Pacjent: ${client.name}\n`;
    if(details){ if(details.allergies) text+=`Alergie: ${details.allergies}\n`; if(details.conditions) text+=`Choroby/Urazy: ${details.conditions}\n`; }
    if(latestSession){text+=`Ostatnia notatka: ${latestSession.body}\n`; }
    text+=`Sugestia: Zaleca się kontynuację terapii z uwzględnieniem powyższych danych.`;
    return text;
  }
  global.Clients={load,saveDetails,addSessionNote,addSuggestion,buildSuggestion};
})(window);
