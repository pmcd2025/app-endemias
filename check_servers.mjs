import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function searchMissing() {
  // Search for specific names from the PDF that might be missing
  const namesToCheck = [
    'Edna', 'Cleudy', 'Danyele', 'Danilo Almeida',
    'Elissandro', 'Euclides', 'Clodoaldo'
  ];

  for (const name of namesToCheck) {
    const { data, error } = await supabase
      .from('servers')
      .select('id, matricula, name, hire_date')
      .ilike('name', `%${name}%`);
    
    if (error) {
      console.error(`Error searching ${name}:`, error);
      continue;
    }
    
    if (data.length === 0) {
      console.log(`✗ "${name}" → NOT FOUND IN DATABASE`);
    } else {
      data.forEach(s => {
        console.log(`✓ "${name}" → Found: ${s.matricula} | ${s.name} | hire_date: ${s.hire_date || 'NULL'}`);
      });
    }
  }

  // Get the total count of all servers
  const { data: allServers, error: allErr } = await supabase
    .from('servers')
    .select('id, matricula, name')
    .order('name', { ascending: true });
    
  if (!allErr) {
    console.log(`\n=== TOTAL SERVERS IN DATABASE: ${allServers.length} ===`);
  }

  // Check specific matriculas from the PDF pages
  const matriculasFromPDF = [
    '00676702',  // possibly Edna
    '00711401',  // Cleudy?
    '00711501',  // Danyele?
    '00449602',  // Danilo Almeida?
    '01309001',  // Elissandro?
  ];

  console.log('\n=== CHECKING SPECIFIC MATRICULAS FROM PDF ===');
  for (const mat of matriculasFromPDF) {
    const { data, error } = await supabase
      .from('servers')
      .select('id, matricula, name, hire_date')
      .eq('matricula', mat);
    
    if (error) {
      console.error(`Error checking ${mat}:`, error);
    } else if (data.length === 0) {
      // Try with different formats
      const { data: data2 } = await supabase
        .from('servers')
        .select('id, matricula, name, hire_date')
        .ilike('matricula', `%${mat.replace(/^0+/, '')}%`);
      
      if (data2 && data2.length > 0) {
        data2.forEach(s => console.log(`  ${mat} → Partial match: ${s.matricula} | ${s.name}`));
      } else {
        console.log(`  ${mat} → NOT FOUND`);
      }
    } else {
      console.log(`  ${mat} → ${data[0].name} | hire_date: ${data[0].hire_date || 'NULL'}`);
    }
  }
}

searchMissing();
