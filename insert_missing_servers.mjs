import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function addMissingServers() {
  const missingServers = [
    { matricula: '007414-01', name: 'CLEUDY FRANCO NUNES FARIAS', hire_date: '2008-07-07', role: 'Téc. Endemias' },
    { matricula: '004496-02', name: 'DANILO ALMEIDA FONSECA SANTOS', hire_date: '2008-07-07', role: 'Téc. Endemias' },
    { matricula: '007415-01', name: 'DANYELE DOS SANTOS DIAS', hire_date: '2008-07-07', role: 'Téc. Endemias' },
    { matricula: '006763-02', name: 'EDNA SILVA DOS SANTOS', hire_date: '2008-07-07', role: 'Téc. Endemias' },
    { matricula: '008655-02', name: 'ELISSANDRO SANTOS DE OLIVEIRA', hire_date: '2009-11-26', role: 'Téc. Endemias' }
  ];

  for (const server of missingServers) {
    const { data, error } = await supabase
      .from('servers')
      .insert([server])
      .select();

    if (error) {
      console.error(`Error inserting ${server.name}:`, error);
    } else {
      console.log(`Inserted: ${server.name}`);
    }
  }
}

addMissingServers();
