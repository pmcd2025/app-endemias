import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Load HISTORICO_FERIAS from TS file
function loadHistoricoFerias() {
  const fileContent = fs.readFileSync('src/data/historicoFerias.ts', 'utf-8');
  const startIdx = fileContent.indexOf('= {');
  const endIdx = fileContent.lastIndexOf('}');
  const jsonStr = fileContent.substring(startIdx + 2, endIdx + 1);
  let obj;
  eval('obj = ' + jsonStr);
  return obj;
}

// Parse PDF text
function parsePdfText() {
  const content = fs.readFileSync('pdf_text.txt', 'utf-8');
  const lines = content.split('\n');
  const pdfRecords = [];
  const allLines = lines.map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const regex = /(\d{8})\s+(\d+)\s*\t*(\d{2}\/\d{2}\/\d{4})/;
    const match = line.match(regex);
    if (match) {
      const mat = match[1];
      if (!pdfRecords.some(r => r.matricula === mat)) {
        pdfRecords.push({
          matricula: mat,
          feriasVencidas: parseInt(match[2], 10),
          admissao: match[3],
        });
      }
    }
  }
  return pdfRecords;
}

async function verify() {
  const HISTORICO_FERIAS = loadHistoricoFerias();
  const pdfRecords = parsePdfText();

  const { data: dbServers, error } = await supabase
    .from('servers')
    .select('id, name, matricula, hire_date')
    .order('name', { ascending: true });

  if (error) { console.error('Error:', error); return; }

  let ok = 0;
  let issues = 0;

  console.log('=== VERIFICATION REPORT ===\n');

  for (const server of dbServers) {
    const normMat = server.matricula.replace(/[-_]/g, '');
    const histEntry = HISTORICO_FERIAS[normMat] || HISTORICO_FERIAS[server.matricula];
    const pdfEntry = pdfRecords.find(r => r.matricula === normMat);

    const serverIssues = [];

    // 1) Check that historicoFerias has an entry for every server
    if (!histEntry) {
      serverIssues.push('Missing in HISTORICO_FERIAS');
    }

    // 2) If matched in PDF, check DB hire_date matches PDF
    if (pdfEntry) {
      const expectedISO = pdfEntry.admissao.split('/').reverse().join('-');
      if (server.hire_date !== expectedISO) {
        serverIssues.push(`DB hire_date mismatch: DB=${server.hire_date} vs PDF=${expectedISO}`);
      }
      // 3) Check HISTORICO_FERIAS admissao matches PDF
      if (histEntry && histEntry.admissao !== pdfEntry.admissao) {
        serverIssues.push(`HIST admissao mismatch: HIST=${histEntry.admissao} vs PDF=${pdfEntry.admissao}`);
      }
      // 4) Check HISTORICO_FERIAS feriasVencidas matches PDF
      if (histEntry && histEntry.feriasVencidas !== pdfEntry.feriasVencidas) {
        serverIssues.push(`HIST feriasVencidas mismatch: HIST=${histEntry.feriasVencidas} vs PDF=${pdfEntry.feriasVencidas}`);
      }
    }

    // 5) Check that historicoFerias.admissao aligns with DB hire_date
    if (histEntry && server.hire_date) {
      const histISO = histEntry.admissao.split('/').reverse().join('-');
      if (histISO !== server.hire_date) {
        serverIssues.push(`HIST/DB misalign: HIST=${histISO} vs DB=${server.hire_date}`);
      }
    }

    if (serverIssues.length > 0) {
      console.log(`❌ ${server.name} (${server.matricula})`);
      serverIssues.forEach(i => console.log(`   - ${i}`));
      issues++;
    } else {
      ok++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total servers: ${dbServers.length}`);
  console.log(`✅ Aligned:   ${ok}`);
  console.log(`❌ Issues:    ${issues}`);

  // Specific checks the user asked about
  console.log('\n=== SPECIFIC CHECKS ===');
  const checkNames = [
    'Davison', 'Djenane', 'Dorival',
    'Andre Sales', 'Carlos Alberto Dias', 'Carlos Alberto Silva',
    'Carlos Alexandre', 'Claudio Sousa', 'Cleiton Matos',
    'Cleudes Sousa', 'Cleverson Andrade', 'Cremilda',
    'Cristiane Vieira', 'Danilo Silva', 
  ];
  for (const name of checkNames) {
    const match = dbServers.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
    if (match) {
      const normMat = match.matricula.replace(/[-_]/g, '');
      const hist = HISTORICO_FERIAS[normMat];
      console.log(`${match.name} (${match.matricula}): DB hire_date=${match.hire_date} | HIST admissao=${hist?.admissao || 'MISSING'} | HIST ferias=${hist?.feriasVencidas ?? 'MISSING'}`);
    } else {
      console.log(`${name}: NOT FOUND IN DB`);
    }
  }
}

verify();
