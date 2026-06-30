import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Parse PDF text ──────────────────────────────────────────────────────
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
        while (
          j >= 0 &&
          !allLines[j].includes('Matrícula:') &&
          !allLines[j].match(regex) &&
          !allLines[j].includes('PREFEITURA') &&
          !allLines[j].includes('FUNDO') &&
          !allLines[j].includes('Governo') &&
          !allLines[j].includes('Listagem') &&
          !allLines[j].includes('Ordem:') &&
          !allLines[j].includes('Usuário:')
        ) {
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
          admissao: adm,
        });
      }
    }
  }
  return pdfRecords;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function admissaoToISO(admissao) {
  const [d, m, y] = admissao.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Main ────────────────────────────────────────────────────────────────
async function run() {
  const pdfRecords = parsePdfText();
  console.log(`Parsed ${pdfRecords.length} records from PDF.\n`);

  const { data: dbServers, error } = await supabase
    .from('servers')
    .select('*')
    .order('name', { ascending: true });

  if (error) { console.error('Error fetching servers:', error); return; }
  console.log(`Fetched ${dbServers.length} servers from DB.\n`);

  // ── Build the new historicoFerias map AND detect DB updates ─────────
  const newHistorico = {};   // normMat → { admissao, feriasVencidas }
  let dbUpdated = 0;
  let dbErrors = 0;

  for (const server of dbServers) {
    const dbNormMat = server.matricula.replace(/[-_]/g, '');
    const dbNormName = normalizeName(server.name);

    // 1) Try matching by normalised matricula
    let pdfMatch = pdfRecords.find(r => r.matricula === dbNormMat);

    // 2) Fall back to name match
    if (!pdfMatch) {
      pdfMatch = pdfRecords.find(r => normalizeName(r.name) === dbNormName);
    }

    let finalAdmissao;   // DD/MM/YYYY  (for historicoFerias)
    let finalHireDate;   // YYYY-MM-DD  (for DB)
    let finalVacation;

    if (pdfMatch) {
      finalAdmissao = pdfMatch.admissao;
      finalHireDate = admissaoToISO(pdfMatch.admissao);
      finalVacation = pdfMatch.feriasVencidas;
    } else {
      // Keep existing DB value for servers not in the PDF
      const existing = server.hire_date || '2008-07-07';
      finalHireDate = existing;
      finalAdmissao = existing.split('-').reverse().join('/');
      finalVacation = 0;
    }

    // ── Update DB hire_date if it differs ──────────────────────────────
    if (server.hire_date !== finalHireDate) {
      const { error: updErr } = await supabase
        .from('servers')
        .update({ hire_date: finalHireDate })
        .eq('id', server.id);

      if (updErr) {
        console.error(`ERROR updating ${server.name} (${server.matricula}):`, updErr.message);
        dbErrors++;
      } else {
        console.log(`✓ DB updated: ${server.name} | ${server.hire_date} → ${finalHireDate}`);
        dbUpdated++;
      }
    }

    // ── Populate historicoFerias entry ─────────────────────────────────
    newHistorico[dbNormMat] = {
      admissao: finalAdmissao,
      feriasVencidas: finalVacation,
    };
  }

  console.log(`\n=== DB SUMMARY ===`);
  console.log(`Updated: ${dbUpdated}  |  Errors: ${dbErrors}`);

  // ── Write new historicoFerias.ts ────────────────────────────────────
  const tsContent =
    `export const HISTORICO_FERIAS: Record<string, { admissao: string, feriasVencidas: number }> = ${JSON.stringify(newHistorico, null, 2)};\n`;

  fs.writeFileSync('src/data/historicoFerias.ts', tsContent, 'utf-8');
  console.log(`\n✓ Regenerated src/data/historicoFerias.ts with ${Object.keys(newHistorico).length} entries.\n`);
}

run();
