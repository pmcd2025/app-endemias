import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Try to find the exact target first
  let { data: servers } = await supabase.from('servers').select('*').eq('matricula', '00011122');
  
  if (!servers || servers.length === 0) {
    console.log('No server with 00011122 found, checking Zilma...');
    const res = await supabase.from('servers').select('*').ilike('name', '%Zilma%');
    servers = res.data;
  }
  
  console.log('Found:', servers);
  
  if (servers && servers.length > 0) {
    const target = servers[0]; // Take the first one matching
    console.log('Updating target:', target.id, target.name, target.matricula);
    const { data, error } = await supabase.from('servers').update({
      matricula: '01624801',
      name: 'ZILMA PERMINIO DE QUEIROZ CAZAIS',
      hire_date: '2019-04-09'
    }).eq('id', target.id).select();
    
    console.log('Update result:', data, error);
  }
}
run();
