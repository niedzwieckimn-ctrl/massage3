(function(global){
  async function load(client_id){
    const client = await sb.from('clients').select('*').eq('id',client_id).single();
    const details = await sb.from('client_details').select('*').eq('client_id',client_id).maybeSingle();
    const notes = await sb.from('client_notes').select('*').eq('client_id',client_id).order('created_at',{ascending:false});
    return { client: client.data, details: details.data, notes: notes.data };
  }
  async function saveDetails(client_id, data){
    return await sb.from('client_details').upsert({ ...data, client_id });
  }
  async function addSessionNote(client_id, {title, body}){
    return await sb.from('client_notes').insert([{ client_id, note_type:'session', title, body }]);
  }
  async function addSuggestion(client_id, {body}){
    return await sb.from('client_notes').insert([{ client_id, note_type:'suggestion', body }]);
  }
  async function buildSuggestion(client_id){
    const { client, details, notes } = await load(client_id);
    const latestSession = (notes||[]).find(n=>n.note_type==='session');
    const lines = [];
    lines.push(`Pacjent: ${client?.name||''}`);
    if(details){
      if(details.allergies) lines.push(`Alergie: ${details.allergies}`);
      if(details.conditions) lines.push(`Choroby/Urazy: ${details.conditions}`);
      if(details.medications) lines.push(`Leki: ${details.medications}`);
      if(details.contraindications) lines.push(`Przeciwwskazania: ${details.contraindications}`);
      if(details.focus_areas) lines.push(`Obszary do pracy: ${details.focus_areas}`);
      if(details.avoid_areas) lines.push(`Obszary do pominięcia: ${details.avoid_areas}`);
      if(details.pressure) lines.push(`Preferowana intensywność: ${details.pressure}`);
      if(details.session_goal) lines.push(`Cel terapii: ${details.session_goal}`);
    }
    if(latestSession) lines.push(`Ostatnia notatka: ${latestSession.title||''} — ${latestSession.body}`);
    lines.push(`Sugestia: Kontynuować terapię zgodnie z celem i preferencjami, z etapowym monitorowaniem reakcji tkanek.`);
    return lines.join('\n');
  }
  global.ModClients = global.ModClients || { load, saveDetails, addSessionNote, addSuggestion, buildSuggestion };
})(window);

// assets/supabase-client.js
const URL  = 'https://TWÓJ-PROJEKT.supabase.co';
const ANON = 'TWÓJ_PUBLICZNY_ANON_KEY';
window.sb = supabase.createClient(URL, ANON);
