import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kcfhpgviahnycusjlonj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const content = fs.readFileSync('src/pages/Ferias_old_utf8.tsx', 'utf-8');
  
  // Extract FERIAS_DATA array string
  const startIndex = content.indexOf('const FERIAS_DATA = [');
  let endIndex = content.indexOf('];', startIndex);
  if (endIndex === -1) {
      endIndex = content.indexOf(']', startIndex);
  }
  
  const arrayString = content.substring(startIndex, endIndex + 2);
  
  // Safely evaluate it
  let FERIAS_DATA;
  try {
      eval(arrayString.replace('const FERIAS_DATA =', 'FERIAS_DATA ='));
  } catch(e) {
      console.error('Failed to parse FERIAS_DATA', e);
      return;
  }

  const historicoObj = {};
  for (const d of FERIAS_DATA) {
      historicoObj[d.matricula] = {
          admissao: d.admissao,
          feriasVencidas: d.feriasVencidas
      };
      
      // Update the database
      const [day, month, year] = d.admissao.split('/');
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      const { error } = await supabase.from('servers').update({ hire_date: isoDate }).eq('matricula', d.matricula);
      if (error) {
          console.error(`Failed to update ${d.matricula}:`, error.message);
      } else {
          console.log(`Updated hire_date for ${d.matricula} to ${isoDate}`);
      }
  }

  // Generate src/data/historicoFerias.ts
  const outputTs = `export const HISTORICO_FERIAS: Record<string, { admissao: string, feriasVencidas: number }> = ${JSON.stringify(historicoObj, null, 2)};\n`;
  if (!fs.existsSync('src/data')) {
    fs.mkdirSync('src/data');
  }
  fs.writeFileSync('src/data/historicoFerias.ts', outputTs);
  console.log('Created src/data/historicoFerias.ts');
}

run();
