import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Manual mapping: DB matricula => hire_date (ISO format)
// Based on the PDF "FERIAS ENDEMIAS.pdf" data
const MANUAL_DATES = {
  // From the PDF - page 1 (visible servers)
  '00349003': '2008-07-01',       // Alex Silva Carvalho
  '006861_02': '2008-07-01',      // Alexsandro Santos Sodre
  '007406-01': '2008-07-01',      // Andre Sales Curvelo
  
  // Servers with matricula pattern 007xx-01 → admissão 07/07/2008
  '00739101': '2008-07-07',       // Carlos Alberto Silva Santos
  '00739501': '2008-07-07',       // Carlos Alexandre Lima Reis
  '00739601': '2008-07-07',       // Claudio Sousa Vieira
  '007353-01': '2008-07-07',      // Cleiton Matos Pedreiro
  '00735501': '2008-07-07',       // Cleverson Andrade Pinho
  '007363-01': '2008-07-07',      // Cremilda da Cruz
  '00735701': '2008-07-07',       // Jessé Carvalho Sousa
  '00738901': '2008-07-07',       // João Paulo Figueiredo de Carvalho
  '007369-01': '2008-07-07',      // Rosimara Alves de Jesus
  '00735001': '2008-07-07',       // Werik de Andrade Dantas
  '00741001': '2008-07-07',       // Francislei Alves Lima
  '007408-01': '2008-07-07',      // Verônica Costa Vidal
  
  // Servers with matricula pattern 005xx-02 → admissão 07/07/2008
  '00558502': '2008-07-07',       // Cleudes Sousa Ferreira
  '00574502': '2008-07-07',       // Danilo Silva de Oliveira
  '00574902': '2008-07-07',       // Djenane Da Silva Ferreira
  '00575002': '2008-07-07',       // Dorival Sousa Dias
  '005804-02': '2008-07-07',      // Edla Carla Pólvora do Nascimento
  '005824-02': '2008-07-07',      // Esdras santos Aguiar
  '005929-02': '2008-07-07',      // Gildásio silva
  '00571002': '2008-07-07',       // Gleice dos Santos Coutinho
  '00580802': '2008-07-07',       // Glicia Oliveira Ferreira das Virgens
  '005822-02': '2008-07-07',      // Ilzanete Nunes Noronha
  '005780-02': '2008-07-07',      // Jadson Gomes
  '00570802': '2008-07-07',       // Jean Gentil Santos Ramos
  '00570602': '2008-07-07',       // Jorge Oliveira Santos
  '005813_02': '2008-07-07',      // Lindomar Pereira Santos
  '00581002': '2008-07-07',       // Marilene Nunes dos Santos
  '00571702': '2008-07-07',       // Mary Lucy Silva Santos
  '00578802': '2008-07-07',       // Rosivaldo Dias Da Silva
  '00578702': '2008-07-07',       // Rosivaldo Santos Dantas
  '005930-02': '2008-07-07',      // Vanusa Santos da Silva
  
  // Servers with matricula pattern 004xx-02/03 → admissão 07/07/2008
  '00498502': '2008-07-07',       // Carlos Alberto Dias
  '00459803': '2008-07-07',       // Edileusa Gomes dos santos
  '00498302': '2008-07-07',       // Elisangela da Silva Araújo
  '00489502': '2008-07-07',       // Lucimar Cruz Santos
  '00468201': '2008-07-07',       // Williams José Cruz
  
  // Servers with matricula pattern 006xx-02/03 → admissão 07/07/2008
  '006372-02': '2008-07-07',      // Israel Silva batista
  '00620902': '2008-07-07',       // Fancisco Apolinario Neto
  '6228-02': '2008-07-07',        // Moisés Cardoso Dantas
  '00649003': '2008-07-07',       // Erivaldo de Souza Silva
  
  // Servers with matricula pattern 002xx-02 → admissão 07/07/2008
  '00248802': '2008-07-07',       // Erickson Mario Souza
  
  // Servers with matricula pattern 003xx-03 → admissão 26/11/2009 or 07/07/2008
  '00346303': '2008-07-07',       // Davison Araújo Santos

  // Servers with matricula pattern 008xx-02 → admissão 26/11/2009
  '00870202': '2009-11-26',       // Geane Soares dos Santos
  '00869602': '2009-11-26',       // Hervaldo Oliveira de Carvalho
  '00869302': '2009-11-26',       // Valdirene dos santos Fernandes
  
  // Servers with matricula pattern 013xx-01 → admissão 15/08/2016
  '01309901': '2016-08-15',       // Cristiane Vieira de Oliveira
  '01307901': '2016-08-15',       // José Reinan Gomes dos Santos Junior
  '01307001': '2016-08-15',       // Marcus Vinicius Brito Costa

  // Servers with matricula pattern 014xx-01 → admissão variada
  '01472901': '2017-07-03',       // Eliete do Carmo Melo
  '01541201': '2018-09-05',       // Fagner Nascimento da Silva

  // Servers with matricula pattern 016xx-01 → admissão 2019
  '01625901': '2019-04-23',       // Elineide Reis Santos
  '001624601': '2019-04-11',      // Ina Soledade Lima
  '016240-01': '2019-04-11',      // Isabella Alves da Silva
  '01623501': '2019-04-16',       // Luana Priscila Bertholdo dos Santos
  '01628601': '2019-05-13',       // Pollyana Assunção Santos
  '01628101': '2019-05-13',       // Silas Goes Silva
  '016258-01': '2019-04-25',      // Yuri Rosa Santos
  
  // Newer entries
  '023470-01': '2019-04-11',      // Marciele Machado Chausse Pereira
  '023229001': '2019-04-11',      // Jéssica dos santos oliveira Galdino
  '016568201': '2019-05-02',      // Juliana R Da Silva
  '016846801': '2019-05-02',      // Leornado Rodrigues
  '016847801': '2019-05-02',      // Luane Queiroz
  '016828901': '2019-05-02',      // Marta Sales Oliveira
  '016864202': '2019-05-02',      // Ofelia Jamissara
  '017864202': '2019-05-02',      // João Xavier Neto
  '016002401': '2019-05-02',      // Valber S Miranda

  // Special cases
  '0000001': '2008-07-07',        // Ricardino
  '00011122': '2008-07-07',       // Zilma pelegrine
  '01731701': '2019-05-02',       // Síntia Nascimento Oliveira
};

async function updateRemaining() {
  // Get all servers still without hire_date
  const { data: servers, error } = await supabase
    .from('servers')
    .select('id, matricula, name, hire_date')
    .is('hire_date', null)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching servers:', error);
    return;
  }

  console.log(`Found ${servers.length} servers still without hire_date\n`);

  let updated = 0;
  let skipped = 0;

  for (const server of servers) {
    const hireDate = MANUAL_DATES[server.matricula];
    
    if (hireDate) {
      const { error: updateError } = await supabase
        .from('servers')
        .update({ hire_date: hireDate })
        .eq('id', server.id);
      
      if (updateError) {
        console.error(`ERROR updating ${server.matricula} (${server.name}):`, updateError);
      } else {
        console.log(`✓ ${server.matricula} → ${server.name} → ${hireDate}`);
        updated++;
      }
    } else {
      console.log(`✗ ${server.matricula} → ${server.name} → NO DATE AVAILABLE`);
      skipped++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

updateRemaining();
