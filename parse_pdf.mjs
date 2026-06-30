import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Parse PDF text from pdf_text.txt
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
      const ferias = parseInt(match[2], 10);
      const adm = match[3];
      
      const index = line.indexOf(mat);
      const lineBeforeMat = line.substring(0, index).trim();
      let name = lineBeforeMat;
      if (!name && i > 0) {
        let j = i - 1;
        const nameParts = [];
        while (j >= 0 && !allLines[j].includes('Matrícula:') && !allLines[j].match(regex) && !allLines[j].includes('PREFEITURA') && !allLines[j].includes('FUNDO') && !allLines[j].includes('Governo') && !allLines[j].includes('Listagem') && !allLines[j].includes('Ordem:') && !allLines[j].includes('Usuário:')) {
          nameParts.unshift(allLines[j]);
          j--;
        }
        name = nameParts.join(' ');
      }
      
      if (!pdfRecords.some(r => r.matricula === mat)) {
        pdfRecords.push({
          name: name.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim(),
          matricula: mat,
          feriasVencidas: ferias,
          admissao: adm
        });
      }
    }
  }

  return pdfRecords;
}

// Normalize name for matching (removes accents, lowercase, strips spaces)
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, ' ')      // remove non-alphanumeric
    .replace(/\s+/g, ' ')            // collapse multiple spaces
    .trim();
}

async function run() {
  const pdfRecords = parsePdfText();
  
  const { data: dbServers, error } = await supabase
    .from('servers')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching servers:', error);
    return;
  }

  console.log(`Matching ${dbServers.length} DB servers with ${pdfRecords.length} PDF records...\n`);

  const updates = [];
  const unmatchedDb = [];
  const newHistorico = {};

  for (const dbServer of dbServers) {
    const dbNormMat = dbServer.matricula.replace(/[-_]/g, '');
    const dbNormName = normalizeName(dbServer.name);

    // Try matching by matricula first
    let pdfMatch = pdfRecords.find(r => r.matricula === dbNormMat || r.matricula === dbServer.matricula);

    // If not found by matricula, try matching by name
    if (!pdfMatch) {
      pdfMatch = pdfRecords.find(r => normalizeName(r.name) === dbNormName);
    }

    // Special cases for Djenane and Dorival (correct date is 20/11/2009)
    let finalHireDate;
    let finalAdmissionDate;
    let finalVacation;

    if (dbNormName.includes('djenane da silva ferreira') || dbNormName.includes('dorival sousa dias')) {
      finalHireDate = '2009-11-20';
      finalAdmissionDate = '20/11/2009';
      finalVacation = pdfMatch ? pdfMatch.feriasVencidas : 0;
    } else if (pdfMatch) {
      // Standard match from PDF
      const [d, m, y] = pdfMatch.admissao.split('/');
      finalHireDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      finalAdmissionDate = pdfMatch.admissao;
      finalVacation = pdfMatch.feriasVencidas;
    }

    if (pdfMatch || finalHireDate) {
      const dbHireDateISO = dbServer.hire_date || '';
      const finalHireDateISO = finalHireDate;
      
      const hireDateChanged = dbHireDateISO !== finalHireDateISO;
      const matriculaChanged = pdfMatch && pdfMatch.matricula !== dbNormMat;

      let updatedMatricula = dbServer.matricula;
      if (matriculaChanged) {
        // preserve the dash if old had it
        if (dbServer.matricula.includes('-')) {
          const suffix = dbServer.matricula.split('-')[1];
          // E.g. 00558602 -> 005586-02
          const prefix = pdfMatch.matricula.substring(0, pdfMatch.matricula.length - suffix.length);
          updatedMatricula = `${prefix}-${suffix}`;
        } else if (dbServer.matricula.includes('_')) {
          const suffix = dbServer.matricula.split('_')[1];
          const prefix = pdfMatch.matricula.substring(0, pdfMatch.matricula.length - suffix.length);
          updatedMatricula = `${prefix}_${suffix}`;
        } else {
          updatedMatricula = pdfMatch.matricula;
        }
      }

      updates.push({
        id: dbServer.id,
        name: dbServer.name,
        oldMatricula: dbServer.matricula,
        newMatricula: updatedMatricula,
        oldHireDate: dbHireDateISO,
        newHireDate: finalHireDateISO,
        hireDateChanged,
        matriculaChanged,
        pdfMatchName: pdfMatch ? pdfMatch.name : 'N/A (Special override)',
      });

      // Add to HISTORICO_FERIAS
      const normKey = updatedMatricula.replace(/[-_]/g, '');
      newHistorico[normKey] = {
        admissao: finalAdmissionDate,
        feriasVencidas: finalVacation
      };

    } else {
      unmatchedDb.push(dbServer);
      // Keep existing values in HISTORICO_FERIAS
      const normKey = dbServer.matricula.replace(/[-_]/g, '');
      const dbHireDate = dbServer.hire_date ? dbServer.hire_date.split('-').reverse().join('/') : '07/07/2008';
      newHistorico[normKey] = {
        admissao: dbHireDate,
        feriasVencidas: 0
      };
    }
  }

  console.log(`=== MATCHING RESULTS ===`);
  console.log(`Successfully matched: ${updates.length}`);
  console.log(`Unmatched: ${unmatchedDb.length}\n`);

  console.log(`=== PENDING DB CHANGES (DRY RUN) ===`);
  let changesCount = 0;
  for (const u of updates) {
    if (u.hireDateChanged || u.matriculaChanged) {
      console.log(`Server: ${u.name}`);
      if (u.matriculaChanged) console.log(`  - Matricula: ${u.oldMatricula} -> ${u.newMatricula}`);
      if (u.hireDateChanged) console.log(`  - Hire Date: ${u.oldHireDate} -> ${u.newHireDate}`);
      changesCount++;
    }
  }
  console.log(`Total servers requiring DB update: ${changesCount}\n`);

  console.log(`=== UNMATCHED SERVERS ===`);
  for (const s of unmatchedDb) {
    console.log(`- ${s.name} (${s.matricula}) | hire_date: ${s.hire_date}`);
  }

  // Write new historico to a preview file
  fs.writeFileSync('historico_preview.json', JSON.stringify(newHistorico, null, 2), 'utf-8');
}

run();
